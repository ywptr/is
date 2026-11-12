/** Identity-owned administration; native APIs plus the pinned atomic provisioning bridge. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { importJWK, decodeJwt } from 'jose';
import type { Pool, PoolClient } from 'pg';
import type { CredentialPolicy } from './access-credentials.ts';
import { purposeSchemaReady } from './client-purposes.ts';
export const nexusScopes=['nexus:tenants:read','nexus:membership:self','nexus:access:evaluate','nexus:entitlements:read'];
const authority=new AsyncLocalStorage<{userId:string;sessionId:string;action:AdminInput['action'];audience:string}>();
export const inClientProvisioning=()=>authority.getStore()?.action==='provision';
export const inCredentialAdministration=()=>!!authority.getStore();
export function inResourceAdministration(userId:string,action:string,resourceId?:string){
 const a=authority.getStore();if(!a||a.userId!==userId||(resourceId!==undefined&&resourceId!==a.audience))return false;
 if(action==='list'||action==='read')return a.action==='resource'||a.action==='provision';
 if(action==='create')return a.action==='resource';
 return action==='link'&&a.action==='provision';
}

export async function authorizeCredentialAdministration(tx:PoolClient,actor:{actorId:string}) {
 const principal=authority.getStore();if(!principal||principal.userId!==actor.actorId)return false;
 return (await tx.query(`SELECT 1 FROM nexus_operators o JOIN "session" s ON s."userId"=o.user_id JOIN "user" u ON u.id=o.user_id
 WHERE o.user_id=$1 AND s.id=$2 AND s."expiresAt">clock_timestamp() AND u."emailVerified" FOR SHARE OF o,s,u`,[principal.userId,principal.sessionId])).rowCount===1;
}
export class AdministrationError extends Error {readonly status:number;readonly code:string;constructor(status:number,code:string){super(code);this.status=status;this.code=code;}}
const fail=(code:string,status=400):never=>{throw new AdministrationError(status,code);};
export async function publicKeys(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))return fail('invalid_public_keys');
 const obj=value as Record<string,unknown>;if(Object.keys(obj).join(',')!=='keys'||!Array.isArray(obj.keys)||obj.keys.length<1||obj.keys.length>2)return fail('invalid_public_keys');
 const kids=new Set();for(const key of obj.keys){if(!key||typeof key!=='object'||Array.isArray(key))return fail('invalid_public_keys');
 const k=key as Record<string,unknown>;if(Object.keys(k).some(x=>!['kty','crv','x','y','kid','alg','use'].includes(x))||k.kty!=='EC'||k.crv!=='P-256'||k.alg!=='ES256'||k.use!=='sig'||typeof k.kid!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(k.kid)||kids.has(k.kid))return fail('invalid_public_keys');kids.add(k.kid);try{await importJWK(k,'ES256');}catch{return fail('invalid_public_keys');}}
 return obj as {keys:Record<string,unknown>[]};
}
export interface AdminInput {action:'resource'|'provision'|'disable'|'enable'|'keys'|'revoke_token'|'invalidate';requestId:string;reason:string;environment:'development';applicationId?:string;clientId?:string;assertion?:string;jwks?:unknown;operations?:string[];tokenId?:string;kind?:'session'|'user'|'sender_key'|'signing_key';key?:string}
export async function parseAdminInput(raw:unknown):Promise<AdminInput>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('invalid_body');const r=raw as Record<string,unknown>;
 const common=['action','requestId','reason','environment'];const fields:Record<string,string[]>={resource:[],provision:['applicationId','jwks','operations'],disable:['clientId'],enable:['clientId'],keys:['clientId','jwks','assertion'],revoke_token:['tokenId'],invalidate:['kind','key']};
 if(typeof r.action!=='string'||!Object.hasOwn(fields,r.action)||Object.keys(r).some(k=>![...common,...fields[r.action as string]].includes(k))||r.environment!=='development'||typeof r.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(r.requestId)||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>512)return fail('invalid_body');
 for(const f of fields[r.action])if(!(f in r))return fail('invalid_body');
 if(r.applicationId!==undefined&&(typeof r.applicationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.applicationId)))return fail('invalid_application');
 for(const k of ['clientId','tokenId','key'])if(r[k]!==undefined&&(typeof r[k]!=='string'||!(r[k] as string).trim()||(r[k] as string).length>2048))return fail('invalid_target');
 if(r.kind!==undefined&&!['session','user','sender_key','signing_key'].includes(String(r.kind)))return fail('invalid_kind');
 if(r.action==='keys'){if(typeof r.assertion!=='string'||r.assertion.length>4096)return fail('invalid_assertion');try{const c=decodeJwt(r.assertion);if(c.sub!==r.clientId||c.iss!==r.clientId)return fail('invalid_assertion');}catch{return fail('invalid_assertion');}}
 if(r.jwks!==undefined)await publicKeys(r.jwks);
 if(r.operations!==undefined&&(!Array.isArray(r.operations)||r.operations.length!==1||r.operations[0]!=='sandcastle:tenant.access'))return fail('invalid_operations');
 return r as unknown as AdminInput;
}
function verifyClient(c:Record<string,unknown>,jwks:unknown,disabled:boolean,audience:string){
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 const scopes=typeof c.scope==='string'?c.scope.split(' ').filter(Boolean).sort():[];
 if(c.disabled!==disabled||c.token_endpoint_auth_method!=='private_key_jwt'||c.require_pkce!==true||c.dpop_bound_access_tokens!==true||c.skip_consent!==false||c.subject_type!=='public'||
 !same(c.redirect_uris,['https://5480-deb13.lan.com:5182/api/auth/callback'])||!same(c.grant_types,['authorization_code'])||!same(c.response_types,['code'])||!same(c.resources,[audience])||!same(scopes,[...nexusScopes].sort())||
 (jwks!==undefined&&!same(c.jwks,jwks)))return fail('client_readback_failed',503);
}
export interface ProviderAdministration {rotateKeys(assertion:string,jwks:unknown):Promise<{client_id:string}>;createResource(body:Record<string,unknown>):Promise<unknown>;getResource():Promise<Record<string,unknown>|null>;createDisabledClient(body:Record<string,unknown>,verify:(record:Record<string,unknown>)=>void):Promise<{client_id:string}>;updateClient(clientId:string,update:Record<string,unknown>):Promise<unknown>;getClient(clientId:string):Promise<Record<string,unknown>>}
export function createCredentialAdministration(pool:Pool,policy:CredentialPolicy,provider:ProviderAdministration){
 return {async execute(input:AdminInput,principal:{userId:string;sessionId:string}){return authority.run({...principal,action:input.action,audience:policy.audience},async()=>{
 if(policy.environment!=='development'||input.environment!==policy.environment)return fail('wrong_environment');
 input=await parseAdminInput(input);
 const tx=await pool.connect();let reserved=false;let clientId=input.clientId;
 const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const readClient=async(id:string):Promise<Record<string,unknown>>=>({...await provider.getClient(id),resources:(await tx.query('SELECT "resourceId" FROM "oauthClientResource" WHERE "clientId"=$1 ORDER BY "resourceId"',[id])).rows.map(r=>r.resourceId)});
 const check=async()=>{if(!await authorizeCredentialAdministration(tx,{actorId:principal.userId}))return fail('forbidden',403);};
 const audit=async(state:string,result:Record<string,unknown>={})=>{const saved=await tx.query('UPDATE identity_credential_administration SET state=$2,result=result||$3::jsonb WHERE request_id=$1 RETURNING result',[input.requestId,state,JSON.stringify(result)]);if(saved.rowCount!==1)return fail('audit_unavailable',503);return saved.rows[0].result;};
 const epoch=async(enabled:boolean)=>{await tx.query(`INSERT INTO identity_credential_epochs(issuer,kind,subject_key,generation,enabled) VALUES($1,'client',$2,2,$3) ON CONFLICT(issuer,kind,subject_key) DO UPDATE SET generation=identity_credential_epochs.generation+1,enabled=EXCLUDED.enabled`,[policy.issuer,clientId,enabled]);};
 try{
 if(input.action==='provision' && !await purposeSchemaReady(tx))return fail('client_purpose_migration_required',503);
 if(!(await tx.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",['credential-admin:'+policy.issuer])).rows[0].acquired)return fail('administration_busy',409);
 await tx.query('BEGIN');await check();const old=(await tx.query('SELECT actor_id,payload_digest,state,result FROM identity_credential_administration WHERE request_id=$1',[input.requestId])).rows[0];
 if(old){if(old.actor_id!==principal.userId||old.payload_digest!==hash)return fail('idempotency_conflict',409);if(old.state!=='complete')return fail('incomplete_operation_review_required',409);await tx.query('COMMIT');return old.result;}
 await tx.query('INSERT INTO identity_credential_administration(request_id,actor_id,action,payload_digest,reason,issuer,environment,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[input.requestId,principal.userId,input.action,hash,input.reason,policy.issuer,policy.environment,JSON.stringify({applicationId:input.applicationId??null,clientId:clientId??null,tokenId:input.tokenId??null,kind:input.kind??null,key:input.key??null})]);await tx.query('COMMIT');reserved=true;
 if(input.action==='resource'){
 const found=await provider.getResource();if(found)return fail('resource_already_exists',409);
 await provider.createResource({identifier:policy.audience,name:'Nexus Development',accessTokenTtl:300,signingAlgorithm:'EdDSA',allowedScopes:nexusScopes,dpopBoundAccessTokensRequired:true});
 const actual=await provider.getResource();if(!actual||actual.identifier!==policy.audience||actual.accessTokenTtl!==300||actual.signingAlgorithm!=='EdDSA'||actual.disabled===true||actual.dpopBoundAccessTokensRequired!==true||JSON.stringify([...(actual.allowedScopes as string[])].sort())!==JSON.stringify([...nexusScopes].sort()))return fail('resource_readback_failed',503);
 }else{
 if(input.action==='provision'){
 await tx.query('BEGIN');await check();const app=await tx.query("SELECT id FROM nexus_applications WHERE id=$1 AND app_key='sandcastle' AND status='active' FOR SHARE",[input.applicationId]);if(app.rowCount!==1)return fail('invalid_application');
 if((await tx.query("SELECT 1 FROM identity_credential_administration WHERE issuer=$1 AND request_id<>$2 AND action='provision' AND state<>'complete' AND result->>'applicationId'=$3",[policy.issuer,input.requestId,input.applicationId])).rowCount)return fail('incomplete_operation_review_required',409);
 if((await tx.query("SELECT 1 FROM nexus_application_oauth_clients WHERE application_id=$1 AND environment=$2 AND purpose='nexus_consumer'",[input.applicationId,policy.environment])).rowCount)return fail('already_provisioned',409);await tx.query('COMMIT');
 const r=await provider.getResource();if(!r||r.disabled||r.identifier!==policy.audience||r.accessTokenTtl!==300||r.signingAlgorithm!=='EdDSA'||r.dpopBoundAccessTokensRequired!==true||!Array.isArray(r.allowedScopes)||JSON.stringify([...r.allowedScopes].sort())!==JSON.stringify([...nexusScopes].sort()))return fail('resource_not_ready',409);
 await tx.query('BEGIN');await check();await tx.query('COMMIT');
 const client=await provider.createDisabledClient({client_name:'Sandcastle Development Nexus',metadata:{administration_request_id:input.requestId,environment:policy.environment},application_type:'web',redirect_uris:['https://5480-deb13.lan.com:5182/api/auth/callback'],token_endpoint_auth_method:'private_key_jwt',jwks:input.jwks,grant_types:['authorization_code'],response_types:['code'],scope:nexusScopes.join(' '),resources:[policy.audience],require_pkce:true,dpop_bound_access_tokens:true,subject_type:'public',skip_consent:false},actual=>verifyClient(actual,input.jwks,true,policy.audience));clientId=client.client_id;
 // The native transaction has committed disabled; local grants never activate it.
 const actual=await readClient(clientId);verifyClient(actual,input.jwks,true,policy.audience);
 }else if(clientId){
 const link=await tx.query('SELECT 1 FROM identity_credential_bindings WHERE issuer=$1 AND client_id=$2 AND audience=$3 AND environment=$4',[policy.issuer,clientId,policy.audience,policy.environment]);if(link.rowCount!==1)return fail('unknown_binding',404);
 // Commit monotonic deny before any provider-side mutation. Failures stay denied.
 await tx.query('BEGIN');await check();await tx.query('UPDATE identity_credential_authorities SET revision=revision+1 WHERE issuer=$1',[policy.issuer]);await epoch(false);await tx.query('COMMIT');
 if(input.action==='keys'){const rotated=await provider.rotateKeys(input.assertion!,input.jwks);if(rotated.client_id!==clientId)return fail('rotation_target_mismatch',503);await provider.updateClient(clientId,{disabled:true});}
 else await provider.updateClient(clientId,{disabled:input.action!=='enable'});
 const actual=await readClient(clientId);if(actual.client_id!==clientId)return fail('client_readback_failed',503);
 verifyClient(actual,input.action==='keys'?input.jwks:undefined,input.action!=='enable',policy.audience);
 }
 }
 await tx.query('BEGIN');await check();
 await tx.query('INSERT INTO identity_credential_authorities(issuer) VALUES($1) ON CONFLICT DO NOTHING',[policy.issuer]);
 await tx.query('UPDATE identity_credential_authorities SET revision=revision+1 WHERE issuer=$1',[policy.issuer]);
 if(input.action==='provision'){
 await epoch(false);await tx.query(`INSERT INTO nexus_application_oauth_clients(application_id,environment,oauth_client_id,redirect_uris,created_by,purpose) VALUES($1,$2,$3,$4,$5,'nexus_consumer')`,[input.applicationId,policy.environment,clientId,JSON.stringify(['https://5480-deb13.lan.com:5182/api/auth/callback']),principal.userId]);
 await tx.query(`INSERT INTO identity_credential_bindings(issuer,client_id,audience,environment,application_id,scopes,enabled) VALUES($1,$2,$3,$4,$5,$6,true)`,[policy.issuer,clientId,policy.audience,policy.environment,input.applicationId,nexusScopes]);
 for(const operation of input.operations??[])await tx.query('INSERT INTO nexus_consumer_operations(issuer,client_id,audience,environment,operation,enabled) VALUES($1,$2,$3,$4,$5,true)',[policy.issuer,clientId,policy.audience,policy.environment,operation]);
 }else if(input.action==='enable')await epoch(true);
 else if(input.action==='revoke_token'){const changed=await tx.query('UPDATE identity_access_issuances SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE issuer=$1 AND token_id=$2 RETURNING token_id',[policy.issuer,input.tokenId]);if(changed.rowCount!==1)return fail('unknown_token',404);}
 else if(input.action==='invalidate'){await tx.query(`INSERT INTO identity_credential_epochs(issuer,kind,subject_key,generation,enabled) VALUES($1,$2,$3,2,false) ON CONFLICT(issuer,kind,subject_key) DO UPDATE SET generation=identity_credential_epochs.generation+1,enabled=false`,[policy.issuer,input.kind,input.key]);}
 const result={action:input.action,clientId:clientId??null,disabled:input.action!=='enable',...(input.jwks?{keyIds:(input.jwks as {keys:{kid:string}[]}).keys.map(k=>k.kid)}:{}),...(input.operations?{operations:input.operations,scopes:nexusScopes,audience:policy.audience}:{})};const recorded=await audit('complete',result);await tx.query('COMMIT');return recorded;
 }catch(e){await tx.query('ROLLBACK').catch(()=>{});if(reserved){if(clientId&&['provision','keys'].includes(input.action))await provider.updateClient(clientId,{disabled:true}).catch(()=>{});await tx.query("UPDATE identity_credential_administration SET state='failed',result=result||$2::jsonb WHERE request_id=$1 AND state='started'",[input.requestId,JSON.stringify({clientId:clientId??null})]).catch(()=>{});}throw e;
 }finally{await tx.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['credential-admin:'+policy.issuer]).catch(()=>{});tx.release();}
 });}};
}
