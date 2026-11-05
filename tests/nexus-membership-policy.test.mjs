import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canManage,isAdmin} from '../src/lib/nexus-memberships/policy.ts';
import {input,page,uuid} from '../src/lib/nexus-memberships/validation.ts';
test('role/status matrix separates operators, owners, admins, members and inactive identities',()=>{
  for(const role of ['owner','admin','member'])for(const status of ['active','inactive'])for(const previous of [null,{role:'owner'},{role:'admin'},{role:'member'}])for(const next of ['owner','admin','member']) {
    const actor={role,status};
    assert.equal(canManage('operator',actor,previous,next),true);
    const expected=status==='active'&&(role==='owner'||(role==='admin'&&(!previous||previous.role==='member')&&next==='member'));
    assert.equal(canManage('tenant',actor,previous,next),expected);
    assert.equal(isAdmin(actor),status==='active'&&role!=='member');
  }
  assert.equal(canManage('tenant',null,null,'member'),false);
});
test('strict input validation rejects actor/tenant injection, invalid changes and unsafe limits',()=>{
  const valid={role:'member',status:'inactive',expectedVersion:1,reason:' test '};
  assert.equal(input('change',valid).reason,'test');
  for(const extra of [{actorId:'attacker'},{tenantId:'other'},{role:'superuser'},{status:'deleted'},{expectedVersion:0},{expectedVersion:1.2},{reason:' '}])assert.throws(()=>input('change',{...valid,...extra}));
  assert.throws(()=>input('bootstrap',{userId:'id',role:'owner',reason:'test'}));
  assert.throws(()=>input('accept',{token:'short'}));
  assert.throws(()=>input('invite',{email:'*@example.com',role:'member',reason:'test',unknown:true}));
  assert.equal(input('invite',{email:' Example@Example.com ',role:'member',reason:'invite'}).email,'example@example.com');
  for(const q of ['limit=0','limit=101','limit=NaN','limit=1.2','cursor='])assert.throws(()=>page(new URL('https://is.test/?'+q)));
  assert.equal(uuid('01234567-0000-0000-0000-000000000000'),true);
});
