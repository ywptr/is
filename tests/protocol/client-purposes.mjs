import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

export async function runPurposeMigrationTests(t,{pool,migrationNames}){
 for(const conflicting of [false,true])await t.test(`0012 populated purpose migration ${conflicting?'rejects ambiguous bindings atomically':'preserves OIDC and classified consumer history'}`,async()=>{
  const tx=await pool.connect();try{
   await tx.query('BEGIN; CREATE SCHEMA purpose_rehearsal; SET LOCAL search_path TO purpose_rehearsal');
   await tx.query('CREATE TABLE "user"(id text PRIMARY KEY,name text,email text,"emailVerified" boolean)');
   for(const file of migrationNames.filter(f=>Number(f.slice(0,4))<12))await tx.query(await readFile('db/migrations/'+file,'utf8'));
   await tx.query("INSERT INTO \"user\" VALUES('purpose-operator','Operator','purpose@example.test',true)");
   const app=randomUUID(),other=randomUUID();
   await tx.query("INSERT INTO nexus_applications(id,app_key,name) VALUES($1,'oidc-app','OIDC app'),($2,'consumer-app','Consumer app')",[app,other]);
   await tx.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by) VALUES($1,'development','preserved-oidc','["https://oidc.example.test/callback"]','purpose-operator'),($2,'development','preserved-consumer','[]','purpose-operator')`,[app,other]);
   await tx.query("INSERT INTO identity_credential_authorities(issuer) VALUES('https://purpose.example.test/api/auth')");
   await tx.query(`INSERT INTO identity_credential_bindings(issuer,client_id,audience,environment,application_id,scopes,enabled) VALUES('https://purpose.example.test/api/auth','preserved-consumer','https://purpose.example.test/api/nexus/v1','development',$1,ARRAY['nexus:tenants:read'],false)`,[conflicting?app:other]);
   const before=(await tx.query('SELECT * FROM nexus_application_oauth_clients ORDER BY oauth_client_id')).rows;
   const auditBefore=(await tx.query('SELECT * FROM nexus_registry_audit ORDER BY id')).rows;
   await tx.query('SAVEPOINT migration');const sql=await readFile('db/migrations/0012_oauth_client_purposes.sql','utf8');
   if(conflicting){
    await assert.rejects(tx.query(sql),e=>e.message==='OAuth binding reconciliation required');await tx.query('ROLLBACK TO SAVEPOINT migration');
    assert.deepEqual((await tx.query('SELECT * FROM nexus_application_oauth_clients ORDER BY oauth_client_id')).rows,before);
   }else{
    await tx.query(sql);
    const after=(await tx.query('SELECT * FROM nexus_application_oauth_clients ORDER BY oauth_client_id')).rows;
    assert.deepEqual(after,before.map(row=>({...row,purpose:row.oauth_client_id==='preserved-oidc'?'oidc':'nexus_consumer'})));
    assert.deepEqual((await tx.query('SELECT * FROM nexus_registry_audit ORDER BY id')).rows,auditBefore);
    await tx.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by,purpose) VALUES($1,'development','new-consumer','[]','purpose-operator','nexus_consumer')`,[app]);
    await tx.query('SAVEPOINT duplicate');
    await assert.rejects(tx.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by,purpose) VALUES($1,'development','duplicate-consumer','[]','purpose-operator','nexus_consumer')`,[app]),e=>e.code==='23505');await tx.query('ROLLBACK TO SAVEPOINT duplicate');
    await tx.query('SAVEPOINT oidc_duplicate');
    await assert.rejects(tx.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by) VALUES($1,'development','duplicate-oidc','[]','purpose-operator')`,[app]),e=>e.code==='23505');await tx.query('ROLLBACK TO SAVEPOINT oidc_duplicate');
   }
  }finally{await tx.query('ROLLBACK');tx.release();}
 });
}
