/** Exact local-only guards shared by F.3 backup/rehearsal and the unexecuted approval command. */
import assert from 'node:assert/strict';
import pg from 'pg';
import nextEnv from '@next/env';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
export const revision='0012_oauth_client_purposes.sql';
export const reviewedSha='fdcef5d3d4235e221da8f36e4175ef4633e6294080b488ce4e5909aac03b6169';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const gates=()=>Object.fromEntries(['NEXUS_OAUTH_ADMIN_ENABLED','IDENTITY_NEXUS_CREDENTIALS_ENABLED','NEXUS_CONSUMER_API_ENABLED','NEXUS_MEMBERSHIPS_ENABLED'].map(k=>[k,process.env[k]==='true']));
export async function localConfig(){
 assert.equal(process.versions.node.split('.')[0],'24');
 nextEnv.loadEnvConfig(root,true,{info(){},error(){}});
 const u=new URL(process.env.DATABASE_URL);assert(['postgres:','postgresql:'].includes(u.protocol));
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port||'5432','5432');assert.equal(u.pathname,'/is_dev');assert.equal(decodeURIComponent(u.username),'is_dev');
 assert.deepEqual(gates(),{NEXUS_OAUTH_ADMIN_ENABLED:true,IDENTITY_NEXUS_CREDENTIALS_ENABLED:true,NEXUS_CONSUMER_API_ENABLED:false,NEXUS_MEMBERSHIPS_ENABLED:false});
 assert.equal(process.env.NEXUS_CONSUMER_ENVIRONMENT,'development');assert.equal(process.env.NEXUS_CONSUMER_RESOURCE,'https://5480-deb13.lan.com:5180/api/nexus/v1');assert.equal(process.env.BETTER_AUTH_URL,'https://5480-deb13.lan.com:5180');
 const source=[];for(const name of (await readdir(root+'/db/migrations')).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort())source.push({name,sha256:sha(await readFile(root+'/db/migrations/'+name))});
 assert.equal(source.length,11);assert.deepEqual(source.at(-1),{name:revision,sha256:reviewedSha});
 return {source,password:decodeURIComponent(u.password),environmentHash:sha(await readFile(root+'/.env.development.local'))};
}
export const connectLocal=config=>new pg.Client({host:'127.0.0.1',port:5432,database:'is_dev',user:'is_dev',password:config.password,ssl:false,connectionTimeoutMillis:3000,options:'-c statement_timeout=15000 -c lock_timeout=2000'});
export async function digests(db,projected=false){
 const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename),result={};
 for(const table of tables){const quoted='"'+table.replaceAll('"','""')+'"';
  const value=projected&&table==='nexus_application_oauth_clients'?"(to_jsonb(t)-'purpose')::text":'to_jsonb(t)::text';
  const filter=projected&&table==='is_schema_migrations'?' WHERE t.name<>$1':'';
  result[table]=(await db.query(`SELECT count(*)::int rows,md5(COALESCE(string_agg(v,E'\\n' ORDER BY v COLLATE "C"),'')) digest FROM (SELECT ${value} v FROM ${quoted} t${filter}) q`,filter?[revision]:[])).rows[0];
 }
 return result;
}
export async function verifyBefore(db,source){
 const target=(await db.query("SELECT current_database() db,current_user role,host(inet_server_addr()) host,inet_server_port() port,pg_is_in_recovery() standby")).rows[0];assert.deepEqual(target,{db:'is_dev',role:'is_dev',host:'127.0.0.1',port:5432,standby:false});
 assert.equal((await db.query('SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls AS privileged FROM pg_roles WHERE rolname=current_user')).rows[0].privileged,false);
 assert.deepEqual((await db.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows,source.slice(0,-1));
 assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='nexus_application_oauth_clients' AND column_name='purpose'")).rows[0].n,0);
 const client=(await db.query(`SELECT "clientId",disabled,"tokenEndpointAuthMethod","redirectUris",scopes,("clientSecret" IS NOT NULL) has_secret FROM "oauthClient"`)).rows;
 assert.deepEqual(client,[{clientId:'kDCIzSZuiYusmlOPHBDcDVDMflpKiisb',disabled:false,tokenEndpointAuthMethod:'client_secret_basic',redirectUris:['https://5480-deb13.lan.com:5182/api/auth/callback'],scopes:['openid','profile','email'],has_secret:true}]);
 const link=(await db.query('SELECT application_id,environment,oauth_client_id FROM nexus_application_oauth_clients')).rows;assert.deepEqual(link,[{application_id:'09eb0b91-50a2-4606-82f9-47d383ab4ade',environment:'development',oauth_client_id:client[0].clientId}]);
 assert.equal((await db.query('SELECT status FROM nexus_applications WHERE id=$1',[link[0].application_id])).rows[0].status,'disabled');
 for(const table of ['identity_credential_bindings','nexus_consumer_operations','oauthClientResource'])assert.equal((await db.query('SELECT count(*)::int n FROM "'+table+'"')).rows[0].n,0);
 return target;
}
export async function verifyAfter(db,source,before){
 assert.deepEqual((await db.query('SELECT name,sha256 FROM is_schema_migrations ORDER BY name')).rows,source);
 assert.deepEqual(await digests(db,true),before);
 assert.deepEqual((await db.query('SELECT purpose FROM nexus_application_oauth_clients')).rows,[{purpose:'oidc'}]);
 const unique=(await db.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='nexus_application_oauth_clients'::regclass AND conname='nexus_oauth_application_environment_purpose_key'")).rows;
 assert.deepEqual(unique,[{definition:'UNIQUE (application_id, environment, purpose)'}]);
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid='nexus_application_oauth_clients'::regclass AND conname='nexus_application_oauth_clients_application_id_environment_key'")).rows[0].n,0);
 const fks=(await db.query("SELECT count(*)::int n,count(*) FILTER(WHERE NOT convalidated)::int invalid FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f'")).rows[0];assert.deepEqual(fks,{n:55,invalid:0});
 return {ledgerEntries:source.length,oldProjectedTableDigestsMatch:true,tables:Object.keys(before).length,purpose:'oidc',foreignKeys:fks};
}
