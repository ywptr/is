// Runs only a disposable local PostgreSQL cluster. Never reads DATABASE_URL.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createMembershipService} from '../../src/lib/nexus-memberships/service.ts';
import {hasMembershipAuthority} from '../../src/lib/nexus-memberships/access.ts';
import {createMembershipHandler} from '../../src/lib/nexus-memberships/http.ts';
const run=promisify(execFile);
const root=resolve(import.meta.dirname,'../..');
const tenantA='10000000-0000-0000-0000-000000000001',tenantB='10000000-0000-0000-0000-000000000002';
const context=(tenantId=tenantA,actorId='operator',mode='operator')=>({tenantId,actorId,mode,requestId:randomUUID()});
const change=(role='member',status='inactive',expectedVersion=1)=>({role,status,expectedVersion,reason:'Synthetic test'});
const err=code=>e=>e.message===code;

test('disposable PostgreSQL membership integration and concurrency', {timeout:120000}, async t=>{
  const bin=process.env.IS_MEMBERSHIP_PG_BIN;
  assert.ok(bin,'Set IS_MEMBERSHIP_PG_BIN to a local PostgreSQL bin directory; no existing database is accepted');
  const dir=await mkdtemp(join(tmpdir(),'is-membership-test-'));
  const data=join(dir,'data'),socket=join(dir,'socket');await mkdir(socket);
  const pool=new pg.Pool({host:socket,port:55439,user:'is_membership_test',database:'postgres',max:8,connectionTimeoutMillis:5000});
  let started=false;
  try {
    await run(join(bin,'initdb'),['-D',data,'-U','is_membership_test','--auth=trust','--no-locale']);
    await run(join(bin,'pg_ctl'),['-D',data,'-l',join(dir,'postgres.log'),'-o',`-F -h '' -k ${socket} -p 55439`,'-w','start']);started=true;
    // Synthetic Identity fixture only: production Better Auth tables are never altered.
    await pool.query(`CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" boolean NOT NULL);
      CREATE TABLE "session"(id text PRIMARY KEY,user_id text REFERENCES "user"(id));
      CREATE TABLE "oauthClient"(id text PRIMARY KEY);
      INSERT INTO "user" VALUES ('operator','Operator','operator@example.test',true),('owner','Owner','owner@example.test',true),
      ('admin','Admin','admin@example.test',true),('member','Member','member@example.test',true),('recipient','Recipient','recipient@example.test',true),
      ('unverified','Unverified','unverified@example.test',false),('outsider','Outsider','outsider@example.test',true);
      INSERT INTO "session" VALUES ('preserved-session','owner');INSERT INTO "oauthClient" VALUES ('preserved-client');`);
    const files=(await readdir(join(root,'db/migrations'))).filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort();
    for(const file of files.filter(f=>Number(f.slice(0,4))<7))await pool.query(await readFile(join(root,'db/migrations',file),'utf8'));
    await pool.query(`INSERT INTO is_admission_emails(email) SELECT email FROM "user";
      INSERT INTO nexus_operators(user_id) VALUES('operator');`);
    await pool.query("INSERT INTO nexus_tenants(id,tenant_key,name) VALUES($1,'tenant-a','Tenant A'),($2,'tenant-b','Tenant B')",[tenantA,tenantB]);
    await pool.query(`INSERT INTO nexus_applications(id,app_key,name) VALUES('20000000-0000-0000-0000-000000000001','app','Application');
      INSERT INTO nexus_entitlements(tenant_id,application_id,updated_by) VALUES('${tenantA}','20000000-0000-0000-0000-000000000001','operator');`);
    const snapshot=async()=>{
      const result={};for(const table of ['user','session','oauthClient','nexus_tenants','nexus_entitlements','nexus_operators'])result[table]=(await pool.query(`SELECT * FROM "${table}" ORDER BY 1`)).rows;
      return result;
    };
    const before=await snapshot();
    const migration=await pool.connect();
    try {
      await migration.query('BEGIN');
      await migration.query(await readFile(join(root,'db/migrations/0007_nexus_tenant_memberships.sql'),'utf8'));
      for(const file of files.filter(f=>Number(f.slice(0,4))>7))await migration.query(await readFile(join(root,'db/migrations',file),'utf8'));
      await migration.query('COMMIT');
    }catch(e){await migration.query('ROLLBACK');throw e;}finally{migration.release();}
    const service=createMembershipService(pool);
    await t.test('additive migration preserves preexisting records; empty tenants are not auto-enrolled',async()=>{
      assert.deepEqual(await snapshot(),before);
      const list=await service.list(context(),50,null);assert.equal(list.initialized,false);assert.deepEqual(list.members,[]);
      const owner=await pool.query("SELECT count(*)::int AS n FROM nexus_tenant_memberships");assert.equal(owner.rows[0].n,0);
    });
    await t.test('fresh synthetic schema accepts full immutable migration sequence',async()=>{
      const db=await pool.connect();try {
        await db.query('CREATE SCHEMA fresh_fixture;SET search_path TO fresh_fixture');
        await db.query('CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" boolean)');
        for(const file of files)await db.query(await readFile(join(root,'db/migrations',file),'utf8'));
        assert.equal((await db.query('SELECT count(*)::int n FROM nexus_tenant_memberships')).rows[0].n,0);
        await db.query('SET search_path TO public;DROP SCHEMA fresh_fixture CASCADE');
      }finally{await db.query('SET search_path TO public');db.release();}
    });
    await t.test('first owner is explicit, verified, admitted and operator controlled',async()=>{
      await assert.rejects(service.bootstrap(context(tenantA,'owner','tenant'),'owner','test'),err('forbidden'));
      await assert.rejects(service.bootstrap(context(),'unverified','test'),err('identity_not_eligible'));
      assert.equal((await service.bootstrap(context(),'owner','Initialize tenant')).member.role,'owner');
      await assert.rejects(service.bootstrap(context(),'admin','repeat'),err('already_exists'));
      await service.bootstrap(context(tenantB),'outsider','Initialize other tenant');
    });
    await t.test('last admin demotion/deactivation and raw DELETE fail at commit',async()=>{
      for(const c of [change('member','active'),change('owner','inactive')])await assert.rejects(service.change(context(),'owner',c),err('last_admin_protected'));
      const db=await pool.connect();try{await db.query('BEGIN');await db.query('DELETE FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[tenantA,'owner']);await assert.rejects(db.query('COMMIT'),e=>e.code==='23514');await db.query('ROLLBACK');}finally{db.release();}
      assert.equal((await service.list(context(),50,null)).activeAdminCount,1);
    });
    await t.test('role policy, stale writes and cross-tenant service queries deny unauthorized changes',async()=>{
      await service.add(context(),'admin','admin','Add administrator');await service.add(context(),'member','member','Add member');
      await assert.rejects(service.list(context(tenantB,'owner','tenant'),50,null),err('forbidden'));
      await assert.rejects(service.change(context(tenantB),'owner',change()),err('membership_not_found'));
      await assert.rejects(service.change(context(tenantA,'admin','tenant'),'owner',change()),err('forbidden'));
      await assert.rejects(service.change(context(tenantA,'admin','tenant'),'admin',change('owner','active')),err('forbidden'));
      await assert.rejects(service.change(context(),'member',change('member','inactive',9)),err('stale_version'));
      await service.change(context(tenantA,'admin','tenant'),'member',change());
      assert.equal((await service.list(context(),1,null)).members.length,1);
    });
    async function race(isolation,verb) {
      const raceTenant=randomUUID();
      await pool.query('INSERT INTO nexus_tenants(id,tenant_key,name) VALUES($1,$2,$3)',[raceTenant,'race-'+raceTenant,'Concurrency tenant']);
      await service.bootstrap(context(raceTenant),'owner','Race setup');
      await service.add(context(raceTenant),'admin','admin','Race setup');
      const a=await pool.connect(),b=await pool.connect();
      const remove=async db=>{try{await db.query('COMMIT');return 'committed';}catch(e){await db.query('ROLLBACK');return e.code;}};
      try {
        await a.query(`BEGIN ISOLATION LEVEL ${isolation}`);await b.query(`BEGIN ISOLATION LEVEL ${isolation}`);
        // Establish both snapshots before the first write, including REPEATABLE READ.
        await a.query('SELECT * FROM nexus_tenant_membership_governance');await b.query('SELECT * FROM nexus_tenant_membership_governance');
        const sql=verb==='delete'?'DELETE FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id=$2':"UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1 AND user_id=$2";
        await a.query(sql,[raceTenant,'owner']);
        let settled=false;const pending=b.query(sql,[raceTenant,'admin']).then(()=>remove(b),async e=>{await b.query('ROLLBACK');return e.code;}).finally(()=>{settled=true;});
        // Poll the server for the blocked backend, not a timing-only assertion.
        for(let i=0;i<100&&!settled;i++){const waiting=await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query=$1",[sql]);if(waiting.rowCount)break;await new Promise(r=>setTimeout(r,5));}
        const first=await remove(a),second=await pending;
        assert.equal(first,'committed');assert.ok(['23514','40001'].includes(second),`${isolation}: ${second}`);
        const g=(await pool.query(`SELECT g.active_admin_count,(SELECT count(*)::int FROM nexus_tenant_memberships m WHERE m.tenant_id=g.tenant_id AND m.status='active' AND m.role IN ('owner','admin')) AS actual
          FROM nexus_tenant_membership_governance g WHERE tenant_id=$1`,[raceTenant])).rows[0];
        assert.deepEqual(g,{active_admin_count:1,actual:1});
        console.log(`Concurrency ${isolation}/${verb}: first=${first}, second=${second}, active admins=${g.actual}`);
      }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}
    }
    await t.test('READ COMMITTED concurrent deactivation serializes and protects last administrator',()=>race('READ COMMITTED','deactivate'));
    await t.test('REPEATABLE READ concurrent deactivation aborts stale transaction',()=>race('REPEATABLE READ','deactivate'));
    await t.test('READ COMMITTED concurrent DELETE protects final administrator',()=>race('READ COMMITTED','delete'));
    await t.test('REPEATABLE READ concurrent DELETE rejects stale snapshot',()=>race('REPEATABLE READ','delete'));
    await t.test('simultaneous service requests cannot deactivate two administrators',async()=>{
      const raceTenant=randomUUID();await pool.query('INSERT INTO nexus_tenants(id,tenant_key,name) VALUES($1,$2,$3)',[raceTenant,'api-'+raceTenant,'Service race']);
      await service.bootstrap(context(raceTenant),'owner','Race setup');await service.add(context(raceTenant),'admin','admin','Race setup');
      const results=await Promise.allSettled([service.change(context(raceTenant),'owner',change('owner','inactive')),service.change(context(raceTenant),'admin',change('admin','inactive'))]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.message,'last_admin_protected');
      assert.equal((await service.list(context(raceTenant),50,null)).activeAdminCount,1);
      console.log('Concurrent service requests: one success, one last_admin_protected, active admins=1');
    });
    await t.test('concurrent bootstrap creates exactly one first owner and audit event',async()=>{
      const id=randomUUID();await pool.query('INSERT INTO nexus_tenants(id,tenant_key,name) VALUES($1,$2,$3)',[id,'bootstrap-'+id,'Bootstrap race']);
      const results=await Promise.allSettled([service.bootstrap(context(id),'owner','First attempt'),service.bootstrap(context(id),'admin','Second attempt')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal((await service.list(context(id),50,null)).activeAdminCount,1);
      assert.equal((await pool.query("SELECT count(*)::int n FROM nexus_tenant_membership_audit WHERE tenant_id=$1 AND action='bootstrap'",[id])).rows[0].n,1);
    });
    await t.test('revoking actor role while request waits is rechecked after tenant lock',async()=>{
      const db=await pool.connect();let pending;
      try {
        await db.query('BEGIN');await db.query('SELECT 1 FROM nexus_tenants WHERE id=$1 FOR UPDATE',[tenantA]);
        await db.query("UPDATE nexus_tenant_memberships SET role='member' WHERE tenant_id=$1 AND user_id='admin'",[tenantA]);
        pending=service.change(context(tenantA,'admin','tenant'),'member',change());
        // Attach rejection handler immediately; release serialization lock after server sees waiter.
        const checked=assert.rejects(pending,err('forbidden'));
        let blocked=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock'")).rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,5));}
        assert.ok(blocked,'request waited on tenant lock');await db.query('COMMIT');await checked;
      }finally{await db.query('ROLLBACK');db.release();}
      const m=(await pool.query("SELECT version FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id='admin'",[tenantA])).rows[0];
      await service.change(context(),'admin',change('admin','active',m.version));
    });
    await t.test('actor row lock also detects revocation without a cooperating tenant lock',async()=>{
      const db=await pool.connect();try {
        await db.query('BEGIN');
        await db.query("UPDATE nexus_tenant_memberships SET role='member' WHERE tenant_id=$1 AND user_id='admin'",[tenantA]);
        const pending=assert.rejects(service.change(context(tenantA,'admin','tenant'),'member',change()),err('forbidden'));
        let blocked=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock'")).rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,5));}
        assert.ok(blocked);await db.query('COMMIT');await pending;
      }finally{await db.query('ROLLBACK');db.release();}
      const m=(await pool.query("SELECT version FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id='admin'",[tenantA])).rows[0];
      await service.change(context(),'admin',change('admin','active',m.version));
    });
    await t.test('multi-row change, direct counter tampering, key moves and TRUNCATE cannot bypass invariant',async()=>{
      await assert.rejects(pool.query("UPDATE nexus_tenant_membership_governance SET active_admin_count=99 WHERE tenant_id=$1",[tenantA]),e=>e.code==='23514');
      await assert.rejects(pool.query('TRUNCATE nexus_tenant_memberships'),e=>e.code==='23514');
      await assert.rejects(pool.query('UPDATE nexus_tenant_memberships SET tenant_id=$1 WHERE tenant_id=$2',[tenantB,tenantA]),e=>e.code==='23514');
      await assert.rejects(pool.query("UPDATE nexus_tenant_memberships SET status='inactive' WHERE tenant_id=$1",[tenantA]),e=>e.code==='23514');
      await assert.rejects(pool.query('INSERT INTO nexus_tenant_membership_governance(tenant_id) SELECT gen_random_uuid()'),e=>['23503','23514'].includes(e.code));
    });
    await t.test('uninitialized governance cannot commit without owner; audit is append only',async()=>{
      const id=randomUUID();await pool.query('INSERT INTO nexus_tenants(id,tenant_key,name) VALUES($1,$2,$3)',[id,'empty-'+id,'Empty governance']);
      await assert.rejects(pool.query('INSERT INTO nexus_tenant_membership_governance(tenant_id) VALUES($1)',[id]),e=>e.code==='23514'&&e.constraint==='nexus_last_active_admin');
      await assert.rejects(pool.query('DELETE FROM nexus_tenant_membership_audit'),e=>e.code==='23514');
      await assert.rejects(pool.query("UPDATE nexus_tenant_membership_audit SET reason='tampered'"),e=>e.code==='23514');
      await pool.query('CREATE ROLE nexus_membership_test_runtime;GRANT USAGE ON SCHEMA public TO nexus_membership_test_runtime;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO nexus_membership_test_runtime');
      const db=await pool.connect();try {
        await db.query('SET ROLE nexus_membership_test_runtime');
        await assert.rejects(db.query('TRUNCATE nexus_tenant_memberships'),e=>e.code==='42501');
        await assert.rejects(db.query('ALTER TABLE nexus_tenant_memberships DISABLE TRIGGER ALL'),e=>e.code==='42501');
        await assert.rejects(db.query('UPDATE nexus_tenant_membership_governance SET active_admin_count=99'),e=>e.code==='23514');
        await assert.rejects(db.query('DELETE FROM nexus_tenant_membership_audit'),e=>e.code==='23514');
      }finally{await db.query('RESET ROLE');db.release();}
    });
    await t.test('transaction rollback and audit failure leave membership and counters unchanged',async()=>{
      const m=(await pool.query('SELECT * FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[tenantA,'member'])).rows[0];
      await pool.query(`CREATE FUNCTION test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit failure';END;$$;
        CREATE TRIGGER test_audit_failure BEFORE INSERT ON nexus_tenant_membership_audit FOR EACH ROW EXECUTE FUNCTION test_reject_audit();`);
      await assert.rejects(service.change(context(),'member',change('member','active',m.version)));
      await pool.query('DROP TRIGGER test_audit_failure ON nexus_tenant_membership_audit;DROP FUNCTION test_reject_audit()');
      assert.deepEqual((await pool.query('SELECT * FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id=$2',[tenantA,'member'])).rows[0],m);
    });
    await t.test('owner self-service can manage own tenant; admin cannot grant elevated invitations',async()=>{
      const admin=(await pool.query("SELECT version FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id='admin'",[tenantA])).rows[0];
      await service.change(context(),'admin',change('admin','active',admin.version));
      await assert.rejects(service.invite(context(tenantA,'admin','tenant'),'recipient@example.test',null,'owner','test'),err('forbidden'));
    });
    await t.test('invitation token is one-time; wrong recipient, forged tenant and replay cannot enroll',async()=>{
      const invitation=await service.invite(context(),'recipient@example.test','recipient','member','Invite recipient');
      const listed=await service.invitations(context(),100,null);assert.ok(!JSON.stringify(listed).includes(invitation.token));assert.ok(!JSON.stringify(listed).includes('token_digest'));
      await assert.rejects(service.accept('outsider',invitation.token,randomUUID()),err('invitation_unavailable'));
      const results=await Promise.allSettled([service.accept('recipient',invitation.token,randomUUID()),service.accept('recipient',invitation.token,randomUUID())]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      await assert.rejects(service.accept('recipient',invitation.token,randomUUID()),err('invitation_unavailable'));
      const cross=(await pool.query("SELECT count(*)::int AS n FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id='recipient'",[tenantB])).rows[0];assert.equal(cross.n,0);
    });
    await t.test('expiry, revocation, unverified email, admission removal and inviter demotion fail closed',async()=>{
      const inv=await service.invite(context(),'unverified@example.test',null,'member','Invite');
      await assert.rejects(service.accept('unverified',inv.token,randomUUID()),err('identity_not_eligible'));
      await service.revoke(context(),inv.invitation.id,'Revoke');
      await assert.rejects(service.accept('unverified',inv.token,randomUUID()),err('invitation_unavailable'));
      const expired=await service.invite(context(),'outsider@example.test',null,'member','Invite');
      await pool.query("UPDATE nexus_tenant_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.invitation.id]);
      await assert.rejects(service.accept('outsider',expired.token,randomUUID()),err('invitation_expired'));
      const replacement=await service.invite(context(),'outsider@example.test',null,'member','Replace expired');
      await pool.query("DELETE FROM is_admission_emails WHERE email='outsider@example.test'");
      await assert.rejects(service.accept('outsider',replacement.token,randomUUID()),err('identity_not_eligible'));
      await pool.query("INSERT INTO is_admission_emails(email) VALUES('outsider@example.test')");
      const delegated=await service.invite(context(tenantA,'admin','tenant'),'owner@example.test',null,'member','Delegate');
      const a=(await pool.query("SELECT version FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id='admin'",[tenantA])).rows[0];
      // Restore owner first, then revoke inviter authority.
      const o=(await pool.query("SELECT version FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id='owner'",[tenantA])).rows[0];
      await service.change(context(),'owner',change('owner','active',o.version));
      await service.change(context(),'admin',change('member','active',a.version));
      await assert.rejects(service.accept('owner',delegated.token,randomUUID()),err('forbidden'));
    });
    await t.test('suspended tenant management is operator-only and invitations cannot be accepted',async()=>{
      const suspendedInvite=await service.invite(context(),'new@example.test',null,'member','Suspension test');
      await pool.query("UPDATE nexus_tenants SET status='suspended' WHERE id=$1",[tenantA]);
      await assert.rejects(service.accept('member',suspendedInvite.token,randomUUID()),err('tenant_suspended'));
      await assert.rejects(service.list(context(tenantA,'owner','tenant'),50,null),err('tenant_suspended'));
      assert.ok((await service.list(context(),50,null)).members.length);
      await assert.rejects(service.invite(context(),'outsider@example.test',null,'member','test'),err('tenant_suspended'));
      await pool.query("UPDATE nexus_tenants SET status='active' WHERE id=$1",[tenantA]);
    });
    await t.test('real service with route guard denies cross-tenant owner access and platform admin inheritance',async()=>{
      let user='owner';
      const deps={enabled:()=>true,trustedOrigin:h=>h.get('origin')==='https://is.test',sessionUser:async()=>user,
        authorized:(mode,id,tenant)=>hasMembershipAuthority(pool,mode,id,tenant),service};
      const get=createMembershipHandler(deps,'tenant','list');
      assert.equal((await get(new Request('https://is.test/api'),{tenantId:tenantB})).status,403);
      assert.equal((await get(new Request('https://is.test/api'),{tenantId:tenantA})).status,200);
      assert.equal((await createMembershipHandler(deps,'operator','list')(new Request('https://is.test/api'),{tenantId:tenantA})).status,403);
      user='operator';assert.equal((await createMembershipHandler(deps,'operator','list')(new Request('https://is.test/api'),{tenantId:tenantA})).status,200);
    });
    await t.test('email changes, pinned recipient mismatch and simultaneous revoke/redemption deny unintended enrollment',async()=>{
      const inv=await service.invite(context(),'member@example.test','member','member','Recipient proof test');
      await pool.query("UPDATE \"user\" SET email='changed@example.test' WHERE id='member'");
      await assert.rejects(service.accept('member',inv.token,randomUUID()),err('identity_not_eligible'));
      await pool.query("UPDATE \"user\" SET email='member@example.test' WHERE id='member'");
      await pool.query("UPDATE nexus_tenant_invitations SET user_id='outsider' WHERE id=$1",[inv.invitation.id]);
      await assert.rejects(service.accept('member',inv.token,randomUUID()),err('invitation_unavailable'));
      await pool.query("UPDATE nexus_tenant_invitations SET user_id='member' WHERE id=$1",[inv.invitation.id]);
      const results=await Promise.allSettled([service.revoke(context(),inv.invitation.id,'Race revocation'),service.accept('member',inv.token,randomUUID())]);
      const state=(await pool.query('SELECT state FROM nexus_tenant_invitations WHERE id=$1',[inv.invitation.id])).rows[0].state;
      assert.ok(['revoked','accepted'].includes(state));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const count=(await pool.query("SELECT count(*)::int n FROM nexus_tenant_memberships WHERE tenant_id=$1 AND user_id='member'",[tenantA])).rows[0].n;assert.equal(count,1);
    });
    await t.test('operator authority is rechecked and locked against concurrent revocation',async()=>{
      await pool.query("INSERT INTO nexus_operators(user_id) VALUES('outsider')");
      const db=await pool.connect();try {
        await db.query('BEGIN');await db.query("DELETE FROM nexus_operators WHERE user_id='outsider'");
        const pending=assert.rejects(service.list(context(tenantA,'outsider'),50,null),err('forbidden'));
        let blocked=false;for(let i=0;i<100;i++){if((await pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock'")).rowCount){blocked=true;break;}await new Promise(r=>setTimeout(r,5));}
        assert.ok(blocked);await db.query('COMMIT');await pending;
      }finally{await db.query('ROLLBACK');db.release();}
      await pool.query("INSERT INTO is_administrators(user_id) VALUES('outsider')");
      await assert.rejects(service.list(context(tenantA,'outsider'),50,null),err('forbidden'));
    });
    await t.test('redemption throttling persists across failed attempts',async()=>{
      await pool.query("DELETE FROM nexus_invitation_redemption_limits WHERE user_id='member'");
      for(let i=0;i<20;i++)await assert.rejects(service.accept('member','x'.repeat(43),randomUUID()),err('invitation_unavailable'));
      await assert.rejects(service.accept('member','x'.repeat(43),randomUUID()),err('too_many_attempts'));
    });
    await t.test('audit events exist without tokens and original sessions, clients and entitlements survive',async()=>{
      const audits=(await pool.query('SELECT * FROM nexus_tenant_membership_audit')).rows;
      for(const action of ['bootstrap','add','change','invite','revoke_invitation','expire_invitation','accept_invitation'])assert.ok(audits.some(a=>a.action===action),action);
      assert.ok(audits.every(a=>a.reason&&a.request_id));assert.ok(!JSON.stringify(audits).includes('token_digest'));
      assert.equal((await pool.query('SELECT id FROM "session"')).rows[0].id,'preserved-session');assert.equal((await pool.query('SELECT id FROM "oauthClient"')).rows[0].id,'preserved-client');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM nexus_entitlements')).rows[0].n,1);
    });
  } finally {
    await pool.end();if(started)await run(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});
  }
});
