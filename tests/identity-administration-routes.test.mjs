import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createAdministrationHandler} from '../src/lib/identity/administration-http.ts';
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
