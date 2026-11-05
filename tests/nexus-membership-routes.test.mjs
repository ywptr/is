import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMembershipHandler} from '../src/lib/nexus-memberships/http.ts';
import {MembershipError} from '../src/lib/nexus-memberships/policy.ts';
const tenant='10000000-0000-0000-0000-000000000001',other='10000000-0000-0000-0000-000000000002';
function fixture({enabled=true,user='operator',grants=['operator:'+tenant],fail=false}={}) {
  const calls=[];
  const service=Object.fromEntries(['list','add','change','bootstrap','invitations','invite','revoke','accept'].map(name=>[name,async(...args)=>{calls.push({name,args});if(fail)throw new MembershipError('last_admin_protected');return {ok:true};}]));
  return {calls,handler:(mode,op)=>createMembershipHandler({enabled:()=>enabled,trustedOrigin:h=>h.get('origin')==='https://is.test',sessionUser:async()=>user,authorized:async(mode,id,t)=>grants.includes(mode+':'+t),service},mode,op)};
}
const req=(method='GET',data,origin='https://is.test')=>new Request('https://is.test/api',{method,headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
test('disabled gate, absent session and unauthorized identity fail closed before service call',async()=>{
  for(const [opts,code] of [[{enabled:false},404],[{user:null},401],[{grants:[]},403]]) {
    const f=fixture(opts),r=await f.handler('operator','list')(req(),{tenantId:tenant});assert.equal(r.status,code);assert.equal(f.calls.length,0);assert.equal(r.headers.get('cache-control'),'no-store');
  }
});
test('all management mutations require canonical Origin and session',async()=>{
  for(const op of ['add','change','bootstrap','invite','revoke','accept'])for(const origin of [null,'null','https://evil.test','https://is.test.evil.test']) {
    const f=fixture(),r=await f.handler('operator',op)(req(op==='change'?'PATCH':'POST',{},origin),{tenantId:tenant});assert.equal(r.status,403);assert.equal(f.calls.length,0);
  }
  const f=fixture({user:null});assert.equal((await f.handler('tenant','accept')(req('POST',{token:'a'.repeat(43)}))).status,401);
});
test('tenant grants cannot authorize operator routes or another tenant',async()=>{
  const f=fixture({user:'owner',grants:['tenant:'+tenant]});
  assert.equal((await f.handler('tenant','list')(req(),{tenantId:tenant})).status,200);
  assert.equal((await f.handler('operator','list')(req(),{tenantId:tenant})).status,403);
  assert.equal((await f.handler('tenant','list')(req(),{tenantId:other})).status,403);
  assert.equal(f.calls.length,1);
});
test('validated write binds server actor, tenant and target; conflict is structured',async()=>{
  const f=fixture();const r=await f.handler('operator','change')(req('PATCH',{role:'member',status:'inactive',expectedVersion:2,reason:'remove'}),{tenantId:tenant,userId:'target'});
  assert.equal(r.status,200);const call=f.calls[0];assert.equal(call.args[0].actorId,'operator');assert.equal(call.args[0].tenantId,tenant);assert.equal(call.args[1],'target');
  const blocked=fixture({fail:true});const denied=await blocked.handler('operator','change')(req('PATCH',{role:'admin',status:'inactive',expectedVersion:1,reason:'test'}),{tenantId:tenant,userId:'target'});
  assert.equal(denied.status,409);assert.equal((await denied.json()).error,'last_admin_protected');
});
test('rejects malformed, oversized, injected and invalid-target requests',async()=>{
  const f=fixture();
  for(const body of [{userId:'u',role:'member',reason:'test',actorId:'forged'},[],null])assert.equal((await f.handler('operator','add')(req('POST',body),{tenantId:tenant})).status,400);
  assert.equal((await f.handler('operator','add')(new Request('https://is.test',{method:'POST',headers:{Origin:'https://is.test','Content-Type':'application/json'},body:'{'}),{tenantId:tenant})).status,400);
  assert.equal((await f.handler('operator','add')(req('POST',{x:'x'.repeat(9000)}),{tenantId:tenant})).status,413);
  assert.equal((await f.handler('operator','list')(req(),{tenantId:'bad'})).status,400);
  assert.equal(f.calls.length,0);
});
test('invitation acceptance passes only authenticated identity and token; never tenant claims',async()=>{
  const f=fixture({user:'recipient',grants:[]});const token='z'.repeat(43);
  assert.equal((await f.handler('tenant','accept')(req('POST',{token}))).status,200);
  assert.equal(f.calls[0].args[0],'recipient');assert.equal(f.calls[0].args[1],token);
  assert.equal((await f.handler('tenant','accept')(req('POST',{token,tenantId:tenant}))).status,400);
});
