import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHostname,domainOrigin,validEvidence} from '../src/lib/nexus-domains/policy.ts';
import {createDomainDecisionHandler} from '../src/lib/nexus-domains/decision-http.ts';
import {createDomainManagementHandler} from '../src/lib/nexus-domains/management-http.ts';
const origin='https://is.example.test',domain='https://tenant.example.test';
const denied=new Proxy({},{get:()=>()=>assert.fail('denied transport reached service')});
test('Domain names use strict canonical ASCII DNS and exact HTTPS origins',()=>{
 assert.equal(normalizeHostname('TENANT.Example.test'),'tenant.example.test');
 for(const h of ['evil..test','127.0.0.1','localhost','tenant.example.test.','*.example.test','a:b','user@host.test','ü.example.test',' tenant.test'])assert.throws(()=>normalizeHostname(h));
 assert.equal(domainOrigin(domain).hostname,'tenant.example.test');
 for(const v of ['http://tenant.example.test',domain+'/',domain+':443',domain+'/path','https://user@tenant.example.test','https://TENANT.example.test'])assert.throws(()=>domainOrigin(v));
 assert.equal(validEvidence({hostname:'tenant.example.test',origin:domain,revision:'4'}),true);
 assert.equal(validEvidence({hostname:'other.example.test',origin:domain,revision:'4'}),false);
});
test('New domain HTTP gate and hostile authority fail before identity/service work',async()=>{
 const off=createDomainDecisionHandler({enabled:()=>false,publicOrigin:origin,trustedOrigin:()=>true,service:denied});
 assert.equal((await off(new Request(origin))).status,404);
 const on=createDomainDecisionHandler({enabled:()=>true,publicOrigin:origin,trustedOrigin:()=>true,service:denied});
 const req=(extra={},body={admissionContext:'opaque',domainOrigin:domain,operation:'story.read'})=>new Request(origin+'/api/nexus/v1/domain-access-decisions',{method:'POST',headers:{host:'is.example.test',origin:domain,'content-type':'application/json',...extra},body:JSON.stringify(body)});
 for(const h of [{host:'evil.example'},{'x-forwarded-host':'evil.example'},{forwarded:'host=evil.example'}])assert.equal((await on(req(h))).status,401);
});
test('Domain decision rejects cookie fallback, origin/domain mismatch, forged IDs and unknown fields',async()=>{
 const handler=createDomainDecisionHandler({enabled:()=>true,publicOrigin:origin,trustedOrigin:o=>o===domain,service:denied});
 const req=(extra={},body={admissionContext:'opaque',domainOrigin:domain,operation:'story.read'})=>new Request(origin+'/api/nexus/v1/domain-access-decisions',{method:'POST',headers:{host:'is.example.test',origin:domain,'content-type':'application/json',...extra},body:JSON.stringify(body)});
 assert.equal((await handler(req({cookie:'anything'}))).status,401);
 assert.equal((await handler(req({'x-tenant-id':'forged'}))).status,400);
 assert.equal((await handler(req({origin:'https://other.example.test'}))).status,403);
 assert.equal((await handler(req({}, {admissionContext:'opaque',domainOrigin:'https://other.example.test',operation:'story.read'}))).status,403);
 assert.equal((await handler(req({}, {admissionContext:'opaque',domainOrigin:domain,operation:'story.read',tenantId:'forged'}))).status,400);
});
test('Domain management requires authentication and exact mutation Origin',async()=>{
 const handler=createDomainManagementHandler({enabled:()=>true,publicOrigin:origin,authenticate:async()=>null,service:denied});
 const r=await handler(new Request(origin+'/manage?hostname=tenant.example.test',{headers:{host:'is.example.test'}}));assert.equal(r.status,401);
 const bad=await handler(new Request(origin+'/manage',{method:'POST',headers:{host:'is.example.test',origin:domain,'content-type':'application/json'},body:'{}'}));assert.equal(bad.status,403);
});
