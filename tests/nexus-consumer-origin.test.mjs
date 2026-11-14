import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConsumerHandler} from '../src/lib/nexus-consumer/http.ts';
import {CredentialError} from '../src/lib/identity/access-credentials.ts';

const publicOrigin='https://5480-deb13.lan.com:5180',bind='https://0.0.0.0:5180';
const path='/api/nexus/v1/me/tenants?limit=100',bff='https://5480-deb13.lan.com:5182';
function fixture(){
  const calls=[];
  const deps={enabled:()=>true,ready:()=>true,publicOrigin,transportOrigin:bind,
    trustedMutationOrigin:async req=>req.headers.get('origin')===bff,
    service:{execute:async req=>{calls.push(req);throw new CredentialError('invalid_token');}}};
  return {calls,deps,handler:createConsumerHandler(deps,'tenants')};
}
const request=(headers={},origin=bind)=>new Request(origin+path,{headers:{host:new URL(publicOrigin).host,...headers}});
test('canonical HTTPS without browser Origin reaches Identity with external URL and GET method',async()=>{
  for(const origin of [bind,publicOrigin]){
    const f=fixture(),res=await f.handler(request({},origin));
    assert.equal(res.status,401);assert.equal((await res.json()).error,'invalid_token');
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,publicOrigin+path);
    assert.equal(f.calls[0].method,'GET');assert.equal(f.calls[0].headers.has('origin'),false);
  }
});
test('malformed, conflicting, spoofed and downgraded authorities never reach credentials',async t=>{
  for(const headers of [{host:'evil.test'},{host:''},{host:'5480-deb13.lan.com:5180, evil.test'},
    {'x-forwarded-host':'evil.test'},{'x-forwarded-host':'5480-deb13.lan.com:5180, evil.test'},
    {'x-forwarded-proto':'http'},{'x-forwarded-proto':'https,http'}, {'x-forwarded-port':'443'},
    {forwarded:'host=5480-deb13.lan.com:5180;proto=https'}, {host:'evil.test','x-forwarded-host':new URL(publicOrigin).host}]){
    await t.test(JSON.stringify(headers),async()=>{const f=fixture(),res=await f.handler(request(headers));
      assert.equal(res.status,401);assert.equal((await res.json()).error,'invalid_dpop_proof');assert.equal(f.calls.length,0);});
  }
  for(const origin of ['http://0.0.0.0:5180','http://5480-deb13.lan.com:5180','https://127.0.0.1:5180','https://evil.test']){
    const f=fixture();assert.equal((await f.handler(request({},origin))).status,401);assert.equal(f.calls.length,0);
  }
});
test('matching forwarding metadata is redundant; browser Origin remains independently checked',async()=>{
  const f=fixture();await f.handler(request({'x-forwarded-host':new URL(publicOrigin).host,'x-forwarded-proto':'https','x-forwarded-port':'5180',origin:bff}));
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,publicOrigin+path);
  for(const origin of ['null','https://evil.test',publicOrigin,bff+'/']){
    const bad=fixture();assert.equal((await bad.handler(request({origin}))).status,403);assert.equal(bad.calls.length,0);
  }
});
test('bind alias is opt-in, cookies denied and POST still requires approved Origin',async()=>{
  const f=fixture();assert.equal((await createConsumerHandler({...f.deps,transportOrigin:undefined},'tenants')(request())).status,401);
  assert.equal((await f.handler(request({cookie:'synthetic=1'}))).status,401);assert.equal(f.calls.length,0);
  for(const origin of [undefined,'null','https://evil.test']){
    const headers={host:new URL(publicOrigin).host,'content-type':'application/json',...(origin?{origin}:{})};
    const res=await createConsumerHandler(f.deps,'decision')(new Request(bind+'/api/nexus/v1/access-decisions',{method:'POST',headers,body:'{}'}));
    assert.equal(res.status,403);assert.equal(f.calls.length,0);
  }
});
