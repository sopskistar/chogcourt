import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {createApplication} from '../server/app.mjs';
import {verdictFrom,participationStats,tokenKey,saveVerifiedToken} from '../server/rules.mjs';

const origin='http://court.test',password='test-only-password-123';
async function fixture({juryPolicy='account',path=':memory:'}={}){
 const db=openDatabase(path);let time=Date.parse('2026-10-13T12:00:00Z');
 const app=createApplication({db,origin,now:()=>new Date(time),quorum:3,evidenceSeconds:60,votingSeconds:60,juryPolicy});
 async function call(path,{method='GET',body,actor,headers={}}={}){
  const r=await app(new Request(origin+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...headers},...(method!=='GET'?{body:JSON.stringify(body??{})}:{})}));
  const data=r.headers.get('content-type')?.includes('json')?await r.json():Buffer.from(await r.arrayBuffer());return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
 }
 async function register(name){const r=await call('/api/auth/register',{method:'POST',body:{username:name,password}});assert.equal(r.status,200,JSON.stringify(r.data));return {...r.data,cookie:r.cookie};}
 const plaintiff=await register('plaintiff'),defendant=await register('defendant'),juror=await register('juror');
 async function claim(){const r=await call('/api/claims',{method:'POST',actor:plaintiff,body:{title:'Who misplaced the courtroom gavel?',category:'Community',argument:'The gavel was last seen beside the purple judge wig on the court table.',defendant:'defendant'}});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;}
 async function votePhase(c){for(const actor of [plaintiff,defendant])assert.equal((await call(`/api/claims/${c.id}/ready`,{method:'POST',actor})).status,201);}
 return {db,app,call,register,claim,votePhase,plaintiff,defendant,juror,advance:seconds=>time+=seconds*1000,close:()=>db.close()};
}
test('Authentication, session privacy, invalid login, CSRF and cross-origin rejection',async()=>{
 const f=await fixture();try{
  const me=await f.call('/api/auth/me',{actor:f.plaintiff});assert.equal(me.data.user.username,'plaintiff');assert.equal(me.data.user.password_hash,undefined);
  assert.equal((await f.call('/api/auth/login',{method:'POST',body:{username:'plaintiff',password:'incorrect-password'}})).status,401);
  assert.equal((await f.call('/api/claims',{method:'POST'})).status,401);
  assert.equal((await f.call('/api/auth/logout',{method:'POST',actor:f.plaintiff,headers:{'X-CSRF-Token':'wrong'}})).status,403);
  assert.equal((await f.call('/api/auth/logout',{method:'POST',actor:f.plaintiff,headers:{Origin:'https://attacker.test'}})).status,403);
  assert.equal((await f.call('/api/auth/logout',{method:'POST',actor:f.plaintiff})).status,200);
  assert.equal((await f.call('/api/auth/me',{actor:f.plaintiff})).data.user,null);
 }finally{f.close();}
});
test('Shared case creation/retrieval, validation, no forged identities or client verdicts',async()=>{
 const f=await fixture();try{const c=await f.claim();assert.equal(c.state,'OPEN');assert.equal(c.verdict,null);assert.equal((await f.call('/api/claims/'+c.id,{actor:f.defendant})).data.id,c.id);assert.equal((await f.call('/api/claims')).data.cases.length,1);
 const base={title:'A valid court question?',category:'Community',argument:'This argument is long enough to be submitted.',defendant:'defendant'};
 for(const body of [{...base,title:'bad'},{...base,defendant:'missing'},{...base,defendant:'plaintiff'},{...base,plaintiff_token_key:'forged'},{...base,verdict:'GUILTY'}])assert.equal((await f.call('/api/claims',{method:'POST',actor:f.plaintiff,body})).status,422);
 assert.equal((await f.call(`/api/claims/${c.id}/verdict`)).status,409);
 }finally{f.close();}
});
test('Evidence SHA-256 matches stored exact bytes; duplicates and unrelated submissions rejected',async()=>{
 const f=await fixture();try{const c=await f.claim(),body={label:'Courtroom note',text:'A verified byte hash does not imply that the evidence is true.'};
 assert.equal((await f.call(`/api/claims/${c.id}/evidence`,{method:'POST',actor:f.juror,body})).status,403);
 assert.equal((await f.call(`/api/claims/${c.id}/evidence`,{method:'POST',actor:f.plaintiff,body})).status,201);
 const evidence=(await f.call(`/api/claims/${c.id}/evidence`)).data.evidence[0];assert.equal(evidence.sha256,createHash('sha256').update(body.text).digest('hex'));
 const bytes=await f.call(`/api/evidence/${evidence.id}/content`);assert.equal(bytes.data.toString(),body.text);
 assert.equal((await f.call(`/api/claims/${c.id}/evidence`,{method:'POST',actor:f.defendant,body})).status,409);
 const file=Buffer.from([0,255,42,9]);assert.equal((await f.call(`/api/claims/${c.id}/evidence`,{method:'POST',actor:f.defendant,body:{label:'Binary file',base64:file.toString('base64')}})).status,201);
 const list=(await f.call(`/api/claims/${c.id}/evidence`)).data.evidence;assert.ok(list.some(e=>e.sha256===createHash('sha256').update(file).digest('hex')));
 assert.equal((await f.call(`/api/claims/${c.id}/evidence`,{method:'POST',actor:f.plaintiff,body:{label:'Bad encoding',base64:'???'}})).status,422);
 }finally{f.close();}
});
test('Only defendant responds; duplicate responses and changes after readiness are rejected',async()=>{
 const f=await fixture();try{const c=await f.claim(),body={body:'I returned the gavel to the evidence desk before the court opened.'};
 assert.equal((await f.call(`/api/claims/${c.id}/response`,{method:'POST',actor:f.plaintiff,body})).status,403);
 assert.equal((await f.call(`/api/claims/${c.id}/response`,{method:'POST',actor:f.defendant,body})).data.state,'EVIDENCE_RESPONSE');
 assert.equal((await f.call(`/api/claims/${c.id}/response`,{method:'POST',actor:f.defendant,body})).status,409);
 await f.call(`/api/claims/${c.id}/ready`,{method:'POST',actor:f.defendant});
 assert.equal((await f.call(`/api/claims/${c.id}/evidence`,{method:'POST',actor:f.defendant,body:{label:'Late note',text:'This note arrives after the party closed their own window.'}})).status,409);
 }finally{f.close();}
});
test('Phase deadlines advance even across idle periods; no premature finalization',async()=>{
 const f=await fixture();try{const c=await f.claim();assert.equal((await f.call(`/api/claims/${c.id}/adjudicate`,{method:'POST',actor:f.plaintiff})).status,409);f.advance(61);assert.equal((await f.call('/api/claims/'+c.id)).data.state,'VOTING');f.advance(60);const final=(await f.call('/api/claims/'+c.id)).data;assert.equal(final.state,'FINALIZED');assert.equal(final.verdict.reason,'INSUFFICIENT_QUORUM');assert.equal(final.verdict.outcome,'NOT_ENOUGH_EVIDENCE');assert.equal((await f.call(`/api/claims/${c.id}/adjudicate`,{method:'POST',actor:f.plaintiff})).status,200);
 const events=(await f.call(`/api/claims/${c.id}/history`)).data.events;assert.deepEqual(events.map(e=>e.event),['OPEN','VOTING','FINALIZED']);
 }finally{f.close();}
});
test('Authenticated account jury; party restrictions, duplicate votes, hidden interim tallies, finalized result',async()=>{
 const f=await fixture();try{const c=await f.claim(),route=`/api/claims/${c.id}/votes`,body={choice:'GUILTY'};
 assert.equal((await f.call(route,{method:'POST',actor:f.juror,body})).status,409);await f.votePhase(c);
 for(const actor of [f.plaintiff,f.defendant])assert.equal((await f.call(route,{method:'POST',actor,body})).status,403);
 assert.equal((await f.call(route,{method:'POST',body})).status,401);
 const votes=await Promise.all([f.call(route,{method:'POST',actor:f.juror,body}),f.call(route,{method:'POST',actor:f.juror,body})]);assert.deepEqual(votes.map(v=>v.status).sort(),[201,409]);
 const j2=await f.register('juror_two'),j3=await f.register('juror_three');await f.call(route,{method:'POST',actor:j2,body});await f.call(route,{method:'POST',actor:j3,body:{choice:'INNOCENT'}});
 const pending=(await f.call('/api/claims/'+c.id)).data;assert.equal(pending.jury_participation,3);assert.equal(pending.verdict,null);assert.equal(pending.guilty,undefined);
 f.advance(61);const final=(await f.call('/api/claims/'+c.id)).data;assert.equal(final.verdict.outcome,'GUILTY');assert.equal(final.verdict.guilty,2);assert.equal(final.verdict.total,3);assert.equal((await f.call(route,{method:'POST',actor:j2,body})).status,409);
 }finally{f.close();}
});
test('Tie, insufficient quorum, insufficient-evidence plurality and innocent plurality are transparent',()=>{
 const votes=(...choices)=>choices.map(choice=>({choice}));
 assert.equal(verdictFrom(votes('GUILTY','INNOCENT'),2).reason,'TIE');
 assert.equal(verdictFrom(votes('GUILTY'),3).reason,'INSUFFICIENT_QUORUM');
 assert.equal(verdictFrom(votes('NOT_ENOUGH_EVIDENCE','NOT_ENOUGH_EVIDENCE','GUILTY'),3).outcome,'NOT_ENOUGH_EVIDENCE');
 assert.equal(verdictFrom(votes('INNOCENT','INNOCENT','GUILTY'),3).outcome,'INNOCENT');
});
test('NFT-only jury policy and nominations fail closed without invented verification',async()=>{
 const f=await fixture({juryPolicy:'nft'});try{const c=await f.claim();await f.votePhase(c);assert.equal((await f.call(`/api/claims/${c.id}/votes`,{method:'POST',actor:f.juror,body:{choice:'GUILTY'}})).status,403);assert.equal((await f.call('/api/nominations',{method:'POST',actor:f.juror,body:{claimId:c.id}})).status,503);assert.equal((await f.call('/api/wallet/challenge',{method:'POST',actor:f.juror})).status,503);const config=(await f.call('/api/config')).data;assert.equal(config.chain.balanceVerified,false);assert.equal(config.chain.nominationThreshold,null);
 }finally{f.close();}
});
test('Real activity drives achievements, UTC streaks and activity score independently of verdicts',async()=>{
 const f=await fixture();try{const c=await f.claim();await f.votePhase(c);await f.call(`/api/claims/${c.id}/votes`,{method:'POST',actor:f.juror,body:{choice:'INNOCENT'}});const p=(await f.call('/api/profile',{actor:f.juror})).data;assert.equal(p.stats.votes,1);assert.equal(p.stats.current,1);assert.deepEqual(p.stats.badges,[true,false,false]);assert.equal(p.stats.score,10);assert.equal(p.identity.verified,false);assert.equal((await f.call('/api/claims/'+c.id)).data.chaos.score,4);
 const dates=['2026-10-10','2026-10-11','2026-10-12','2026-10-12','2026-10-12'].map(d=>({created_at:d+'T12:00:00Z'}));const stats=participationStats(dates,1,new Date('2026-10-13T12:00:00Z'));assert.equal(stats.current,3);assert.equal(stats.score,55);assert.deepEqual(stats.badges,[true,true,true]);assert.equal(participationStats(dates,0,new Date('2026-10-14T12:00:00Z')).current,0);
 }finally{f.close();}
});
test('Verified token keys retain historical associations across owner changes (injected test proofs only)',async()=>{
 const f=await fixture();try{const c=await f.claim(),proof={chainId:'143',collectionAddress:'0x'+'ab'.repeat(20),tokenId:'00042',owner:'0x'+'11'.repeat(20),verified:true,verifiedAt:'2026-10-13T12:00:00Z',verificationSource:'TEST FIXTURE ONLY'};
 assert.throws(()=>saveVerifiedToken(f.db,{...proof,verified:false}));const key=saveVerifiedToken(f.db,proof);assert.equal(key,tokenKey({...proof,tokenId:42}));f.db.prepare('UPDATE claims SET defendant_token_key=? WHERE id=?').run(key,c.id);saveVerifiedToken(f.db,{...proof,owner:'0x'+'22'.repeat(20)});assert.equal(f.db.prepare('SELECT defendant_token_key FROM claims WHERE id=?').get(c.id).defendant_token_key,key);assert.equal(f.db.prepare('SELECT count(*) AS n FROM tokens').get().n,1);
 const result=await f.call('/api/reputation?'+new URLSearchParams({chainId:'143',collectionAddress:proof.collectionAddress,tokenId:'42'}));assert.equal(result.data.cases[0].id,c.id);assert.equal(result.data.token.current_owner,'0x'+'22'.repeat(20));
 }finally{f.close();}
});
test('Database persists cases, evidence, responses, votes and verdicts across application restarts and logins',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'chog-db-test-')),path=join(directory,'court.sqlite');const f=await fixture({path});let c;
 try{c=await f.claim();await f.call(`/api/claims/${c.id}/evidence`,{method:'POST',actor:f.plaintiff,body:{label:'Persistent note',text:'This note must survive closing and reopening the database.'}});await f.call(`/api/claims/${c.id}/response`,{method:'POST',actor:f.defendant,body:{body:'This defendant response must also survive a database restart.'}});await f.votePhase(c);await f.call(`/api/claims/${c.id}/votes`,{method:'POST',actor:f.juror,body:{choice:'GUILTY'}});f.advance(61);await f.call('/api/claims/'+c.id);}finally{f.close();}
 const db=openDatabase(path),app=createApplication({db,origin});try{
  const login=await app(new Request(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username:'juror',password})}));assert.equal(login.status,200);
  const result=await(await app(new Request(origin+'/api/claims/'+c.id))).json();assert.equal(result.state,'FINALIZED');assert.equal(result.verdict.reason,'INSUFFICIENT_QUORUM');assert.equal(result.evidence_count,1);assert.equal(result.jury_participation,1);assert.ok(result.response.body.includes('database restart'));
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});
test('Malformed JSON, unknown routes and oversized evidence return explicit errors',async()=>{
 const f=await fixture();try{
  const malformed=await f.app(new Request(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}));assert.equal(malformed.status,400);
  assert.equal((await f.call('/api/not-a-route')).status,404);const c=await f.claim();
  assert.equal((await f.call(`/api/claims/${c.id}/evidence`,{method:'POST',actor:f.plaintiff,body:{label:'Oversized attachment',base64:Buffer.alloc(1048577).toString('base64')}})).status,413);
 }finally{f.close();}
});
