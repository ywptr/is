// Runs inside the existing disposable PostgreSQL + real Better Auth fixture only.
// No DATABASE_URL, external service, persistent registration or migration runner.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEligibilityIdentity} from '../../src/lib/identity/eligibility-context.ts';
import {createEligibilityService} from '../../src/lib/nexus-eligibility/service.ts';

export async function runInternalEligibilityTests(t,f) {
  const {pool,auth,integration,client,app,operation,call,decision,actor}=f;
  const ctx=await auth.$context;
  const person=await ctx.test.saveUser(ctx.test.createUser({email:'internal-human@example.test',emailVerified:true}));
  const login=await ctx.test.login({userId:person.id});
  await pool.query('INSERT INTO is_admission_emails(email) VALUES($1),($2) ON CONFLICT DO NOTHING',[person.email,f.user.email]);
  let enabled=true;
  const options={policy:integration.registry.policy,transaction:integration.registry.transaction,enabled:()=>enabled,
    authenticate:async headers=>{
      const session=await auth.api.getSession({headers,query:{disableCookieCache:true}});
      return session?{userId:session.user.id,sessionId:session.session.id}:null;
    }};
  const identity=createEligibilityIdentity(options),service=createEligibilityService(identity);
  let context=await identity.verify(login.headers,client.client_id);
  const error=code=>e=>e.code===code;
  const tenant=async(key,{status='active',governed=true,member=true,entitled=true}={})=>{
    const id=randomUUID();
    await pool.query('INSERT INTO nexus_tenants(id,tenant_key,name,status) VALUES($1,$2,$2,$3)',[id,'internal-'+key,status]);
    if(governed) {
      const tx=await pool.connect();
      try {
        await tx.query('BEGIN');
        await tx.query('INSERT INTO nexus_tenant_membership_governance(tenant_id) VALUES($1)',[id]);
        // Keep a different owner so member inactivation can never orphan an admin.
        await tx.query(`INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by)
          VALUES($1,$2,'owner','active',$2,$2)`,[id,f.user.id]);
        if(member)await tx.query(`INSERT INTO nexus_tenant_memberships(tenant_id,user_id,role,status,created_by,updated_by)
          VALUES($1,$2,'member','active',$3,$3)`,[id,person.id,f.user.id]);
        await tx.query('COMMIT');
      } catch(e) {await tx.query('ROLLBACK');throw e;} finally {tx.release();}
    }
    if(entitled)await pool.query('INSERT INTO nexus_entitlements(tenant_id,application_id,enabled,updated_by) VALUES($1,$2,true,$3)',[id,app,f.user.id]);
    return id;
  };
  const evaluate=(id,instance=service,capability=context)=>instance.evaluateAccess(capability,{tenantId:id,operation});
  let first,second;
  await t.test('Internal eligibility: zero, one, multiple tenants; metadata and context-bound pagination',async()=>{
    const members=(await pool.query('SELECT count(*)::int n FROM nexus_tenant_memberships')).rows[0].n;
    assert.deepEqual((await service.listEligibleTenants(context)).tenants,[]);
    assert.equal((await pool.query('SELECT count(*)::int n FROM nexus_tenant_memberships')).rows[0].n,members);
    first=await tenant('one');
    let page=await service.listEligibleTenants(context);
    assert.deepEqual(page.tenants.map(x=>x.tenant.id),[first]);
    assert.equal(page.applicationId,app);assert.equal(page.clientId,client.client_id);
    assert.equal(page.tenants[0].membership.role,'member');
    assert.ok(Date.parse(page.metadata.validUntil)-Date.parse(page.metadata.evaluatedAt)<=5000);
    for(const key of ['policyRevision','identityRevision','consumerGrantVersion'])assert.match(page.metadata[key],/^[1-9][0-9]*$/);
    second=await tenant('two');
    page=await service.listEligibleTenants(context,{limit:1});assert.ok(page.nextCursor);
    const next=await service.listEligibleTenants(context,{limit:1,cursor:page.nextCursor});
    assert.equal(next.tenants.length,1);assert.notEqual(next.tenants[0].tenant.id,page.tenants[0].tenant.id);assert.equal(next.nextCursor,null);
    await assert.rejects(service.listEligibleTenants(context,{limit:2,cursor:page.nextCursor}));
    await assert.rejects(service.listEligibleTenants(context,{cursor:{}}));
    const another=await identity.verify(login.headers,client.client_id);
    await assert.rejects(service.listEligibleTenants(another,{limit:1,cursor:page.nextCursor}));
    await pool.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[second,app]);
    await assert.rejects(service.listEligibleTenants(context,{limit:1,cursor:page.nextCursor}));
    await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[second,app]);
  });
  await t.test('Internal eligibility: hidden, inactive, suspended, uninitialized and unentitled contexts are uniform',async()=>{
    const inactive=await tenant('inactive');
    await pool.query("UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2",[inactive,person.id]);
    const unavailable=[randomUUID(),inactive,await tenant('suspended',{status:'suspended'}),await tenant('uninitialized',{governed:false}),
      await tenant('no-entitlement',{entitled:false}),await tenant('other-human',{member:false})];
    await pool.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[second,app]);
    unavailable.push(second);
    for(const id of unavailable) {
      assert.equal((await evaluate(id)).allowed,false);
      assert.deepEqual(await service.getEffectiveSelfMembership(context,id),{available:false});
      assert.deepEqual(await service.evaluateTenantApplication(context,id),{available:false});
    }
    assert.deepEqual((await service.listEligibleTenants(context)).tenants.map(x=>x.tenant.id),[first]);
    await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[second,app]);
    assert.equal((await service.getEffectiveSelfMembership(context,first)).context.membership.status,'active');
    assert.equal((await service.evaluateTenantApplication(context,first)).context.entitlement.effective,true);
  });
  await t.test('Internal eligibility: real session, trusted client/app/environment; no ID or context forgery',async()=>{
    await assert.rejects(identity.verify(new Headers({'x-user-id':person.id}),client.client_id),error('invalid_context'));
    await assert.rejects(identity.verify(login.headers,randomUUID()),error('invalid_context'));
    await assert.rejects(service.listEligibleTenants({...context,userId:f.user.id,applicationId:app}),error('invalid_context'));
    await assert.rejects(createEligibilityService(createEligibilityIdentity(options)).listEligibleTenants(context),error('invalid_context'));
    await assert.rejects(service.evaluateAccess(context,{tenantId:first,operation,applicationId:randomUUID()}),error('invalid_request'));
    await assert.rejects(service.listEligibleTenants(context,{userId:f.user.id}),error('invalid_request'));
    assert.equal((await service.evaluateAccess(context,{tenantId:first,operation:'unknown:operation'})).allowed,false);
    for(const [sql,restore] of [
      ['UPDATE identity_credential_bindings SET enabled=false WHERE client_id=$1','UPDATE identity_credential_bindings SET enabled=true WHERE client_id=$1'],
      ["UPDATE nexus_application_oauth_clients SET environment='staging' WHERE oauth_client_id=$1","UPDATE nexus_application_oauth_clients SET environment='development' WHERE oauth_client_id=$1"],
      ["UPDATE nexus_application_oauth_clients SET purpose='oidc' WHERE oauth_client_id=$1","UPDATE nexus_application_oauth_clients SET purpose='nexus_consumer' WHERE oauth_client_id=$1"],
      ['UPDATE "oauthClient" SET disabled=true WHERE "clientId"=$1','UPDATE "oauthClient" SET disabled=false WHERE "clientId"=$1'],
    ]) {
      await pool.query(sql,[client.client_id]);
      try {await assert.rejects(service.listEligibleTenants(context),error('invalid_context'));}
      finally {await pool.query(restore,[client.client_id]);}
    }
    await pool.query("UPDATE nexus_applications SET status='disabled' WHERE id=$1",[app]);
    try {await assert.rejects(evaluate(first),error('invalid_context'));}
    finally {await pool.query("UPDATE nexus_applications SET status='active' WHERE id=$1",[app]);}
    enabled=false;try{await assert.rejects(evaluate(first),error('dependency_unavailable'));}finally{enabled=true;}
  });
  await t.test('Internal eligibility: another verified human cannot enumerate or read member tenants',async()=>{
    const outsider=await ctx.test.saveUser(ctx.test.createUser({email:'internal-outsider@example.test',emailVerified:true}));
    await pool.query('INSERT INTO is_admission_emails(email) VALUES($1)',[outsider.email]);
    const session=await ctx.test.login({userId:outsider.id});
    const other=await identity.verify(session.headers,client.client_id);
    assert.deepEqual((await service.listEligibleTenants(other)).tenants,[]);
    assert.equal((await evaluate(first,service,other)).allowed,false);
    assert.deepEqual(await service.getEffectiveSelfMembership(other,first),{available:false});
    await pool.query('DELETE FROM "session" WHERE id=$1',[session.session.id]);
    await assert.rejects(service.listEligibleTenants(other),error('invalid_context'));
  });
  await t.test('Internal eligibility: compatibility with all four real Consumer HTTP APIs',async()=>{
    const own=await identity.verify(f.login.headers,client.client_id);
    const page=await service.listEligibleTenants(own,{limit:100});
    const external=await call('/me/tenants?limit=100');assert.equal(external.status,200);
    assert.deepEqual(page.tenants.map(x=>({tenant:{...x.tenant,version:x.versions.tenant},membership:{...x.membership,version:Number(x.membership.version)}})),external.body.tenants);
    const id=first;
    const internal=await service.evaluateAccess(own,{tenantId:id,operation});
    const current=await decision(id);assert.equal(current.status,200);assert.equal(current.body.allowed,true);assert.equal(internal.allowed,true);
    assert.equal(internal.context.membership.version,String(current.body.membershipVersion));
    assert.equal(internal.context.versions.entitlement,current.body.versions.entitlement);
    assert.equal(internal.metadata.consumerGrantVersion,current.body.versions.consumerGrant);
    const membership=await call(`/tenants/${id}/membership`);
    const entitlement=await call(`/tenants/${id}/applications/${app}/entitlements`);
    assert.equal(membership.status,200);assert.equal(entitlement.status,200);
    assert.equal((await service.getEffectiveSelfMembership(own,id)).context.membership.role,membership.body.membership.role);
    assert.equal((await service.evaluateTenantApplication(own,id)).context.entitlement.version,entitlement.body.version);
  });
  await t.test('Internal eligibility: concurrent membership/entitlement revocation uses one consistent snapshot',async()=>{
    for(const kind of ['membership','entitlement']) {
      const before=await evaluate(first);
      let signal,resume;
      const captured=new Promise(r=>signal=r),release=new Promise(r=>resume=r);
      const paused={...identity,run:(cap,work)=>identity.run(cap,async(...args)=>{signal();await release;return work(...args);})};
      const waiting=evaluate(first,createEligibilityService(paused));
      await captured;
      // Independent pool connection commits revocation after the Identity snapshot.
      const writer=await pool.connect();
      try {
        if(kind==='membership')await writer.query("UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2",[first,person.id]);
        else await writer.query('UPDATE nexus_entitlements SET enabled=false WHERE tenant_id=$1 AND application_id=$2',[first,app]);
      } finally {writer.release();resume();}
      const earlier=await waiting;
      assert.equal(earlier.allowed,true);assert.equal(earlier.metadata.policyRevision,before.metadata.policyRevision);
      assert.deepEqual(earlier.context.versions,before.context.versions);
      assert.ok(Date.parse(earlier.metadata.validUntil)-Date.parse(earlier.metadata.evaluatedAt)<=5000);
      const denied=await evaluate(first);assert.equal(denied.allowed,false);assert.equal('metadata' in denied,false);
      if(kind==='membership')await pool.query("UPDATE nexus_tenant_memberships SET status='active' WHERE tenant_id=$1 AND user_id=$2",[first,person.id]);
      else await pool.query('UPDATE nexus_entitlements SET enabled=true WHERE tenant_id=$1 AND application_id=$2',[first,app]);
      const restored=await evaluate(first);
      assert.ok(BigInt(restored.metadata.policyRevision)>BigInt(before.metadata.policyRevision));
      assert.ok(BigInt(restored.context.versions[kind])>BigInt(before.context.versions[kind]));
    }
  });
  await t.test('Internal eligibility: missing policy/schema, database failure and audit failure never allow',async()=>{
    const tx=await pool.connect();
    try {
      await tx.query('ALTER TABLE nexus_consumer_revision RENAME TO internal_revision_unavailable');
      await assert.rejects(evaluate(first),error('dependency_unavailable'));
    } finally {await tx.query('ALTER TABLE internal_revision_unavailable RENAME TO nexus_consumer_revision');tx.release();}
    await pool.query(`CREATE FUNCTION fail_internal_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic'; END $$;
      CREATE TRIGGER fail_internal_audit BEFORE INSERT ON nexus_consumer_audit FOR EACH ROW EXECUTE FUNCTION fail_internal_audit()`);
    const count=(await pool.query('SELECT count(*)::int n FROM nexus_consumer_audit')).rows[0].n;
    try {await assert.rejects(evaluate(first),error('dependency_unavailable'));}
    finally {await pool.query('DROP TRIGGER fail_internal_audit ON nexus_consumer_audit;DROP FUNCTION fail_internal_audit()');}
    assert.equal((await pool.query('SELECT count(*)::int n FROM nexus_consumer_audit')).rows[0].n,count);
    const broken=createEligibilityIdentity({...options,transaction:async()=>{throw new Error('synthetic database failure');}});
    await assert.rejects(broken.verify(login.headers,client.client_id),error('identity_unavailable'));
    assert.equal((await evaluate(first)).allowed,true);
  });
  await t.test('Internal eligibility: expired sessions, unverified identities and late results fail closed',async()=>{
    await pool.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1',[person.id]);
    try {await assert.rejects(evaluate(first),error('invalid_context'));}
    finally {await pool.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1',[person.id]);}
    const expiry=(await pool.query('SELECT "expiresAt" FROM "session" WHERE id=$1',[login.session.id])).rows[0].expiresAt;
    await pool.query(`UPDATE "session" SET "expiresAt"=clock_timestamp()-interval '1 second' WHERE id=$1`,[login.session.id]);
    try {await assert.rejects(evaluate(first),error('invalid_context'));}
    finally {await pool.query('UPDATE "session" SET "expiresAt"=$2 WHERE id=$1',[login.session.id,expiry]);}
    // Move the application clock only after policy/audit evaluation. This tests
    // the production post-work deadline guard without sleeping or using stale data.
    const realNow=Date.now;
    const late={...identity,run:(cap,work)=>identity.run(cap,async(...args)=>{
      const value=await work(...args);Date.now=()=>realNow()+6000;return value;
    })};
    try {await assert.rejects(evaluate(first,createEligibilityService(late)),error('dependency_unavailable'));}
    finally {Date.now=realNow;}
    assert.equal((await evaluate(first)).allowed,true);
  });
  await t.test('Internal eligibility: global permit, session/user generations and re-enable cannot revive old contexts',async()=>{
    await pool.query('DELETE FROM is_admission_emails WHERE email=$1',[person.email]);
    try {await assert.rejects(evaluate(first),error('invalid_context'));}
    finally {await pool.query('INSERT INTO is_admission_emails(email) VALUES($1)',[person.email]);}
    for(const [kind,key] of [['session',login.session.id],['user',person.id],['client',client.client_id]]) {
      await integration.registry.invalidate(kind,key,actor());
      await assert.rejects(evaluate(first),error('invalid_context'));
      await integration.registry.invalidate(kind,key,actor(),true);
      await assert.rejects(evaluate(first),error('invalid_context'));
      context=await identity.verify(login.headers,client.client_id);
      assert.equal((await evaluate(first)).allowed,true);
    }
  });
}
