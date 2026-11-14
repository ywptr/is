import { canonicalConsumerRequest } from '../src/lib/nexus-consumer/public-request.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SignJWT, generateKeyPair, exportJWK, decodeJwt } from 'jose';
import { deriveDpopAth, deriveDpopJkt } from 'better-auth/oauth2';
import { createIdentityCredentialAdapter, CredentialError, resolveSubject } from '../src/lib/identity/access-credentials.ts';

const issuer = 'https://identity.example.test/api/auth';
const audience = 'https://nexus.example.test/api/nexus/v1';
const url = audience + '/me/tenants';
const policy = { issuer, audience, environment: 'test' };
const signing = await generateKeyPair('EdDSA');
const publicJwk = await exportJWK(signing.publicKey);
const sender = await generateKeyPair('ES256');
const senderJwk = await exportJWK(sender.publicKey);
const jkt = await deriveDpopJkt(senderJwk);
const scope = 'nexus:tenants:read';
const requirements = { scopes: [scope] };
async function token(overrides = {}, typ = 'at+jwt', key = signing.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: issuer, aud: audience, sub: 'opaque-provider-subject', client_id: 'client',
    sid: 'session', jti: randomUUID(), iat: now, exp: now + 300, scope, cnf: { jkt }, ...overrides };
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
  return new SignJWT(payload).setProtectedHeader({ alg: 'EdDSA', typ }).sign(key);
}
async function request(access, overrides = {}) {
  const claims = { htm: 'GET', htu: url, ath: await deriveDpopAth(access), nonce: 'fixture-server-nonce',
    iat: Math.floor(Date.now() / 1000), jti: randomUUID(), ...overrides };
  const proof = await new SignJWT(claims).setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: senderJwk }).sign(sender.privateKey);
  return new Request(url, { headers: { authorization: `DPoP ${access}`, dpop: proof } });
}
function fixture(options = {}) {
  const reservations = new Set();
  const dependencies = {
    jwksFetch: async () => ({ keys: [publicJwk] }),
    // Test doubles only. Production shared replay is covered by real provider PG suite.
    replayStore: { reserve: ({ key }) => { if (reservations.has(key)) return false; reservations.add(key); return true; } },
    nonce: { validate: async ({ proof }) => {
      // Only tests adapter composition; this is NOT an implementation of nonce policy.
      if (decodeJwt(proof).nonce !== 'fixture-server-nonce') throw new CredentialError('invalid_dpop_proof');
    } },
    readCurrentState: async reference => ({ active: true, revoked: false, clientActive: true, userActive: true,
      sessionActive: true, grantClass: 'human_authorization_code', reference, subjectMappings: [{ issuer: reference.issuer, subject: reference.subject, clientId: reference.clientId, namespace: 'provider_access_subject', userId: 'proven-is-user' }],
      applicationId: 'registered-app', ...options.state }),
    ...options.dependencies,
  };
  return createIdentityCredentialAdapter(policy, dependencies);
}
async function rejects(adapter, req, code = 'invalid_token', required = requirements) {
  await assert.rejects(adapter.validateAccessCredential(req, required), e => e instanceof CredentialError && e.code === code && e.message === code);
}
test('verified human context uses authoritative mapping, never sub UUID/email inference', async () => {
  const result = await fixture().validateAccessCredential(await request(await token()), requirements);
  assert.equal(result.userId, 'proven-is-user'); assert.equal(result.applicationId, 'registered-app');
  assert.equal(result.subject, 'opaque-provider-subject'); assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.scopes)); assert.equal(result.keyThumbprint, jkt);
});
test('strict JWT profile rejects substitution, issuer/audience, expiry, claims and forgery', async t => {
  const now = Math.floor(Date.now() / 1000);
  const vectors = [{ iss: 'https://wrong.example.test' }, { aud: 'wrong' }, { aud: [audience, issuer] },
    { aud: [audience] }, { exp: now - 1 }, { iat: now + 10 }, { iat: now, exp: now + 301 }, { nbf: now + 10 },
    { sub: '' }, { sub: 42 }, { client_id: '' }, { sid: '' }, { scope: '' }, { scope: `${scope} offline_access` },
    { scope: `${scope} ${scope}` }, { cnf: {} }, { cnf: { jkt: [] } }, { act: { sub: 'actor' } }];
  for (const claim of ['iss', 'sub', 'aud', 'exp', 'iat', 'jti', 'client_id', 'sid', 'scope', 'cnf']) vectors.push({ [claim]: undefined });
  for (const [i, vector] of vectors.entries()) await t.test(`invalid claim vector ${i}`, async () => rejects(fixture(), await request(await token(vector))));
  await rejects(fixture(), await request(await token({}, 'JWT')));
  await rejects(fixture(), await request(await token({}, 'at+jwt', (await generateKeyPair('EdDSA')).privateKey)));
});
test('DPoP binds key, hash, actual URL and method; rejects absent, stale and reused proofs', async () => {
  const access = await token();
  for (const override of [{ htm: 'POST' }, { htu: url + '/other' }, { ath: 'wrong' }, { iat: 1 }])
    await rejects(fixture(), await request(access, override), 'invalid_dpop_proof');
  await rejects(fixture(), await request(await token({ cnf: { jkt: 'wrong-key' } })), 'invalid_dpop_proof');
  const valid = await request(access); const adapter = fixture();
  const results = await Promise.allSettled([adapter.validateAccessCredential(valid, requirements), adapter.validateAccessCredential(valid, requirements)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  await rejects(fixture(), new Request(url, { headers: { authorization: `DPoP ${access}` } }), 'invalid_dpop_proof');
  await rejects(fixture(), new Request(url, { headers: { authorization: `Bearer ${access}` } }));
  const forwarded = await request(access);
  await rejects(fixture(), new Request('https://wrong.example.test/me', { headers: forwarded.headers }), 'invalid_dpop_proof');
  await rejects(fixture(), new Request(url.replace('https:', 'http:'), { headers: forwarded.headers }), 'invalid_dpop_proof');
});
test('nonce dependency is mandatory and no missing/arbitrary nonce bypasses it', async () => {
  for (const nonce of [undefined, 'arbitrary', 'expired-server-nonce'])
    await rejects(fixture(), await request(await token(), { nonce }), 'invalid_dpop_proof');
  await rejects(fixture({ dependencies: { nonce: undefined } }), await request(await token()), 'identity_unavailable');
});
test('current state denies revoked/disabled/unknown credentials and cross-environment bindings', async () => {
  for (const state of [{ active: false }, { revoked: true }, { clientActive: false }, { sessionActive: false },
    { userActive: false }, { revoked: undefined }, { clientActive: undefined }, { grantClass: 'client_credentials' }, { subjectMappings: [] }, { applicationId: '' },
    { reference: { environment: 'production' } }, { subjectMappings: [{ namespace: 'unknown' }] }])
    await rejects(fixture({ state }), await request(await token()));
  await rejects(fixture({ dependencies: { readCurrentState: async () => null } }), await request(await token()));
});
test('pairwise resolver requires explicit issuance mapping; absent/ambiguous mapping denies', async () => {
  const mapping = { issuer, subject: 'pairwise-value', clientId: 'client', namespace: 'pairwise', userId: 'explicitly-linked-user' };
  const adapter = fixture({ state: { subjectMappings: [mapping] } });
  const result = await adapter.validateAccessCredential(await request(await token({ sub: 'pairwise-value' })), requirements);
  assert.equal(result.userId, 'explicitly-linked-user');
  assert.equal(resolveSubject(result, [mapping, mapping]), null);
  assert.equal(resolveSubject(result, [{ ...mapping, issuer: 'wrong' }]), null);
  assert.equal(resolveSubject(result, [{ ...mapping, clientId: 'other-client' }]), null);
  await rejects(fixture({ dependencies: { readCurrentState: async () => null } }), await request(await token({ sub: 'looks-like-user-id' })));
});
test('missing/unavailable dependencies fail closed with sanitized errors', async () => {
  await rejects(createIdentityCredentialAdapter(policy), await request(await token()), 'identity_unavailable');
  for (const dependencies of [{ jwksFetch: async () => { throw Error('secret'); } },
    { replayStore: { reserve: async () => { throw Error('secret'); } } },
    { nonce: { validate: async () => { throw Error('secret'); } } },
    { readCurrentState: async () => { throw Error('secret'); } }, { readCurrentState: undefined }])
    await rejects(fixture({ dependencies }), await request(await token()), 'identity_unavailable');
});
test('endpoint scopes are checked and configuration never accepts HTTP', async () => {
  await rejects(fixture(), await request(await token()), 'insufficient_scope', { scopes: ['nexus:access:evaluate'] });
  assert.throws(() => createIdentityCredentialAdapter({ ...policy, issuer: 'http://localhost/api/auth' }));
});

test('bind-origin transport preserves external DPoP target, method, nonce, hash, key and replay checks', async () => {
  const access=await token(), origin=new URL(url).origin, bind='https://0.0.0.0:5180';
  const transport=async(overrides={})=>{
    const signed=await request(access,overrides);
    const headers=new Headers(signed.headers);headers.set('host',new URL(origin).host);
    return canonicalConsumerRequest(new Request(bind+new URL(url).pathname,{headers}),origin,bind);
  };
  const adapter=fixture();const valid=await transport();
  assert.equal(valid.url,url);assert.equal(valid.method,'GET');
  await adapter.validateAccessCredential(valid,requirements);
  await rejects(adapter,valid,'invalid_dpop_proof');
  for(const vector of [{htu:bind+new URL(url).pathname},{htu:url+'/wrong'},{htm:'POST'},{ath:'wrong'},{nonce:'wrong'}])
    await rejects(fixture(),await transport(vector),'invalid_dpop_proof');
});
