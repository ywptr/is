import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdmissionHandler} from '../src/lib/identity/admission/http.ts';
import {createAdmissionJwksReader} from '../src/lib/identity/admission/provider.ts';
import {authorization,redemption} from '../src/lib/identity/admission/validation.ts';
const origin='https://is.example',id='10000000-0000-4000-8000-000000000001',csrf='a'.repeat(43);
const endpoint='/api/is/v1/admission/transactions/'+id+'/selection';
const headers={host:'is.example',origin,'content-type':'application/json',cookie:'__Host-is_admission_csrf='+csrf,'x-csrf-token':csrf};
const deps=(service={})=>({enabled:()=>true,publicOrigin:origin,authenticated:async()=>true,service});
const denyService=new Proxy({},{get:()=>()=>{assert.fail('invalid request reached admission service');}});
const selection=(extra={},body='{}')=>new Request(origin+endpoint,{method:'POST',headers:{...headers,...extra},body});

test('Admission HTTP: default-off gate precedes identity, transport and service work',async()=>{
 for(const op of ['authorize','choices','selection','redemptions']){
  const handler=createAdmissionHandler({...deps(denyService),enabled:()=>false,authenticated:async()=>assert.fail('identity invoked')},op);
  const r=await handler(new Request(origin+'/anything'),id);assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');
 }
});
test('Admission HTTP: hostile authority and forwarded metadata never authenticate',async()=>{
 const handler=createAdmissionHandler({...deps(denyService),authenticated:async()=>assert.fail('identity invoked')},'choices');
 for(const h of [{host:'evil.example'},{host:'is.example','x-forwarded-proto':'http'},{host:'is.example','x-forwarded-host':'evil.example'},{host:'is.example',forwarded:'host=evil.example'}]) {
  assert.equal((await handler(new Request(origin+'/choices',{headers:h}),id)).status,401);
 }
});
test('Admission HTTP: strict browser Origin, CSRF and actor headers',async()=>{
 const handler=createAdmissionHandler(deps(denyService),'selection');
 for(const h of [{origin:'https://evil.example'},{origin:''},{'x-csrf-token':'wrong'},{cookie:''}])assert.equal((await handler(selection(h),id)).status,403);
 assert.equal((await handler(selection({'x-user-id':'forged'}),id)).status,400);
 const missing=new Request(origin+endpoint,{method:'POST',headers:{host:'is.example','content-type':'application/json'},body:'{}'});
 assert.equal((await handler(missing,id)).status,403);
});
test('Admission HTTP: malformed or oversized selection body never reaches service',async()=>{
 const handler=createAdmissionHandler(deps(denyService),'selection');
 assert.equal((await handler(selection({},'{'),id)).status,400);
 assert.equal((await handler(selection({},'a'.repeat(16385)),id)).status,413);
});
test('Admission HTTP: duplicate query/form fields and oversized redemption are rejected',async()=>{
 const authorize=createAdmissionHandler(deps(denyService),'authorize');
 assert.equal((await authorize(new Request(origin+'/authorize?client_id=a&client_id=b',{headers:{host:'is.example'}}))).status,400);
 const redeem=createAdmissionHandler(deps(denyService),'redemptions');
 for(const [body,status]of [['code=a&code=b',400],['a'.repeat(32769),413]]) {
  const r=await redeem(new Request(origin+'/redemptions',{method:'POST',headers:{host:'is.example','content-type':'application/x-www-form-urlencoded'},body}));assert.equal(r.status,status);
 }
});
test('Admission HTTP: selection supports JSON navigation and exact 303 callback',async()=>{
 const redirect='https://bff.example/callback?code=opaque&state=bound';
 const handler=createAdmissionHandler(deps({confirm:async()=>({redirect})}),'selection');
 const json=await handler(selection({accept:'application/json'}),id);assert.equal(json.status,200);assert.deepEqual(await json.json(),{redirect});
 const native=await handler(selection(),id);assert.equal(native.status,303);assert.equal(native.headers.get('location'),redirect);
 assert.equal(native.headers.get('referrer-policy'),'no-referrer');
});
test('Admission HTTP: zero-choice HTML has no selected tenant and a nonce CSP',async()=>{
 const handler=createAdmissionHandler(deps({choices:async()=>({tenants:[]})}),'choices');
 const response=await handler(new Request(origin+'/choices',{headers:{host:'is.example',accept:'text/html',cookie:headers.cookie}}),id);
 assert.equal(response.status,200);const html=await response.text();assert.match(html,/<option value="" selected disabled>/);
 assert.match(response.headers.get('content-security-policy'),/script-src 'nonce-/);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('Admission HTTP: dependency details are redacted and method is enforced',async()=>{
 const handler=createAdmissionHandler(deps({choices:async()=>{throw new Error('synthetic_sensitive_backend_detail');}}),'choices');
 const response=await handler(new Request(origin+'/choices',{headers:{host:'is.example'}}),id);
 assert.equal(response.status,503);assert.ok(!(await response.text()).includes('synthetic_sensitive_backend_detail'));
 assert.equal((await handler(new Request(origin+'/choices',{method:'POST',headers:{host:'is.example'}}),id)).status,405);
});
test('Admission input profile: no ID/application injection or relaxed callback/PKCE',()=>{
 const input={client_id:'registered',redirect_uri:'https://bff.example/callback',state:'s'.repeat(32),nonce:'n'.repeat(32),code_challenge:'a'.repeat(43),code_challenge_method:'S256'};
 assert.equal(authorization(input).clientId,'registered');
 for(const v of [{...input,userId:'forged'},{...input,application_id:id},{...input,redirect_uri:'http://bff.example/callback'},{...input,redirect_uri:'https://bff.example/callback#fragment'},{...input,code_challenge_method:'plain'}])assert.throws(()=>authorization(v));
 assert.throws(()=>redemption({client_id:'registered',code:'a'.repeat(43),code_verifier:'a'.repeat(64),redirect_uri:'https://bff.example/callback',client_assertion:'assertion',client_assertion_type:'wrong'}));
});

test('Admission key verification never provisions an empty provider key store',async()=>{
 let reads=0;
 const reader=createAdmissionJwksReader({transaction:async work=>work({query:async query=>{reads++;assert.match(query,/^SELECT/);return {rows:[]};}})});
 await assert.rejects(reader({alg:'EdDSA',kid:'missing'},{payload:new Uint8Array(),signature:new Uint8Array()}),e=>e.error==='signing_key_unavailable');
 assert.equal(reads,1);
});
