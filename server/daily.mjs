import {randomUUID} from 'node:crypto';
import {transaction,isDemoDatabase} from './database.mjs';

const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
const fields=(body,allowed)=>{if(Object.keys(body).some(k=>!allowed.includes(k)))fail(422,'UNKNOWN_FIELD','The request contains unsupported fields.');};
function text(value,min,max,label) {
  if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(422,'INVALID_INPUT',`${label} must contain ${min}–${max} characters.`);
  return value.trim();
}

export function createDaily({db,now}) {
  const demo=isDemoDatabase(db);
  const config=Object.freeze({demo,windowSeconds:demo?60:86400,quorum:3,closing:demo?'60 seconds after opening':'00:00 UTC'});
  const stamp=()=>now().toISOString();
  const find=id=>db.prepare('SELECT * FROM daily_trials WHERE id=?').get(id);

  function sync() {
    transaction(db,()=>{
      const time=now(),iso=time.toISOString();
      for(const t of db.prepare("SELECT * FROM daily_trials WHERE state='VOTING' AND closes_at<=?").all(iso)) {
        const counts=db.prepare('SELECT c.position,count(v.user_id) AS votes FROM daily_choices c LEFT JOIN daily_votes v ON v.trial_id=c.trial_id AND v.choice=c.position WHERE c.trial_id=? GROUP BY c.position ORDER BY c.position').all(t.id);
        const total=counts.reduce((sum,c)=>sum+c.votes,0),max=Math.max(...counts.map(c=>c.votes));
        const reason=total<t.min_quorum?'INSUFFICIENT_PARTICIPATION':counts.filter(c=>c.votes===max).length>1?'TIE':'WINNER';
        db.prepare('INSERT INTO daily_results VALUES(?,?,?,?,?)').run(t.id,reason,total,JSON.stringify(counts),iso);
        db.prepare("UPDATE daily_trials SET state='CLOSED' WHERE id=?").run(t.id);
      }
      if(db.prepare("SELECT 1 FROM daily_trials WHERE state='VOTING'").get())return;
      const slot=demo?randomUUID():iso.slice(0,10);
      if(db.prepare('SELECT 1 FROM daily_trials WHERE slot=?').get(slot))return;
      const next=db.prepare("SELECT t.id FROM daily_trials t JOIN users u ON u.id=t.author_id WHERE t.state='QUEUED' AND u.active=1 ORDER BY t.seq LIMIT 1").get();
      if(!next)return;
      const closes=demo?new Date(+time+60000):new Date(Date.parse(iso.slice(0,10)+'T00:00:00Z')+86400000);
      db.prepare("UPDATE daily_trials SET state='VOTING',slot=?,opened_at=?,closes_at=? WHERE id=?").run(slot,iso,closes.toISOString(),next.id);
    });
  }
  function view(t,user) {
    if(!t)fail(404,'NOT_FOUND','Daily question not found.');
    const choices=db.prepare('SELECT position,label FROM daily_choices WHERE trial_id=? ORDER BY position').all(t.id);
    const saved=db.prepare('SELECT * FROM daily_results WHERE trial_id=?').get(t.id);
    const myChoice=user?db.prepare('SELECT choice FROM daily_votes WHERE trial_id=? AND user_id=?').get(t.id,user.id)?.choice??null:null;
    const reason=!user?'Sign in to vote.':t.state!=='VOTING'?'This question is not accepting votes.':user.id===t.author_id?'Question authors cannot vote on their own question.':myChoice!==null?'Your vote is recorded and cannot be changed.':'One vote per active account. This does not verify unique people or NFT ownership.';
    return {...t,author:db.prepare('SELECT username FROM users WHERE id=?').get(t.author_id).username,choices,
      participation:db.prepare('SELECT count(*) AS n FROM daily_votes WHERE trial_id=?').get(t.id).n,
      my_choice:myChoice,eligibility:{eligible:!!user&&t.state==='VOTING'&&user.id!==t.author_id&&myChoice===null,reason},
      result:saved?{reason:saved.reason,total:saved.total,counts:JSON.parse(saved.counts_json),finalized_at:saved.created_at}:null,
      source:demo?'local-demo':'shared-offchain'};
  }
  function history(user) {
    if(!user)return [];
    return db.prepare('SELECT DISTINCT t.* FROM daily_trials t LEFT JOIN daily_votes v ON v.trial_id=t.id WHERE t.author_id=? OR v.user_id=? ORDER BY t.seq DESC LIMIT 20').all(user.id,user.id).map(t=>view(t,user));
  }
  function list(user) {
    sync();
    const active=db.prepare("SELECT * FROM daily_trials WHERE state='VOTING'").get();
    const next=db.prepare("SELECT t.* FROM daily_trials t JOIN users u ON u.id=t.author_id WHERE t.state='QUEUED' AND u.active=1 ORDER BY t.seq LIMIT 1").get();
    return {config,server_time:stamp(),current:active?view(active,user):null,next:next?view(next,user):null,
      previous:db.prepare("SELECT * FROM daily_trials WHERE state='CLOSED' ORDER BY seq DESC LIMIT 5").all().map(t=>view(t,user)),
      history:history(user),can_submit:!!user&&!db.prepare("SELECT 1 FROM daily_trials WHERE author_id=? AND state='QUEUED'").get(user.id)};
  }
  function submit(body,user) {
    fields(body,['question','choices']);
    const question=text(body.question,8,160,'Question');
    if(!Array.isArray(body.choices)||body.choices.length<2||body.choices.length>4)fail(422,'INVALID_INPUT','Provide 2–4 text choices.');
    const choices=body.choices.map(c=>text(c,1,120,'Choice'));
    if(new Set(choices.map(c=>c.toLowerCase())).size!==choices.length)fail(422,'INVALID_INPUT','Choices must be different.');
    sync();
    const id=randomUUID();
    transaction(db,()=>{
      if(db.prepare("SELECT 1 FROM daily_trials WHERE author_id=? AND state='QUEUED'").get(user.id))fail(409,'QUEUE_LIMIT','You already have a question waiting in the queue.');
      db.prepare('INSERT INTO daily_trials(id,author_id,question,created_at) VALUES(?,?,?,?)').run(id,user.id,question,stamp());
      const insert=db.prepare('INSERT INTO daily_choices VALUES(?,?,?)');
      choices.forEach((label,i)=>insert.run(id,i,label));
    });
    sync();return view(find(id),user);
  }
  function vote(id,body,user) {
    fields(body,['choice']);sync();
    return transaction(db,()=>{
      const t=find(id);if(!t)fail(404,'NOT_FOUND','Daily question not found.');
      const time=now();
      if(t.state!=='VOTING'||Date.parse(t.closes_at)<=+time)fail(409,'PHASE_CLOSED','Voting has closed for this question. Refresh to see the result.');
      if(t.author_id===user.id)fail(403,'AUTHOR_VOTE','Question authors cannot vote on their own question.');
      if(!Number.isInteger(body.choice)||!db.prepare('SELECT 1 FROM daily_choices WHERE trial_id=? AND position=?').get(id,body.choice))fail(422,'INVALID_CHOICE','Choose one of this question’s options.');
      if(db.prepare('SELECT 1 FROM daily_votes WHERE trial_id=? AND user_id=?').get(id,user.id))fail(409,'DUPLICATE_VOTE','You already voted on this question.');
      db.prepare('INSERT INTO daily_votes VALUES(?,?,?,?)').run(id,user.id,body.choice,time.toISOString());
      return view(find(id),user);
    });
  }
  return {config,list,submit,vote,history:user=>{sync();return history(user);},get:(id,user)=>{sync();return view(find(id),user);}};
}
