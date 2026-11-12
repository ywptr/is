import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {createAdministrationHandler,createAdministrationReadHandler} from '../src/lib/identity/administration-http.ts';
import {AdministrationError,parseAdminInput} from '../src/lib/identity/administration.ts';
const body=()=>({action:'resource',environment:'development',requestId:randomUUID(),reason:'test'});
const req=(data=body(),origin='https://is.test')=>new Request('https://is.test/api',{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:typeof data==='string'?data:JSON.stringify(data)});
function fixture(extra={}){const calls=[];return {calls,handle:createAdministrationHandler({enabled:()=>true,integration:()=>({registry:{policy:{audience:'https://is.test/api/nexus/v1',environment:'development'}}}),session:async()=>({user:{id:'operator'},session:{id:'session'}}),execute:async(...args)=>{calls.push(args);return {ok:true};},...extra})};}
test('credential administration gate, exact origin and authenticated session precede mutations',async()=>{
 for(const [extra,status] of [[{enabled:()=>false},404],[{integration:()=>undefined},503],[{session:async()=>null},403]]){const f=fixture(extra);assert.equal((await f.handle(req())).status,status);assert.equal(f.calls.length,0);}
 for(const origin of [null,'null','https://evil.test','https://is.test.evil.test']){const f=fixture();assert.equal((await f.handle(req(body(),origin))).status,403);assert.equal(f.calls.length,0);}
 const f=fixture();const r=await f.handle(req());assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(f.calls[0][1],{userId:'operator',sessionId:'session'});
});
test('administration rejects malformed JSON, foreign environments, forged actors, prototype actions and oversized bodies',async()=>{
 for(const [b,status] of [['{',400],[{...body(),environment:'production'},400],[{...body(),actorId:'forged'},400],[{...body(),action:'toString'},400],['x'.repeat(17000),413]]){const f=fixture();assert.equal((await f.handle(req(b))).status,status);assert.equal(f.calls.length,0);}
});
test('operator denial and audit/provider errors fail closed without error details',async()=>{
 for(const [error,status] of [[new AdministrationError(403,'forbidden'),403],[new Error('private database detail'),503]]){const f=fixture({execute:async()=>{throw error;}}),r=await f.handle(req());assert.equal(r.status,status);assert(!JSON.stringify(await r.json()).includes('private'));}
});
test('strict key rotation requires assertion for the exact target and rejects private keys',async()=>{
 await assert.rejects(parseAdminInput({...body(),action:'keys',clientId:'client',jwks:{keys:[]}}));
 await assert.rejects(parseAdminInput({...body(),action:'provision',applicationId:'-'.repeat(36),jwks:{keys:[]},operations:[]}));
});
test('consumer operation policy rejects wildcards, other applications and unapproved Sandcastle operations',async()=>{
 const publicKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});
 const jwks={keys:[{...publicKey,kid:'synthetic-operation-test',alg:'ES256',use:'sig'}]};
 const input={...body(),action:'provision',applicationId:'20000000-0000-4000-8000-000000000001',jwks,operations:['sandcastle:tenant.access']};
 await parseAdminInput(input);
 for(const operations of [[],['*'],['ig:jobs.submit'],['sandcastle:tenant.access','sandcastle:stories.write'],['sandcastle:tenant.use']]){
  await assert.rejects(parseAdminInput({...input,operations}),e=>e.code==='invalid_operations');
 }
});
test('consumer inventory requires operator authority, independent of tenant/admin roles, and fails without disclosure',async()=>{
 const request=new Request('https://is.test/api');let reads=0;
 for(const role of ['anonymous','ordinary','tenant_admin','is_admin']){
  const handler=createAdministrationReadHandler({enabled:()=>true,operator:async()=>null,read:async()=>{reads++;return {role};}});
  assert.equal((await handler(request)).status,403);
 }
 assert.equal(reads,0);
 const handler=createAdministrationReadHandler({enabled:()=>true,operator:async()=>true,read:async()=>({schemaReady:false})});
 const response=await handler(request);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{schemaReady:false});
 const broken=createAdministrationReadHandler({enabled:()=>true,operator:async()=>true,read:async()=>{throw new Error('private details');}});
 assert.deepEqual(await (await broken(request)).json(),{error:'administration_unavailable'});
});
