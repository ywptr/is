/** Read-only Vercel metadata fallback, explicitly scoped. Never fetches decrypted env values. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url));
const team='team_SUnAmlBNxPYqRJJsA7EtHcSG',project='prj_c7PznTxVOklfr8dI6FBHZSQXHhl2';
const deployment=d=>d?{id:d.id??d.uid,url:d.url,target:d.target,readyState:d.readyState,
 commit:d.gitSource?.sha??d.meta?.githubCommitSha,branch:d.gitSource?.ref??d.meta?.githubCommitRef}:null;
process.umask(0o077);
try{
 assert.equal(process.versions.node.split('.')[0],'24');
 const get=async path=>JSON.parse((await run('vercel',['api',path,'--method','GET','--scope',team,'--non-interactive'],{cwd:root,maxBuffer:8*1024*1024,timeout:30000})).stdout);
 const p=await get(`/v9/projects/${project}?teamId=${team}`);
 assert.equal(p.id,project);assert.equal(p.name,'is');assert.equal(p.accountId,team);
 const env=await get(`/v10/projects/${project}/env?teamId=${team}&decrypt=false`);
 const report={at:new Date().toISOString(),project:{id:p.id,name:p.name,accountId:p.accountId,framework:p.framework,nodeVersion:p.nodeVersion,
  productionBranch:p.link?.productionBranch,gitProvider:p.link?.type,gitOwner:p.link?.org,gitRepo:p.link?.repo,
  gitDeploymentEnabled:p.gitDeploymentEnabled,hasIgnoreBuildStep:!!p.commandForIgnoringBuildStep,
  production:deployment(p.targets?.production)},
  environmentMetadata:(env.envs??[]).map(v=>({id:v.id,key:v.key,target:v.target,type:v.type,gitBranch:v.gitBranch})),
  scope:'No decrypted values, connection strings or tokens fetched. Production DB/Neon mapping and feature values remain unverified.'};
 const folder=root+'.local-recovery/is-db-sync-0001';await mkdir(folder,{recursive:true,mode:0o700});await writeFile(folder+'/.gitignore','*\n',{mode:0o600});
 await writeFile(folder+'/vercel-inventory.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}catch{console.error('Read-only Vercel inventory unavailable; no raw API output or credentials printed. Check native CLI access for the explicitly scoped team.');process.exitCode=1;}
