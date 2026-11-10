// Protocol spike only: isolated provider + new disposable PostgreSQL cluster.
// Never imports the application's auth/database modules or reads DATABASE_URL.
import { test } from 'node:test';
import { createIdentityCredentialAdapter, CredentialError } from '../../src/lib/identity/access-credentials.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import pg from 'pg';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getMigrations } from 'better-auth/db/migration';
import { jwt, testUtils } from 'better-auth/plugins';
import * as provider from '@better-auth/oauth-provider';
import { generateKeyPair, exportJWK, SignJWT, decodeJwt, decodeProtectedHeader, jwtVerify, importJWK } from 'jose';
import { generateCodeChallenge, deriveDpopAth, deriveDpopJkt, createDpopReplayStore, verifyDpopProof,
  enforceDpopBinding, verifyJwsAccessToken, signPrivateKeyJwtClientAssertion } from 'better-auth/oauth2';

const origin = 'https://identity-spike.example.test';
const issuer = `${origin}/api/auth`;
const resource = 'https://nexus-spike.example.test/api/nexus/v1';
const callback = 'https://consumer-spike.example.test/callback';
const scope = 'nexus:tenants:read';
const tokenUrl = `${issuer}/oauth2/token`;
let auth;
const createAuth = (database, seed = true, overrides = {}) => betterAuth({
  baseURL: origin, secret: 'isolated-compatibility-spike-secret-0000000000000000',
  database, emailAndPassword: { enabled: false },
  disabledPaths: ['/token'], logger: { level: 'error', disabled: !seed }, rateLimit: { enabled: false },
  plugins: [jwt({ disableSettingJwtHeader: true }), testUtils(), provider.oauthProvider({
    loginPage: '/sign-in', consentPage: '/consent',
    allowDynamicClientRegistration: false, allowUnauthenticatedClientRegistration: false,
    clientPrivileges: async () => true, // Only this isolated test instance.
    scopes: ['openid', 'profile', 'email', scope], assertionMaxLifetime: 60, accessTokenExpiresIn: 300,
    pairwiseSecret: 'isolated-pairwise-secret-000000000000000000',
    resources: seed ? [{ identifier: resource, allowedScopes: ['openid', scope], dpopBoundAccessTokensRequired: true }] : [],
    enforcePerClientResources: true, dpop: { signingAlgorithms: ['ES256'], proofMaxAgeSeconds: 60 },
    ...overrides,
  })],
});

async function proof(key, url, method = 'POST', token, claims = {}) {
  return new SignJWT({ htm: method, htu: url, ...(token ? { ath: await deriveDpopAth(token) } : {}), ...claims })
    .setProtectedHeader({ typ: 'dpop+jwt', alg: 'ES256', jwk: key.publicJwk })
    .setJti(randomUUID()).setIssuedAt().sign(key.privateKey);
}
async function keyPair() {
  const keys = await generateKeyPair('ES256', { extractable: true });
  return { ...keys, publicJwk: { ...await exportJWK(keys.publicKey), kid: randomUUID(), alg: 'ES256', use: 'sig' },
    privateJwk: await exportJWK(keys.privateKey) };
}
async function post(path, body, headers = {}) {
  const response = await auth.handler(new Request(`${issuer}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body),
  }));
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

// The parent test keeps fixtures private and runs stateful probes sequentially.
test('pinned Identity protocol compatibility (disposable PostgreSQL)', { timeout: 120000 }, async t => {
  const bin = process.env.IS_MEMBERSHIP_PG_BIN;
  assert.ok(bin, 'Set IS_MEMBERSHIP_PG_BIN; existing DATABASE_URL is never used');
  const run = promisify(execFile);
  const dir = await mkdtemp(join(tmpdir(), 'is-identity-spike-'));
  const socket = join(dir, 'socket'); await mkdir(socket);
  const cluster = join(dir, 'data');
  const pool = new pg.Pool({ host: socket, port: 55440, user: 'is_identity_spike', database: 'postgres', max: 8 });
  let started = false;
  t.after(async () => {
    await pool.end();
    if (started) await run(join(bin, 'pg_ctl'), ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
    await rm(dir, { recursive: true, force: true });
  });
  await run(join(bin, 'initdb'), ['-D', cluster, '-U', 'is_identity_spike', '--auth=trust', '--no-locale']);
  await run(join(bin, 'pg_ctl'), ['-D', cluster, '-l', join(dir, 'postgres.log'), '-o', `-F -h '' -k ${socket} -p 55440`, '-w', 'start']);
  started = true;
  const schemaAuth = createAuth(pool, false);
  const plan = await getMigrations(schemaAuth.options);
  await plan.runMigrations(); // Only the new disposable synthetic cluster.
  auth = createAuth(pool);

  const ctx = await auth.$context;
  const user = await ctx.test.saveUser(ctx.test.createUser({ email: 'spike@example.test', emailVerified: true }));
  const { headers } = await ctx.test.login({ userId: user.id });
  const key = await keyPair();
  const client = await auth.api.adminCreateOAuthClient({ headers, body: {
    client_name: 'Isolated compatibility client', redirect_uris: [callback],
    grant_types: ['authorization_code', 'refresh_token', 'client_credentials'], response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post', require_pkce: true, skip_consent: true,
    scope: `openid profile email ${scope}`, client_credentials_scopes: [scope], resources: [resource],
    dpop_bound_access_tokens: true,
  }});
  const credentials = { client_id: client.client_id, client_secret: client.client_secret };
  let humanToken, idToken, serviceToken, combinedToken;
  const observer = await auth.api.adminCreateOAuthClient({ headers, body: {
    client_name: 'Isolated introspection observer', token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['client_credentials'], scope, client_credentials_scopes: [scope], resources: [resource],
  }});
  const observerCredentials = { client_id: observer.client_id, client_secret: observer.client_secret };
  const introspect = token => post('/oauth2/introspect', { ...observerCredentials, token });
  async function authorize(verifier = 'a'.repeat(64), extra = {}) {
    const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback,
      response_type: 'code', scope: `openid ${scope}`, state: randomUUID(), nonce: randomUUID(),
      resource, code_challenge: await generateCodeChallenge(verifier), code_challenge_method: 'S256',
      dpop_jkt: await deriveDpopJkt(key.publicJwk), ...extra });
    const response = await auth.handler(new Request(`${issuer}/oauth2/authorize?${query}`, { headers }));
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    const location = response.headers.get('location') ?? json.url;
    assert.ok(location, `authorization response ${response.status}`);
    return new URL(location);
  }
  await t.test('metadata advertises PKCE S256, DPoP and confidential client methods; no exchange', async () => {
    const metadata = await auth.api.getOAuthServerConfig();
    assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
    for (const method of ['client_secret_basic', 'client_secret_post', 'private_key_jwt'])
      assert.ok(metadata.token_endpoint_auth_methods_supported.includes(method));
    assert.ok(metadata.dpop_signing_alg_values_supported.includes('ES256'));
    assert.ok(!metadata.grant_types_supported.includes('urn:ietf:params:oauth:grant-type:token-exchange'));
    assert.equal(provider.oauthTokenExchange, undefined);
  });
  await t.test('authorization code + PKCE issues distinct DPoP JWT access token and OIDC ID token', async () => {
    const location = await authorize();
    assert.equal(location.origin, new URL(callback).origin);
    const code = location.searchParams.get('code'); assert.ok(code);
    const result = await post('/oauth2/token', { ...credentials, grant_type: 'authorization_code',
      code, redirect_uri: callback, code_verifier: 'a'.repeat(64), resource }, { DPoP: await proof(key, tokenUrl) });
    assert.equal(result.status, 200, result.body.error_description);
    assert.equal(result.body.token_type, 'DPoP');
    humanToken = result.body.access_token; combinedToken = humanToken; idToken = result.body.id_token;
    const access = decodeJwt(humanToken), identity = decodeJwt(idToken);
    assert.equal(decodeProtectedHeader(humanToken).typ, 'at+jwt');
    // Pinned provider adds UserInfo audience when openid is retained.
    assert.deepEqual(access.aud, [resource, `${issuer}/oauth2/userinfo`]);
    assert.equal(access.iss, issuer);
    assert.equal(access.client_id, client.client_id); assert.equal(access.sub, user.id);
    assert.ok(access.jti && access.iat && access.exp && access.sid);
    assert.equal(access.cnf.jkt, await deriveDpopJkt(key.publicJwk));
    assert.equal(identity.aud, client.client_id); assert.equal(identity.sub, user.id);
    assert.notEqual(humanToken, idToken);
    const replay = await post('/oauth2/token', { ...credentials, grant_type: 'authorization_code',
      code, redirect_uri: callback, code_verifier: 'a'.repeat(64), resource }, { DPoP: await proof(key, tokenUrl) });
    assert.notEqual(replay.status, 200);
  });
  await t.test('client credentials issues a service token without an ID token', async () => {
    const result = await post('/oauth2/token', { ...credentials, grant_type: 'client_credentials', scope, resource },
      { DPoP: await proof(key, tokenUrl) });
    assert.equal(result.status, 200, result.body.error_description);
    serviceToken = result.body.access_token;
    assert.equal(result.body.token_type, 'DPoP'); assert.equal(result.body.id_token, undefined);
    assert.equal(decodeJwt(serviceToken).sub, client.client_id);
  });
  await t.test('resource-only authorization produces a single-audience human JWT without ID token', async () => {
    const location = await authorize('a'.repeat(64), { scope });
    const result = await post('/oauth2/token', { ...credentials, grant_type: 'authorization_code',
      code: location.searchParams.get('code'), redirect_uri: callback, code_verifier: 'a'.repeat(64), resource },
      { DPoP: await proof(key, tokenUrl) });
    assert.equal(result.status, 200, result.body.error_description);
    humanToken = result.body.access_token;
    assert.equal(decodeJwt(humanToken).aud, resource);
    assert.equal(result.body.id_token, undefined);
    assert.equal((await introspect(humanToken)).body.active, true);
  });
  await t.test('Identity adapter verifies real resource-only provider token but blocks unavailable nonce integration', async () => {
    const target = `${resource}/me/tenants`;
    const dependencies = {
      jwksFetch: () => auth.api.getJwks(), replayStore: createDpopReplayStore(ctx.internalAdapter),
      nonce: { validate: async () => { throw new CredentialError('identity_unavailable'); } },
      readCurrentState: async () => { assert.fail('nonce blocker must precede lifecycle resolution'); },
    };
    const adapter = createIdentityCredentialAdapter({ issuer, audience: resource, environment: 'isolated-test' }, dependencies);
    const request = async access => new Request(target, { headers: {
      authorization: `DPoP ${access}`, DPoP: await proof(key, target, 'GET', access),
    } });
    await assert.rejects(adapter.validateAccessCredential(await request(humanToken), { scopes: [scope] }),
      e => e.code === 'identity_unavailable');
    for (const access of [idToken, combinedToken, serviceToken])
      await assert.rejects(adapter.validateAccessCredential(await request(access), { scopes: [scope] }),
        e => e.code === 'invalid_token');
  });
  await t.test('wrong PKCE verifier, plain challenge and mismatched redirect are rejected', async () => {
    const location = await authorize();
    const result = await post('/oauth2/token', { ...credentials, grant_type: 'authorization_code',
      code: location.searchParams.get('code'), redirect_uri: callback, code_verifier: 'b'.repeat(64), resource },
      { DPoP: await proof(key, tokenUrl) });
    assert.notEqual(result.status, 200);
    assert.ok((await authorize('a'.repeat(64), { code_challenge_method: 'plain' })).searchParams.get('error'));
    assert.ok((await authorize('a'.repeat(64), { redirect_uri: callback + '/wrong' })).searchParams.get('error'));
  });
  await t.test('unregistered resource and unlinked client resource are denied', async () => {
    const result = await post('/oauth2/token', { ...credentials, grant_type: 'client_credentials', scope,
      resource: 'https://unregistered.example.test/api' }, { DPoP: await proof(key, tokenUrl) });
    assert.equal(result.body.error, 'invalid_target');
    const unlinked = await auth.api.adminCreateOAuthClient({ headers, body: {
      client_name: 'Unlinked fixture', token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['client_credentials'], scope, client_credentials_scopes: [scope],
    }});
    const denied = await post('/oauth2/token', { client_id: unlinked.client_id, client_secret: unlinked.client_secret,
      grant_type: 'client_credentials', scope, resource }, { DPoP: await proof(key, tokenUrl) });
    assert.equal(denied.body.error, 'invalid_target');
  });
  await t.test('JWT verifier checks signature, issuer, audience, type and required claims', async () => {
    const options = { jwksFetch: () => auth.api.getJwks(), verifyOptions: {
      issuer, audience: resource, typ: 'at+jwt', algorithms: ['EdDSA'],
      requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'jti', 'client_id'],
    }};
    assert.equal((await verifyJwsAccessToken(humanToken, options)).sub, user.id);
    // Audience membership is not the draft's stricter single-audience rule.
    assert.ok(Array.isArray((await verifyJwsAccessToken(combinedToken, options)).aud));
    await assert.rejects(verifyJwsAccessToken(humanToken, { ...options, verifyOptions: {
      ...options.verifyOptions, currentDate: new Date((decodeJwt(humanToken).exp + 1) * 1000),
    } }));
    for (const override of [{ issuer: 'https://wrong.example.test' }, { audience: 'wrong' }, { typ: 'JWT' }])
      await assert.rejects(verifyJwsAccessToken(humanToken, { ...options,
        verifyOptions: { ...options.verifyOptions, ...override } }));
    await assert.rejects(verifyJwsAccessToken(idToken, options));
    const parts = humanToken.split('.'); parts[1] = Buffer.from(JSON.stringify({ ...decodeJwt(humanToken), sub: 'forged' })).toString('base64url');
    await assert.rejects(verifyJwsAccessToken(parts.join('.'), options));
  });
  await t.test('resource DPoP rejects wrong key/method/URL/hash/scheme and shared-store replay', async () => {
    const url = `${resource}/me/tenants`, payload = decodeJwt(humanToken);
    const replayStore = createDpopReplayStore(ctx.internalAdapter);
    const input = { payload, authorization: { scheme: 'DPoP', token: humanToken }, method: 'GET', url,
      replayStore, proofMaxAgeSeconds: 60, signingAlgorithms: ['ES256'] };
    const valid = await proof(key, url, 'GET', humanToken);
    const otherWorker = createDpopReplayStore((await createAuth(pool, false).$context).internalAdapter);
    const results = await Promise.allSettled([
      enforceDpopBinding({ ...input, proofJwt: valid }),
      enforceDpopBinding({ ...input, replayStore: otherWorker, proofJwt: valid }),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    for (const invalid of [
      await proof(await keyPair(), url, 'GET', humanToken),
      await proof(key, url, 'POST', humanToken),
      await proof(key, url + '/wrong', 'GET', humanToken),
      await proof(key, url, 'GET', 'wrong-token'),
    ]) await assert.rejects(enforceDpopBinding({ ...input, proofJwt: invalid }));
    await assert.rejects(enforceDpopBinding({ ...input, proofJwt: await proof(key, url, 'GET', humanToken),
      authorization: { scheme: 'Bearer', token: humanToken } }));
  });
  await t.test('missing token DPoP is rejected and token proof replay is atomic', async () => {
    const body = { ...credentials, grant_type: 'client_credentials', scope, resource };
    assert.equal((await post('/oauth2/token', body)).body.error, 'invalid_dpop_proof');
    const dpop = await proof(key, tokenUrl);
    const results = await Promise.all([post('/oauth2/token', body, { DPoP: dpop }),
      post('/oauth2/token', body, { DPoP: dpop })]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(results.find(r => r.status !== 200).body.error, 'invalid_dpop_proof');
  });
  await t.test('pinned DPoP accepts absent/arbitrary nonce: server-nonce profile is not implemented', async () => {
    const params = { method: 'GET', url: resource, accessToken: humanToken,
      expectedJkt: await deriveDpopJkt(key.publicJwk), requireAth: true,
      replayStore: createDpopReplayStore(ctx.internalAdapter) };
    await verifyDpopProof({ ...params, proofJwt: await proof(key, resource, 'GET', humanToken) });
    await verifyDpopProof({ ...params, proofJwt: await proof(key, resource, 'GET', humanToken, { nonce: 'not-server-issued' }) });
  });
  await t.test('private_key_jwt uses registered keys, 60s lifetime, exact endpoint audience and atomic replay', async () => {
    const signing = await keyPair();
    const privateClient = await auth.api.adminCreateOAuthClient({ headers, body: {
      client_name: 'Private-key fixture', token_endpoint_auth_method: 'private_key_jwt',
      grant_types: ['client_credentials'], scope, client_credentials_scopes: [scope], resources: [resource],
      jwks: { keys: [signing.publicJwk] }, dpop_bound_access_tokens: true,
    }});
    const assertion = (extra = {}) => signPrivateKeyJwtClientAssertion({ clientId: privateClient.client_id,
      tokenEndpoint: tokenUrl, privateKeyJwk: signing.privateJwk, kid: signing.publicJwk.kid,
      algorithm: 'ES256', expiresIn: 60, ...extra });
    const body = { client_id: privateClient.client_id, grant_type: 'client_credentials', scope, resource,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer' };
    const signed = await assertion();
    const results = await Promise.all([post('/oauth2/token', { ...body, client_assertion: signed }, { DPoP: await proof(key, tokenUrl) }),
      post('/oauth2/token', { ...body, client_assertion: signed }, { DPoP: await proof(key, tokenUrl) })]);
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(results.find(r => r.status !== 200).body.error, 'invalid_client');
    for (const bad of [await assertion({ tokenEndpoint: `${issuer}/wrong` }), await assertion({ expiresIn: 120 }),
      await assertion({ privateKeyJwk: (await keyPair()).privateJwk })]) {
      const response = await post('/oauth2/token', { ...body, client_assertion: bad }, { DPoP: await proof(key, tokenUrl) });
      assert.equal(response.body.error, 'invalid_client');
    }
  });
  await t.test('confidential basic authentication works; wrong secret is rejected', async () => {
    const basicClient = await auth.api.adminCreateOAuthClient({ headers, body: {
      client_name: 'Basic fixture', token_endpoint_auth_method: 'client_secret_basic',
      grant_types: ['client_credentials'], scope, client_credentials_scopes: [scope], resources: [resource],
    }});
    for (const [secret, expected] of [[basicClient.client_secret, 200], ['incorrect', 401]]) {
      const result = await post('/oauth2/token', { grant_type: 'client_credentials', scope, resource }, {
        Authorization: `Basic ${Buffer.from(`${basicClient.client_id}:${secret}`).toString('base64')}`,
        DPoP: await proof(key, tokenUrl),
      }); assert.equal(result.status, expected);
    }
  });
  await t.test('RFC8693 exchange is not installed or advertised', async () => {
    const result = await post('/oauth2/token', { ...credentials,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: humanToken });
    assert.equal(result.body.error, 'unsupported_grant_type');
  });
  await t.test('JWT individual revocation is unsupported and does not invalidate token', async () => {
    const result = await post('/oauth2/revoke', { ...credentials, token: serviceToken, token_type_hint: 'access_token' });
    assert.equal(result.body.error, 'unsupported_token_type');
    assert.equal((await introspect(serviceToken)).body.active, true);
  });

  await t.test('pairwise OIDC subject differs from stable access-JWT subject; introspection transforms it', async () => {
    const pairCallback = 'https://pairwise-spike.example.test/callback';
    const pairClient = await auth.api.adminCreateOAuthClient({ headers, body: {
      client_name: 'Pairwise fixture', redirect_uris: [pairCallback],
      grant_types: ['authorization_code'], response_types: ['code'], subject_type: 'pairwise',
      token_endpoint_auth_method: 'client_secret_post', require_pkce: true, skip_consent: true,
      scope: `openid ${scope}`, resources: [resource], dpop_bound_access_tokens: true,
    }});
    const location = await authorize('a'.repeat(64), { client_id: pairClient.client_id, redirect_uri: pairCallback });
    const response = await post('/oauth2/token', { client_id: pairClient.client_id, client_secret: pairClient.client_secret,
      grant_type: 'authorization_code', code: location.searchParams.get('code'), redirect_uri: pairCallback,
      code_verifier: 'a'.repeat(64), resource }, { DPoP: await proof(key, tokenUrl) });
    assert.equal(response.status, 200, response.body.error_description);
    const publicSub = decodeJwt(response.body.access_token).sub;
    const pairSub = decodeJwt(response.body.id_token).sub;
    assert.equal(publicSub, user.id); assert.notEqual(pairSub, publicSub);
    assert.equal((await introspect(response.body.access_token)).body.sub, pairSub);
  });
  await t.test('opaque token revocation is supported, unlike individual JWT revocation', async () => {
    const result = await post('/oauth2/token', { ...credentials, grant_type: 'client_credentials', scope },
      { DPoP: await proof(key, tokenUrl) });
    assert.equal(result.status, 200, result.body.error_description);
    const token = result.body.access_token; assert.notEqual(token.split('.').length, 3);
    assert.equal((await post('/oauth2/introspect', { ...credentials, token })).body.active, true);
    assert.equal((await post('/oauth2/revoke', { ...credentials, token })).status, 200);
    assert.equal((await post('/oauth2/introspect', { ...credentials, token })).body.active, false);
  });
  await t.test('opaque explicit-resource profile: native lifecycle, pairwise mapping and cross-instance proofs', async t => {
    const originalAuth = auth;
    // Supported provider-wide mode, deliberately isolated: never change app auth.
    auth = createAuth(pool, false, { disableJwtPlugin: true });
    try {
      const opaqueCtx = await auth.$context;
      const worker = createAuth(pool, false, { disableJwtPlugin: true });
      const opaqueClient = await auth.api.adminCreateOAuthClient({ headers, body: {
        client_name: 'Opaque resource fixture', redirect_uris: [callback],
        grant_types: ['authorization_code'], response_types: ['code'], subject_type: 'pairwise',
        token_endpoint_auth_method: 'client_secret_post', require_pkce: true, skip_consent: true,
        scope: `openid ${scope}`, resources: [resource], dpop_bound_access_tokens: true,
      }});
      const opaqueCredentials = { client_id: opaqueClient.client_id, client_secret: opaqueClient.client_secret };
      const opaqueObserver = await auth.api.adminCreateOAuthClient({ headers, body: {
        client_name: 'Opaque introspection observer', token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['client_credentials'], scope, client_credentials_scopes: [scope], resources: [resource],
      }});
      const inspect = token => post('/oauth2/introspect', {
        client_id: opaqueObserver.client_id, client_secret: opaqueObserver.client_secret, token });
      async function issue(requestScope = scope) {
        const location = await authorize('a'.repeat(64), { client_id: opaqueClient.client_id, scope: requestScope });
        return post('/oauth2/token', { ...opaqueCredentials, grant_type: 'authorization_code',
          code: location.searchParams.get('code'), redirect_uri: callback, code_verifier: 'a'.repeat(64), resource },
          { DPoP: await proof(key, tokenUrl) });
      }
      const first = await issue(), second = await issue();
      assert.equal(first.status, 200, first.body.error_description);
      assert.equal(second.status, 200, second.body.error_description);
      const token = first.body.access_token;
      assert.notEqual(token.split('.').length, 3);
      assert.equal(first.body.token_type, 'DPoP'); assert.equal(first.body.id_token, undefined);
      const state = (await inspect(token)).body;
      assert.equal(state.active, true); assert.equal(state.iss, issuer);
      assert.equal(state.aud, resource); assert.equal(state.scope, scope);
      assert.equal(state.client_id, opaqueClient.client_id); assert.ok(state.sid);
      assert.equal(state.cnf.jkt, await deriveDpopJkt(key.publicJwk));
      assert.equal(state.token_type, 'DPoP'); assert.ok(state.exp - state.iat <= 300);
      assert.notEqual(state.sub, user.id); // Pairwise introspection, not user PK.
      // Authoritative persisted issuance links it to the real user without email.
      const rows = await opaqueCtx.adapter.findMany({ model: 'oauthAccessToken',
        where: [{ field: 'clientId', value: opaqueClient.client_id }] });
      assert.equal(rows.length, 2);
      assert.ok(rows.every(row => row.userId === user.id && row.sessionId === state.sid));
      assert.ok(rows.every(row => row.token !== token)); // default token hashing
      await t.test('single resource and scope; unsupported scope/resource denied', async () => {
        const badScope = await issue('nexus:unapproved');
        assert.notEqual(badScope.status, 200);
        const bad = await authorize('a'.repeat(64), { client_id: opaqueClient.client_id, scope,
          resource: 'https://unregistered.example.test/api' });
        assert.ok(bad.searchParams.get('error'));
      });
      const target = `${resource}/me/tenants`;
      const input = { payload: state, authorization: { scheme: 'DPoP', token }, method: 'GET', url: target,
        signingAlgorithms: ['ES256'], proofMaxAgeSeconds: 60 };
      await t.test('shared replay across independent provider contexts, fresh proofs reusable token', async () => {
        const signed = await proof(key, target, 'GET', token);
        const results = await Promise.allSettled([
          enforceDpopBinding({ ...input, proofJwt: signed, replayStore: createDpopReplayStore(opaqueCtx.internalAdapter) }),
          enforceDpopBinding({ ...input, proofJwt: signed, replayStore: createDpopReplayStore((await worker.$context).internalAdapter) }),
        ]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        await enforceDpopBinding({ ...input, proofJwt: await proof(key, target, 'GET', token),
          replayStore: createDpopReplayStore(opaqueCtx.internalAdapter) });
        for (const invalid of [await proof(await keyPair(), target, 'GET', token),
          await proof(key, target, 'POST', token), await proof(key, target + '/wrong', 'GET', token),
          await proof(key, target, 'GET', 'wrong-token')]) {
          await assert.rejects(enforceDpopBinding({ ...input, proofJwt: invalid,
            replayStore: createDpopReplayStore(opaqueCtx.internalAdapter) }));
        }
      });
      await t.test('opaque proof replay across two independent Node processes', async () => {
        const signed = await proof(key, target, 'GET', token);
        const childSource = `
          import pg from 'pg';
          import { betterAuth } from 'better-auth';
          import { createDpopReplayStore, enforceDpopBinding } from 'better-auth/oauth2';
          const data = JSON.parse(process.env.IS_SYNTHETIC_REPLAY_INPUT);
          const pool = new pg.Pool(data.database);
          try {
            const instance = betterAuth({ database: pool, baseURL: data.origin,
              secret: 'isolated-process-replay-secret-000000000000000000',
              logger: { disabled: true } });
            const context = await instance.$context;
            try {
              await enforceDpopBinding({ ...data.input,
                replayStore: createDpopReplayStore(context.internalAdapter) });
              process.stdout.write('accepted');
            } catch (error) {
              if (error.code !== 'invalid_dpop_proof') throw error;
              process.stdout.write('rejected');
            }
          } finally { await pool.end(); }
        `;
        const env = { ...process.env, IS_SYNTHETIC_REPLAY_INPUT: JSON.stringify({ origin,
          database: { host: socket, port: 55440, user: 'is_identity_spike', database: 'postgres' },
          input: { ...input, proofJwt: signed } }) };
        const results = await Promise.all([0, 1].map(() => run(process.execPath,
          ['--input-type=module', '-e', childSource], { env })));
        assert.deepEqual(results.map(r => r.stdout).sort(), ['accepted', 'rejected']);
      });
      await t.test('test-only strict introspection gate fails closed on outage/inactive/malformed state', async () => {
        // Contract model only; not production adapter support for opaque tokens.
        async function gate(read) {
          const response = await read();
          assert.equal(response.status, 200);
          const value = response.body;
          assert.equal(value.active, true); assert.equal(value.iss, issuer);
          assert.equal(value.aud, resource); assert.equal(value.token_type, 'DPoP');
          assert.equal(value.cnf?.jkt, await deriveDpopJkt(key.publicJwk));
          return value;
        }
        await gate(() => inspect(second.body.access_token));
        for (const read of [async () => { throw new Error('synthetic transport unavailable'); },
          async () => ({ status: 503, body: {} }), async () => ({ status: 200, body: { active: false } }),
          async () => ({ status: 200, body: { ...state, aud: [resource, 'extra'] } }),
          async () => ({ status: 200, body: { ...state, cnf: undefined } })]) await assert.rejects(gate(read));
      });
      await t.test('real introspection database outage never reports active', async () => {
        const healthy = auth;
        const unavailablePool = new pg.Pool({ host: join(dir, 'absent-socket'), port: 55440,
          user: 'is_identity_spike', database: 'postgres', connectionTimeoutMillis: 250 });
        try {
          auth = createAuth(unavailablePool, false, { disableJwtPlugin: true });
          await assert.rejects(inspect(second.body.access_token), error => error.code === 'ENOENT');
        } finally { auth = healthy; await unavailablePool.end(); }
      });
      await t.test('individual revocation leaves sibling active', async () => {
        assert.equal((await post('/oauth2/revoke', { ...opaqueCredentials, token, token_type_hint: 'access_token' })).status, 200);
        assert.equal((await inspect(token)).body.active, false);
        assert.equal((await inspect(second.body.access_token)).body.active, true);
      });
      await t.test('pairwise opaque OIDC mode changes signing profile; combined audience still rejected', async () => {
        const combined = await issue(`openid ${scope}`);
        assert.equal(combined.status, 200, combined.body.error_description);
        assert.equal(decodeProtectedHeader(combined.body.id_token).alg, 'HS256');
        assert.equal(decodeJwt(combined.body.id_token).sub, state.sub);
        assert.deepEqual((await inspect(combined.body.access_token)).body.aud, [resource, `${issuer}/oauth2/userinfo`]);
      });
      await t.test('online introspection timings (in-process, local socket only)', async () => {
        const durations = [];
        for (let i = 0; i < 30; i++) {
          const start = performance.now();
          assert.equal((await inspect(second.body.access_token)).body.active, true);
          durations.push(performance.now() - start);
        }
        durations.sort((a, b) => a - b);
        t.diagnostic(`opaque introspection n=30 p50=${durations[14].toFixed(2)}ms p95=${durations[28].toFixed(2)}ms; no TLS/network/cold-start`);
      });
      await t.test('client disable denies; enable can resurrect native token', async () => {
        await opaqueCtx.adapter.update({ model: 'oauthClient', where: [{ field: 'clientId', value: opaqueClient.client_id }], update: { disabled: true } });
        assert.equal((await inspect(second.body.access_token)).body.active, false);
        await opaqueCtx.adapter.update({ model: 'oauthClient', where: [{ field: 'clientId', value: opaqueClient.client_id }], update: { disabled: false } });
        assert.equal((await inspect(second.body.access_token)).body.active, true);
      });
      await t.test('session termination: supported sign-out revokes; raw deletion loses session binding', async () => {
        for (const mode of ['raw-delete', 'sign-out']) {
        // New session avoids destroying the parent fixture login.
        const otherLogin = await opaqueCtx.test.login({ userId: user.id });
        const locationQuery = new URLSearchParams({ client_id: opaqueClient.client_id, redirect_uri: callback,
          response_type: 'code', scope, resource, state: randomUUID(),
          code_challenge: await generateCodeChallenge('a'.repeat(64)), code_challenge_method: 'S256',
          dpop_jkt: await deriveDpopJkt(key.publicJwk) });
        const response = await auth.handler(new Request(`${issuer}/oauth2/authorize?${locationQuery}`, { headers: otherLogin.headers }));
        const body = await response.text();
        const location = new URL(response.headers.get('location') ?? JSON.parse(body).url);
        const issued = await post('/oauth2/token', { ...opaqueCredentials, grant_type: 'authorization_code',
          code: location.searchParams.get('code'), redirect_uri: callback, code_verifier: 'a'.repeat(64), resource },
          { DPoP: await proof(key, tokenUrl) });
        assert.equal(issued.status, 200, issued.body.error_description);
        const before = (await inspect(issued.body.access_token)).body; assert.equal(before.active, true);
        if (mode === 'raw-delete') {
          await opaqueCtx.adapter.delete({ model: 'session', where: [{ field: 'id', value: before.sid }] });
          const after = (await inspect(issued.body.access_token)).body;
          assert.equal(after.active, true); assert.equal(after.sid, undefined);
        } else {
          const logout = await auth.handler(new Request(`${issuer}/sign-out`, {
            method: 'POST', headers: { ...Object.fromEntries(otherLogin.headers), origin,
              'content-type': 'application/json' }, body: '{}' }));
          assert.equal(logout.status, 200);
          assert.equal((await inspect(issued.body.access_token)).body.active, false);
        }
        }
      });
    } finally { auth = originalAuth; }
  });
  await t.test('maintained JOSE verifies signed nonce after provider DPoP validation (composition spike)', async () => {
    const target = `${resource}/nonce-spike`, nonce = randomUUID();
    const signed = await proof(key, target, 'GET', humanToken, { nonce });
    const checked = await verifyDpopProof({ proofJwt: signed, method: 'GET', url: target,
      accessToken: humanToken, expectedJkt: await deriveDpopJkt(key.publicJwk), requireAth: true,
      signingAlgorithms: ['ES256'], replayStore: createDpopReplayStore(ctx.internalAdapter) });
    assert.equal(checked.nonce, undefined); // no native nonce result/option
    const publicKey = await importJWK(checked.jwk, 'ES256');
    const verified = await jwtVerify(signed, publicKey, { algorithms: ['ES256'], typ: 'dpop+jwt' });
    assert.equal(verified.payload.nonce, nonce);
    const parts = signed.split('.');
    parts[1] = Buffer.from(JSON.stringify({ ...verified.payload, nonce: 'forged' })).toString('base64url');
    await assert.rejects(jwtVerify(parts.join('.'), publicKey, { algorithms: ['ES256'], typ: 'dpop+jwt' }));
    // This proves maintained signature/claim access only, not a nonce service.
  });
  await t.test('session deletion and client disable affect online introspection, not JWT signatures', async () => {
    assert.equal((await introspect(humanToken)).body.active, true);
    await ctx.adapter.delete({ model: 'session', where: [{ field: 'id', value: decodeJwt(humanToken).sid }] });
    assert.equal((await introspect(humanToken)).body.active, false);
    assert.equal((await introspect(serviceToken)).body.active, true);
    await ctx.adapter.update({ model: 'oauthClient', where: [{ field: 'clientId', value: client.client_id }], update: { disabled: true } });
    assert.equal((await introspect(serviceToken)).body.active, false);
    // Offline signature validation cannot observe the state change.
    assert.equal((await verifyJwsAccessToken(serviceToken, { jwksFetch: () => auth.api.getJwks(),
      verifyOptions: { issuer, audience: resource, typ: 'at+jwt' } })).client_id, client.client_id);
  });

});
