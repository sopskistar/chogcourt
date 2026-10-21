import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createPostgresStore} from '../server/postgres.mjs';
import {createApplication} from '../server/app.mjs';

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw Error('Set TEST_DATABASE_URL to a disposable local PostgreSQL database before running this integration test.');
const hostname=new URL(connectionString).hostname;
if(!['localhost','127.0.0.1','::1'].includes(hostname)&&process.env.ALLOW_REMOTE_TEST_DATABASE!=='1')throw Error('Remote test databases require explicit ALLOW_REMOTE_TEST_DATABASE=1; never use production data.');

const schema=`chogcourt_test_${randomBytes(6).toString('hex')}`;
const admin=new pg.Pool({connectionString,max:1});
let pool,store;
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool=new pg.Pool({connectionString,max:1,options:`-c search_path=${schema}`});
  store=createPostgresStore({pool});await store.ensureSchema();
  let clock=Date.parse('2026-10-20T12:00:00Z');
  const origin='https://court.test',app=createApplication({db:store,origin,now:()=>new Date(clock),quorum:3,evidenceSeconds:60,votingSeconds:60});
  async function call(path,{method='GET',body,actor,headers={}}={}){
    const response=await app(new Request(origin+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...headers},...(method==='GET'?{}:{body:JSON.stringify(body??{})})}));
    return {status:response.status,data:response.headers.get('content-type')?.includes('json')?await response.json():Buffer.from(await response.arrayBuffer()),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  async function register(username){
    const result=await call('/api/auth/register',{method:'POST',body:{username,password:'integration-test-password-123'}});
    assert.equal(result.status,200,JSON.stringify(result.data));return {...result.data,cookie:result.cookie};
  }
  const plaintiff=await register('plaintiff'),defendant=await register('defendant'),jurors=await Promise.all(['juror_one','juror_two','juror_three'].map(register));
  const filed=await call('/api/claims',{method:'POST',actor:plaintiff,body:{title:'Who moved the courtroom gavel?',category:'Community',argument:'The gavel disappeared from the courtroom table before the hearing began.',defendant:'defendant'}});
  assert.equal(filed.status,201,JSON.stringify(filed.data));const claim=filed.data;
  const note='A timestamped note records the gavel beside the purple judge wig.';
  assert.equal((await call(`/api/claims/${claim.id}/evidence`,{method:'POST',actor:plaintiff,body:{label:'Timestamped note',text:note}})).status,201);
  const evidence=(await call(`/api/claims/${claim.id}/evidence`)).data.evidence[0];
  assert.equal((await call(`/api/claims/${claim.id}/evidence`,{method:'POST',actor:defendant,body:{label:'Duplicate note',text:note}})).status,409);
  assert.equal((await call(`/api/evidence/${evidence.id}/content`)).data.toString(),note);
  assert.equal((await call(`/api/claims/${claim.id}/response`,{method:'POST',actor:defendant,body:{body:'I returned the gavel to its marked place before the hearing.'}})).status,201);
  assert.equal((await call(`/api/claims/${claim.id}/ready`,{method:'POST',actor:plaintiff})).status,201);
  assert.equal((await call(`/api/claims/${claim.id}/ready`,{method:'POST',actor:defendant})).status,201);
  for(const [index,actor] of jurors.entries())assert.equal((await call(`/api/claims/${claim.id}/votes`,{method:'POST',actor,body:{choice:index===1?'INNOCENT':'GUILTY'}})).status,201);
  clock+=61000;
  const final=await call(`/api/claims/${claim.id}`,{actor:plaintiff});assert.equal(final.status,200);assert.equal(final.data.state,'FINALIZED');assert.equal(final.data.verdict.outcome,'GUILTY');assert.equal(final.data.jury_participation,3);
  const history=await call(`/api/claims/${claim.id}/history`,{actor:plaintiff});assert.ok(history.data.events.some(e=>e.event==='FINALIZED'));
  const login=await call('/api/auth/login',{method:'POST',body:{username:'plaintiff',password:'integration-test-password-123'}});assert.equal(login.status,200);
  const refreshed=await call(`/api/claims/${claim.id}`,{actor:{cookie:login.cookie,csrf:login.data.csrf}});assert.equal(refreshed.data.verdict.outcome,'GUILTY');assert.equal((await call(`/api/claims/${claim.id}/evidence`,{actor:{cookie:login.cookie,csrf:login.data.csrf}})).data.evidence.length,1);
  console.log('PostgreSQL integration passed: registration, case, evidence, response, jury vote, finalized verdict, history, login and persistence.');
} finally {
  if(store)await store.close();else if(pool)await pool.end();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}
