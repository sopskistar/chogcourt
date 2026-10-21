import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {get as httpGet} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openDatabase,openTemporaryDemoDatabase,isDemoDatabase,SCHEMA_VERSION} from '../server/database.mjs';
import {createServer} from '../server/index.mjs';
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
test('Daily and profile route contracts include explicit empty histories and unverified identity for a new account',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/api/health')).data.schema,3);
  const daily=await f.call('/api/daily',{actor:f.plaintiff});assert.equal(daily.status,200);
  assert.equal(daily.data.current,null);assert.equal(daily.data.next,null);assert.deepEqual(daily.data.previous,[]);assert.deepEqual(daily.data.history,[]);assert.equal(daily.data.config.windowSeconds,86400);
  assert.equal((await f.call('/api/daily',{method:'POST'})).status,401);
  assert.equal((await f.call('/api/profile')).status,401);
  const profile=await f.call('/api/profile',{actor:f.plaintiff});assert.equal(profile.status,200);
  assert.deepEqual(profile.data.cases,[]);assert.deepEqual(profile.data.dailyHistory,[]);assert.equal(profile.data.stats.votes,0);assert.equal(profile.data.stats.score,0);assert.deepEqual(profile.data.stats.badges,[false,false,false]);
  assert.equal(profile.data.identity.verified,false);assert.equal(profile.data.identity.wallet.walletAuthenticated,false);
  const nominations=await f.call('/api/nominations');assert.equal(nominations.data.enabled,false);assert.equal(nominations.data.chain.walletVerification,true);assert.equal(nominations.data.chain.nominationEnabled,false);
 }finally{f.close();}
});
test('Shared case creation/retrieval, validation, no forged identities or client verdicts',async()=>{
 const f=await fixture();try{const c=await f.claim();assert.equal(c.state,'OPEN');assert.equal(c.verdict,null);assert.equal((await f.call('/api/claims/'+c.id,{actor:f.defendant})).data.id,c.id);assert.equal((await f.call('/api/claims')).data.cases.length,1);
 const base={title:'A valid court question?',category:'Community',argument:'This argument is long enough to be submitted.',defendant:'defendant'};
 for(const body of [{...base,title:'bad'},{...base,defendant:'missing'},{...base,defendant:'plaintiff'},{...base,plaintiff_token_key:'forged'},{...base,verdict:'GUILTY'}])assert.equal((await f.call('/api/claims',{method:'POST',actor:f.plaintiff,body})).status,422);
 const unregistered=await f.call('/api/claims',{method:'POST',actor:f.plaintiff,body:{...base,defendant:'missing'}});
 assert.equal(unregistered.data.error.code,'DEFENDANT_NOT_FOUND');assert.equal(unregistered.data.error.message,'The defendant must register a court account first.');
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
 const f=await fixture({juryPolicy:'nft'});try{const c=await f.claim();await f.votePhase(c);assert.equal((await f.call(`/api/claims/${c.id}/votes`,{method:'POST',actor:f.juror,body:{choice:'GUILTY'}})).status,403);assert.equal((await f.call('/api/nominations',{method:'POST',actor:f.juror,body:{claimId:c.id}})).status,503);assert.equal((await f.call('/api/wallet/challenge',{method:'POST',actor:f.juror})).status,422);const config=(await f.call('/api/config')).data;assert.equal(config.chain.nftJuryEnabled,false);assert.equal(config.chain.balanceVerified,false);assert.equal(config.chain.nominationThreshold,null);
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

const dailyQuestion={question:'Which tiny hat should Chog wear to court?',choices:['Purple wig','Golden crown','Tiny cap']};
async function submitDaily(f,actor=f.plaintiff,body=dailyQuestion){const r=await f.call('/api/daily',{method:'POST',actor,body});assert.equal(r.status,201,JSON.stringify(r.data));return r.data;}

test('Daily submissions validate fixed choices, authenticate accounts and enforce one queued question',async()=>{
 const f=await fixture();try{
  assert.equal((await f.call('/api/daily')).data.current,null);
  assert.equal((await f.call('/api/daily',{method:'POST',body:dailyQuestion})).status,401);
  assert.equal((await f.call('/api/daily',{method:'POST',actor:f.plaintiff,body:dailyQuestion,headers:{'X-CSRF-Token':'wrong'}})).status,403);
  for(const body of [{...dailyQuestion,question:'bad'},{...dailyQuestion,choices:['one']},{...dailyQuestion,choices:['One',' one ']},{...dailyQuestion,choices:['a','b','c','d','e']},{...dailyQuestion,choices:[1,'b']},{...dailyQuestion,author_id:'forged'},{...dailyQuestion,closes_at:'2026-10-13'}])assert.equal((await f.call('/api/daily',{method:'POST',actor:f.plaintiff,body})).status,422);
  const first=await submitDaily(f);assert.equal(first.state,'VOTING');assert.equal(first.closes_at,'2026-10-14T00:00:00.000Z');assert.equal(first.min_quorum,3);
  const second=await submitDaily(f);assert.equal(second.state,'QUEUED');
  assert.equal((await f.call('/api/daily',{method:'POST',actor:f.plaintiff,body:dailyQuestion})).status,409);
  assert.equal((await f.call('/api/daily/'+second.id+'/votes',{method:'POST',actor:f.juror,body:{choice:0}})).status,409);
  const list=(await f.call('/api/daily',{actor:f.plaintiff})).data;assert.equal(list.current.id,first.id);assert.equal(list.next.id,second.id);assert.equal(list.can_submit,false);assert.equal(list.config.demo,false);assert.equal(list.config.windowSeconds,86400);
  assert.equal((await f.call('/api/daily/00000000-0000-0000-0000-000000000000')).status,404);
 }finally{f.close();}
});

test('Daily voting excludes authors, inactive accounts and duplicates; interim tallies stay private',async()=>{
 const f=await fixture();try{
  const t=await submitDaily(f),route='/api/daily/'+t.id+'/votes';
  assert.equal((await f.call(route,{method:'POST',body:{choice:0}})).status,401);
  assert.equal((await f.call(route,{method:'POST',actor:f.plaintiff,body:{choice:0}})).status,403);
  for(const choice of [-1,3,1.5,'0',null])assert.equal((await f.call(route,{method:'POST',actor:f.juror,body:{choice}})).status,422);
  const responses=await Promise.all([0,1].map(choice=>f.call(route,{method:'POST',actor:f.juror,body:{choice}})));assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  const mine=(await f.call('/api/daily/'+t.id,{actor:f.juror})).data;assert.equal(mine.my_choice,0);assert.equal(mine.result,null);assert.equal(mine.eligibility.eligible,false);
  const anonymous=(await f.call('/api/daily/'+t.id)).data;assert.equal(anonymous.my_choice,null);assert.equal(anonymous.participation,1);assert.equal(anonymous.choices[0].votes,undefined);assert.equal(anonymous.result,null);
  f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(f.defendant.user.id);
  assert.equal((await f.call(route,{method:'POST',actor:f.defendant,body:{choice:1}})).status,401);
  const profile=(await f.call('/api/profile',{actor:f.juror})).data;assert.equal(profile.stats.votes,0);assert.equal(profile.stats.score,0);assert.deepEqual(profile.stats.badges,[false,false,false]);assert.equal(profile.dailyHistory[0].id,t.id);
 }finally{f.close();}
});

test('Daily exact UTC deadline finalizes once, rejects late votes and opens the queued trial',async()=>{
 const f=await fixture();try{
  const first=await submitDaily(f),second=await submitDaily(f),j2=await f.register('daily_two');
  for(const [actor,choice]of [[f.juror,0],[f.defendant,0],[j2,1]])assert.equal((await f.call('/api/daily/'+first.id+'/votes',{method:'POST',actor,body:{choice}})).status,201);
  f.advance(43199.999);assert.equal((await f.call('/api/daily/'+first.id)).data.result,null);
  f.advance(.001);
  const requests=await Promise.all(Array.from({length:8},()=>f.call('/api/daily')));assert.ok(requests.every(r=>r.data.current.id===second.id));
  const result=requests[0].data.previous[0].result;assert.equal(result.reason,'WINNER');assert.equal(result.total,3);assert.deepEqual(result.counts.map(c=>c.votes),[2,1,0]);
  assert.equal((await f.call('/api/daily/'+first.id+'/votes',{method:'POST',actor:j2,body:{choice:0}})).status,409);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM daily_results WHERE trial_id=?').get(first.id).n,1);
  assert.deepEqual((await f.call('/api/daily/'+first.id)).data.result,result);
  assert.equal(requests[0].data.current.closes_at,'2026-10-15T00:00:00.000Z');
 }finally{f.close();}
});

test('Daily plurality, ties, zero votes and insufficient participation use the documented rules',async()=>{
 for(const choices of [[],[0,0],[0,0,1,1],[0,0,1,2]]){
  const f=await fixture();try{
   const t=await submitDaily(f),actors=[f.juror,f.defendant,await f.register('daily_three'),await f.register('daily_four')];
   for(let i=0;i<choices.length;i++)assert.equal((await f.call('/api/daily/'+t.id+'/votes',{method:'POST',actor:actors[i],body:{choice:choices[i]}})).status,201);
   f.advance(43200);const data=(await f.call('/api/daily/'+t.id)).data;
   assert.equal(data.state,'CLOSED');assert.equal(data.result.reason,choices.length<3?'INSUFFICIENT_PARTICIPATION':choices[3]===2?'WINNER':'TIE');assert.equal(data.result.total,choices.length);
  }finally{f.close();}
 }
});

test('Daily account participation remains available when the separate court NFT policy is disabled',async()=>{
 const f=await fixture({juryPolicy:'nft'});try{const t=await submitDaily(f);assert.equal((await f.call('/api/daily/'+t.id+'/votes',{method:'POST',actor:f.juror,body:{choice:0}})).status,201);assert.equal((await f.call('/api/config')).data.chain.nftJuryEnabled,false);}finally{f.close();}
});

test('Daily FIFO skips missed dates without fabricating trials; claims and their rules are untouched',async()=>{
 const f=await fixture();try{
  const c=await f.claim(),snapshot=f.db.prepare('SELECT * FROM claims WHERE id=?').get(c.id);
  const a=await submitDaily(f),b=await submitDaily(f,f.defendant),d=await submitDaily(f,f.juror);
  f.advance(3*86400);const list=(await f.call('/api/daily')).data;assert.equal(list.current.id,b.id);assert.equal(list.next.id,d.id);assert.equal(list.previous[0].id,a.id);
  assert.equal(list.current.slot,'2026-10-16');assert.equal(f.db.prepare('SELECT count(*) AS n FROM daily_trials').get().n,3);
  assert.deepEqual(f.db.prepare('SELECT * FROM claims WHERE id=?').get(c.id),snapshot);
 }finally{f.close();}
});

test('Additive migrations preserve a populated v1 court and are idempotent on restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'chog-upgrade-test-')),path=join(directory,'court.sqlite');
 let db=new DatabaseSync(path);
 try{
  db.exec(await readFile(new URL('../server/migrations/001_initial.sql',import.meta.url),'utf8'));
  for(const id of ['a','b'])db.prepare('INSERT INTO users(id,username,password_hash,salt,created_at) VALUES(?,?,?,?,?)').run(id,id,'fixture','fixture','2026-10-13T00:00:00Z');
  db.prepare('INSERT INTO claims(id,title,category,argument,plaintiff_id,defendant_id,state,created_at,response_deadline,voting_seconds,min_quorum,jury_policy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('existing','Existing case','Community','Existing argument','a','b','OPEN','2026-10-13T00:00:00Z','2026-10-14T00:00:00Z',86400,3,'account');
  const before=db.prepare('SELECT * FROM claims').all();db.close();db=openDatabase(path);
  assert.equal(db.prepare('SELECT max(version) AS n FROM migrations').get().n,SCHEMA_VERSION);assert.deepEqual(db.prepare('SELECT * FROM claims').all(),before);assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,2);
  db.close();db=openDatabase(path);assert.deepEqual(db.prepare('SELECT * FROM claims').all(),before);assert.equal(db.prepare('SELECT count(*) AS n FROM migrations').get().n,SCHEMA_VERSION);
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});

test('Daily votes, queue, results and personal history persist across database restarts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'chog-daily-test-')),path=join(directory,'court.sqlite');const f=await fixture({path});let first,second;
 try{first=await submitDaily(f);second=await submitDaily(f);await f.call('/api/daily/'+first.id+'/votes',{method:'POST',actor:f.juror,body:{choice:1}});f.advance(43200);await f.call('/api/daily');}finally{f.close();}
 const db=openDatabase(path),app=createApplication({db,origin,now:()=>new Date('2026-10-14T01:00:00Z')});
 try{
  const login=await app(new Request(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username:'juror',password})}));assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const list=await(await app(new Request(origin+'/api/daily',{headers:{Cookie:cookie}}))).json();assert.equal(list.current.id,second.id);assert.equal(list.previous[0].id,first.id);assert.equal(list.previous[0].result.total,1);assert.equal(list.history[0].my_choice,1);
 }finally{db.close();await rm(directory,{recursive:true,force:true});}
});

test('60-second demo is fresh, loopback-only, explicitly labelled and cannot reuse a normal database',async()=>{
 const {db,directory}=openTemporaryDemoDatabase(),normal=openDatabase(':memory:');let runner;
 try{
  assert.equal(isDemoDatabase(normal),false);assert.equal(isDemoDatabase(db),true);
  assert.equal((await(await createApplication({db:normal})(new Request('http://127.0.0.1:4173/api/config'))).json()).daily.windowSeconds,86400);
  assert.throws(()=>createServer({db,host:'0.0.0.0'}),/Local demo/);
  assert.throws(()=>createApplication({db,production:true}),/Local demo/);
  assert.throws(()=>createApplication({db,origin:'https://public.example'}),/Local demo/);
  let time=Date.parse('2026-10-13T12:34:59.000Z');runner=createServer({db,port:0,host:'127.0.0.1',now:()=>new Date(time)});await new Promise(resolve=>runner.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+runner.server.address().port;
  const config=await(await fetch(base+'/api/config')).json();assert.equal(config.daily.demo,true);assert.equal(config.daily.windowSeconds,60);assert.equal(config.evidenceSeconds,86400);assert.equal(config.votingSeconds,86400);
  assert.ok((await(await fetch(base)).text()).includes('data-local-demo'));
  // fetch normalizes Host; use HTTP directly to actually send the forged header.
  const forged=await new Promise((resolve,reject)=>httpGet(base,{headers:{Host:'public.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject));assert.equal(forged,403);
  const signup=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({username:'demo_author',password})}),auth=await signup.json();assert.equal(signup.status,200);
  assert.ok(signup.headers.get('set-cookie').startsWith('chog_demo_session='));
  const headers={'Content-Type':'application/json',Origin:base,Cookie:signup.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':auth.csrf};
  const response=await fetch(base+'/api/daily',{method:'POST',headers,body:JSON.stringify(dailyQuestion)}),first=await response.json();assert.equal(response.status,201);assert.equal(Date.parse(first.closes_at)-time,60000);
  time+=59999;assert.equal((await(await fetch(base+'/api/daily')).json()).current.id,first.id);time++;
  assert.equal((await(await fetch(base+'/api/daily')).json()).previous[0].result.reason,'INSUFFICIENT_PARTICIPATION');
  for(const patch of [{NODE_ENV:'production'},{DATABASE_PATH:'/do-not-touch.sqlite'},{PUBLIC_ORIGIN:'https://public.example'},{HOST:'0.0.0.0'},{PORT:'8000'}]){
   const run=spawnSync(process.execPath,['scripts/demo.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,...patch},encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stderr,/Demo refuses deployment settings/);
  }
 }finally{if(runner)await new Promise(resolve=>runner.server.close(resolve));db.close();normal.close();await rm(directory,{recursive:true,force:true});}
});
