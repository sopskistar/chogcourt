import {createHash,randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {transaction,isDemoDatabase,asStore,SCHEMA_VERSION} from './store.mjs';
import {createDaily} from './daily.mjs';
import {createWalletInspector,NFT_BLOCKER,NFT_COLLECTION} from './wallet.mjs';
import {createWalletAuth} from './wallet-auth.mjs';
import {CHOICES,verdictFrom,participationStats,tokenKey} from './rules.mjs';
const scrypt=promisify(scryptCallback);
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=()=>randomUUID();
const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
const text=(value,name,min=1,max=1200)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(422,'INVALID_INPUT',`${name} must contain ${min}–${max} characters.`);return value.trim();};
const username=value=>{const v=text(value,'Username',3,30).toLowerCase();if(!/^[a-z0-9_]+$/.test(v))fail(422,'INVALID_INPUT','Usernames use letters, numbers and underscores.');return v;};
const publicUser=u=>u?{id:u.id,username:u.username,created_at:u.created_at}:null;
const fields=(object,allowed)=>{if(Object.keys(object).some(k=>!allowed.includes(k)))fail(422,'UNKNOWN_FIELD','The request contains unsupported fields.');};
const CATEGORIES=['Community','Memes','Chog lore'];
export function createApplication({db,origin='http://127.0.0.1:4173',production=false,now=()=>new Date(),quorum=3,evidenceSeconds=86400,votingSeconds=86400,juryPolicy='account',registrationCode='',walletInspector=createWalletInspector()}) {
  if(isDemoDatabase(db)&&(production||process.env.NODE_ENV==='production'||new URL(origin).hostname!=='127.0.0.1'||new URL(origin).protocol!=='http:'))throw Error('Local demo requires a loopback-only development server.');
  db=asStore(db);
  const daily=createDaily({db,now});
  const walletAuth=createWalletAuth({db,origin,now,inspect:walletInspector});
  const sessionName=isDemoDatabase(db)?'chog_demo_session':'chog_session';
  if(!['account','nft'].includes(juryPolicy))throw Error('JURY_POLICY must be account or nft');
  for(const n of [quorum,evidenceSeconds,votingSeconds])if(!Number.isSafeInteger(n)||n<1)throw Error('Court rule values must be positive integers');
  const stamp=()=>now().toISOString();
  const limits=new Map();
  async function rate(key,max) {
    const time=+now();if(limits.size>10000)for(const [k,v]of limits)if(v.until<=time)limits.delete(k);
    if(db.kind==='postgres'){
      const window=Math.floor(time/60000),rateKey=hash(key);
      const result=await db.prepare(`INSERT INTO rate_limits(rate_key,window_start,hits) VALUES(?,?,1)
        ON CONFLICT(rate_key) DO UPDATE SET window_start=excluded.window_start,
        hits=CASE WHEN rate_limits.window_start=excluded.window_start THEN rate_limits.hits+1 ELSE 1 END RETURNING hits`).get(rateKey,window);
      if(result.hits===1&&window%15===0)await db.prepare('DELETE FROM rate_limits WHERE window_start<?').run(window-60);
      if(result.hits>max)fail(429,'RATE_LIMIT','Too many requests. Wait a minute and try again.');
      return;
    }
    const entry=limits.get(key);if(!entry||entry.until<=time){limits.set(key,{n:1,until:time+60000});return;}
    if(++entry.n>max)fail(429,'RATE_LIMIT','Too many requests. Wait a minute and try again.');
  }
  const event=async(claimId,actor,eventName,detail)=>db.prepare('INSERT INTO history(claim_id,actor_id,event,detail,created_at) VALUES(?,?,?,?,?)').run(claimId,actor,eventName,detail,stamp());
  async function finalize(c) {
    if(c.state==='FINALIZED')return;
    const result=verdictFrom(await db.prepare('SELECT choice FROM votes WHERE claim_id=?').all(c.id),c.min_quorum);
    await db.prepare('INSERT INTO verdicts(claim_id,outcome,reason,total,guilty,innocent,insufficient,min_quorum,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(c.id,result.outcome,result.reason,result.total,result.guilty,result.innocent,result.insufficient,result.min_quorum,stamp());
    await db.prepare("UPDATE claims SET state='FINALIZED' WHERE id=?").run(c.id);
    await event(c.id,null,'FINALIZED',`${result.outcome}: ${result.reason}`);
  }
  async function syncClaim(claimId) {
    return transaction(db,async()=>{
      let c=await db.prepare(`SELECT * FROM claims WHERE id=?${db.kind==='postgres'?' FOR UPDATE':''}`).get(claimId);
      if(!c)fail(404,'NOT_FOUND','Case not found.');
      if(['OPEN','EVIDENCE_RESPONSE'].includes(c.state)&&Date.parse(c.response_deadline)<=+now()) {
        const deadline=new Date(Date.parse(c.response_deadline)+c.voting_seconds*1000).toISOString();
        await db.prepare("UPDATE claims SET state='VOTING',voting_deadline=? WHERE id=?").run(deadline,c.id);
        await event(c.id,null,'VOTING','Evidence/response deadline reached.');
        c=await db.prepare('SELECT * FROM claims WHERE id=?').get(claimId);
      }
      if(c.state==='VOTING'&&Date.parse(c.voting_deadline)<=+now())await finalize(c);
      return db.prepare('SELECT * FROM claims WHERE id=?').get(claimId);
    });
  }
  async function eligible(c,user) {
    if(!user)return {eligible:false,reason:'Sign in to participate.'};
    if(c.plaintiff_id===user.id||c.defendant_id===user.id)return {eligible:false,reason:'Case parties cannot serve on their own jury.'};
    if(c.jury_policy!=='account')return {eligible:false,reason:'Verified NFT jury eligibility is not configured.'};
    if(c.state!=='VOTING')return {eligible:false,reason:'This case is not accepting votes.'};
    if(await db.prepare('SELECT 1 FROM votes WHERE claim_id=? AND user_id=?').get(c.id,user.id))return {eligible:false,reason:'You have already voted on this case.'};
    return {eligible:true,reason:'Active authenticated court account; not a case party. This is not NFT-holder verification.'};
  }
  async function view(c,user) {
    const names=await db.prepare('SELECT id,username FROM users WHERE id IN (?,?)').all(c.plaintiff_id,c.defendant_id);
    const evidenceCount=(await db.prepare('SELECT count(*) AS n FROM evidence WHERE claim_id=?').get(c.id)).n;
    const votes=(await db.prepare('SELECT count(*) AS n FROM votes WHERE claim_id=?').get(c.id)).n;
    const score=Math.min(100,8*Math.min(5,evidenceCount)+4*Math.min(15,votes));
    const [eligibility,myVote,ready,response,verdict]=await Promise.all([eligible(c,user),user?db.prepare('SELECT choice FROM votes WHERE claim_id=? AND user_id=?').get(c.id,user.id):null,db.prepare('SELECT user_id FROM readiness WHERE claim_id=?').all(c.id),db.prepare('SELECT id,body,created_at FROM responses WHERE claim_id=?').get(c.id),db.prepare('SELECT * FROM verdicts WHERE claim_id=?').get(c.id)]);
    return {...c,plaintiff:names.find(u=>u.id===c.plaintiff_id).username,defendant:names.find(u=>u.id===c.defendant_id).username,source:'shared-offchain',evidence_count:evidenceCount,jury_participation:votes,eligibility,my_vote:myVote?.choice||null,ready:ready.map(r=>r.user_id),response:response||null,verdict:verdict||null,chaos:{score,label:score<25?'Low Chaos':score<60?'Court Is Heating Up':'Maximum Chaos',basis:'8 × evidence items (max 5) + 4 × eligible account jurors (max 15). Activity only; never affects the verdict.'}};
  }
  async function session(request) {
    const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionName+'='))?.slice(sessionName.length+1);
    if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
    return await db.prepare('SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=TRUE').get(hash(token),stamp())||null;
  }
  async function login(user) {
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
    await db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(stamp());
    await db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),user.id,new Date(+now()+7*86400000).toISOString(),csrf);
    return {token,csrf};
  }
  const cookie=token=>`${sessionName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token?604800:0}${production?'; Secure':''}`;
  const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  const chain={network:'Monad',chainId:143,tokenContract:'0x350035555E10d9AfAF1566AaebfCeD5BA6C27777',tokenSource:'https://www.chog.xyz/',nftCollection:NFT_COLLECTION,nftSource:'https://mint.chog.xyz/',walletConnection:'injected-eip1193',nominationThreshold:null,walletVerification:true,nftJuryEnabled:false,balanceVerified:false,nominationEnabled:false,blocker:NFT_BLOCKER};
  const handleRequest=async function handle(request,{ip='local',path:routePath}={}) {
    try {
      const url=new URL(request.url),path=routePath||url.pathname,method=request.method;
      if(path==='/api/health'&&method==='GET'){await db.prepare('SELECT 1').get();return json({ok:true,database:db.kind,schema:SCHEMA_VERSION});}
      if(!path.startsWith('/api/'))return json({error:{code:'NOT_FOUND',message:'API route not found.'}},404);
      const user=await session(request);let body={};
      if(method!=='GET') {
        const source=request.headers.get('origin');if(source&&source!==origin)fail(403,'ORIGIN','Cross-origin requests are not accepted.');
        if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'CONTENT_TYPE','Use application/json.');
        const raw=await request.text();if(Buffer.byteLength(raw)>1500000)fail(413,'TOO_LARGE','Request is too large.');
        try {body=JSON.parse(raw);}catch{fail(400,'INVALID_JSON','Invalid JSON body.');}
        if(!body||Array.isArray(body)||typeof body!=='object')fail(422,'INVALID_INPUT','Expected a JSON object.');
        if(!['/api/auth/register','/api/auth/login'].includes(path)) {
          if(!user)fail(401,'AUTH_REQUIRED','Sign in to continue.');
          if(request.headers.get('x-csrf-token')!==user.csrf)fail(403,'CSRF','Session check failed. Reload and try again.');
          await rate('write:'+user.id,60);
        }
      }
      if(path==='/api/config'&&method==='GET')return json({source:isDemoDatabase(db)?'local-demo':'shared-offchain',juryPolicy,quorum,evidenceSeconds,votingSeconds,chain,registrationRequiresCode:!!registrationCode,daily:daily.config});
      if(path==='/api/wallet/inspect'&&method==='POST'){
        fields(body,['address']);await rate('wallet:'+user.id,6);await rate('wallet:global',60);
        return json(await walletInspector(body.address));
      }
      if(path==='/api/wallet/status'&&method==='GET')return json(await walletAuth.status(user));
      if(path==='/api/wallet/disconnect'&&method==='POST'){fields(body,[]);return json(await walletAuth.disconnect(user));}
      if(path==='/api/wallet/challenge'&&method==='POST'){
        fields(body,['address','chainId','tokenId']);await rate('wallet-challenge:'+user.id,12);
        return json(await walletAuth.challenge(user,body));
      }
      if(path==='/api/wallet/verify'&&method==='POST'){
        fields(body,['challengeId','signature']);await rate('wallet-verify:'+user.id,6);await rate('wallet:global',60);
        return json(await walletAuth.verify(user,body));
      }
      if(path==='/api/wallet/recheck'&&method==='POST'){
        fields(body,[]);await rate('wallet-recheck:'+user.id,6);await rate('wallet:global',60);
        return json(await walletAuth.recheck(user));
      }
      if(path==='/api/daily'&&method==='GET')return json(await daily.list(user));
      if(path==='/api/daily'&&method==='POST')return json(await daily.submit(body,user),201);
      const dailyMatch=path.match(/^\/api\/daily\/([a-f0-9-]{36})(?:\/(votes))?$/);
      if(dailyMatch&&!dailyMatch[2]&&method==='GET')return json(await daily.get(dailyMatch[1],user));
      if(dailyMatch?.[2]==='votes'&&method==='POST')return json(await daily.vote(dailyMatch[1],body,user),201);
      if(path==='/api/auth/me'&&method==='GET')return json({user:publicUser(user),csrf:user?.csrf||null});
      if(['/api/auth/register','/api/auth/login'].includes(path)&&method==='POST') {
        await rate('auth:'+ip,20);fields(body,['username','password','invitation']);
        const name=username(body.username),password=body.password;
        if(typeof password!=='string'||password.length<12||password.length>128)fail(422,'INVALID_INPUT','Use a password of 12–128 characters. Never use a wallet seed phrase.');
        let account=await db.prepare('SELECT * FROM users WHERE username=?').get(name);
        if(path.endsWith('/register')) {
          if(registrationCode&&body.invitation!==registrationCode)fail(403,'INVITATION','A valid court invitation is required.');
          if(account)fail(409,'USERNAME_TAKEN','That username is already registered.');
          const salt=randomBytes(16).toString('hex'),digest=(await scrypt(password,salt,64)).toString('hex');
          try{await db.prepare('INSERT INTO users(id,username,password_hash,salt,created_at) VALUES(?,?,?,?,?)').run(id(),name,digest,salt,stamp());}catch(error){if(error.code==='23505'||error.code?.includes('CONSTRAINT'))fail(409,'USERNAME_TAKEN','That username is already registered.');throw error;}
          account=await db.prepare('SELECT * FROM users WHERE username=?').get(name);
        } else {
          const digest=await scrypt(password,account?.salt||'not-an-account',64);
          if(!account||!account.active||!timingSafeEqual(digest,Buffer.from(account.password_hash,'hex')))fail(401,'LOGIN_FAILED','Username or password is incorrect.');
        }
        const auth=await login(account);return json({user:publicUser(account),csrf:auth.csrf},200,{'Set-Cookie':cookie(auth.token)});
      }
      if(path==='/api/auth/logout'&&method==='POST'){await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);return json({ok:true},200,{'Set-Cookie':cookie('')});}
      if(path==='/api/claims'&&method==='POST') {
        fields(body,['title','category','argument','defendant']);
        const title=text(body.title,'Question',8,80),argument=text(body.argument,'Argument',20,1200),category=body.category;
        if(!CATEGORIES.includes(category))fail(422,'INVALID_INPUT','Choose a court division.');
        const defendant=await db.prepare('SELECT * FROM users WHERE username=? AND active=TRUE').get(username(body.defendant));
        if(!defendant)fail(422,'DEFENDANT_NOT_FOUND','The defendant must register a court account first.');
        if(defendant.id===user.id)fail(422,'SELF_CASE','The plaintiff and defendant must be different accounts.');
        if((await db.prepare('SELECT count(*) AS n FROM claims WHERE plaintiff_id=? AND created_at>=?').get(user.id,new Date(+now()-86400000).toISOString())).n>=20)fail(429,'CASE_LIMIT','Limit: 20 new cases per account per 24 hours.');
        const claimId=id();await transaction(db,async()=>{
          await db.prepare('INSERT INTO claims(id,title,category,argument,plaintiff_id,defendant_id,state,created_at,response_deadline,voting_seconds,min_quorum,jury_policy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(claimId,title,category,argument,user.id,defendant.id,'OPEN',stamp(),new Date(+now()+evidenceSeconds*1000).toISOString(),votingSeconds,quorum,juryPolicy);
          await event(claimId,user.id,'OPEN','Case filed. Allegation only; no final finding.');
        });return json(await view(await syncClaim(claimId),user),201);
      }
      if(path==='/api/claims'&&method==='GET') {
        const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
        const records=await db.prepare('SELECT id FROM claims ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?').all(Math.floor(offset));
        const cases=await Promise.all(records.map(async c=>view(await syncClaim(c.id),user)));
        return json({cases,nextOffset:cases.length===50?offset+50:null});
      }
      const match=path.match(/^\/api\/claims\/([a-f0-9-]{36})(?:\/(evidence|response|ready|votes|adjudicate|verdict|history))?$/);
      if(match) {
        const c=await syncClaim(match[1]),action=match[2];
        if(!action&&method==='GET')return json(await view(c,user));
        if(action==='history'&&method==='GET')return json({events:await db.prepare('SELECT h.event,h.detail,h.created_at,u.username AS actor FROM history h LEFT JOIN users u ON u.id=h.actor_id WHERE claim_id=? ORDER BY h.id').all(c.id)});
        if(action==='verdict'&&method==='GET'){if(c.state!=='FINALIZED')fail(409,'PENDING','This case has no final verdict.');return json(await db.prepare('SELECT * FROM verdicts WHERE claim_id=?').get(c.id));}
        if(action==='evidence'&&method==='GET')return json({evidence:await db.prepare('SELECT e.id,e.label,e.mime_type,e.sha256,e.byte_length,e.created_at,u.username AS author FROM evidence e JOIN users u ON u.id=e.author_id WHERE claim_id=? ORDER BY e.created_at,e.id').all(c.id)});
        if(method==='POST'&&['evidence','response','ready'].includes(action)) {
          if(!['OPEN','EVIDENCE_RESPONSE'].includes(c.state))fail(409,'PHASE_CLOSED','Evidence and responses are closed for this case.');
          if(![c.plaintiff_id,c.defendant_id].includes(user.id))fail(403,'PARTY_REQUIRED','Only the plaintiff and defendant can submit or close their case evidence.');
          if(await db.prepare('SELECT 1 FROM readiness WHERE claim_id=? AND user_id=?').get(c.id,user.id))fail(409,'ALREADY_READY','You already closed your evidence/response window.');
          if(action==='response') {
            fields(body,['body']);if(c.defendant_id!==user.id)fail(403,'DEFENDANT_ONLY','Only the defendant can respond.');
            const response=text(body.body,'Response',20,2000);
            await transaction(db,async()=>{const current=await db.prepare(`SELECT state FROM claims WHERE id=?${db.kind==='postgres'?' FOR UPDATE':''}`).get(c.id);if(!current||!['OPEN','EVIDENCE_RESPONSE'].includes(current.state))fail(409,'PHASE_CLOSED','Evidence and responses are closed for this case.');if(await db.prepare('SELECT 1 FROM readiness WHERE claim_id=? AND user_id=?').get(c.id,user.id))fail(409,'ALREADY_READY','You already closed your evidence/response window.');if(await db.prepare('SELECT 1 FROM responses WHERE claim_id=?').get(c.id))fail(409,'DUPLICATE_RESPONSE','A response is already on record.');await db.prepare('INSERT INTO responses VALUES(?,?,?,?,?)').run(id(),c.id,user.id,response,stamp());await db.prepare("UPDATE claims SET state='EVIDENCE_RESPONSE' WHERE id=?").run(c.id);await event(c.id,user.id,'RESPONSE','Defendant response submitted.');});
          }
          if(action==='evidence') {
            fields(body,['label','text','base64']);
            if((typeof body.text==='string')===(typeof body.base64==='string'))fail(422,'INVALID_INPUT','Provide exactly one text or base64 evidence payload.');
            const label=text(body.label,'Evidence label',3,100);let bytes,mime;
            if(typeof body.text==='string'){bytes=Buffer.from(text(body.text,'Evidence',20,20000),'utf8');mime='text/plain';}
            else {if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64))fail(422,'INVALID_INPUT','Invalid base64 file.');bytes=Buffer.from(body.base64,'base64');mime='application/octet-stream';}
            if(!bytes.length||bytes.length>1048576)fail(413,'TOO_LARGE','Evidence must be between 1 byte and 1 MiB.');
            const sha256=hash(bytes);
            await transaction(db,async()=>{const current=await db.prepare(`SELECT state FROM claims WHERE id=?${db.kind==='postgres'?' FOR UPDATE':''}`).get(c.id);if(!current||!['OPEN','EVIDENCE_RESPONSE'].includes(current.state))fail(409,'PHASE_CLOSED','Evidence and responses are closed for this case.');if(await db.prepare('SELECT 1 FROM readiness WHERE claim_id=? AND user_id=?').get(c.id,user.id))fail(409,'ALREADY_READY','You already closed your evidence/response window.');if(await db.prepare('SELECT 1 FROM evidence WHERE claim_id=? AND sha256=?').get(c.id,sha256))fail(409,'DUPLICATE_EVIDENCE','Those exact evidence bytes are already on this case.');if((await db.prepare('SELECT count(*) AS n FROM evidence WHERE claim_id=?').get(c.id)).n>=20)fail(409,'EVIDENCE_LIMIT','This case has reached its 20-item limit.');await db.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run(id(),c.id,user.id,label,mime,sha256,bytes.length,bytes,stamp());await db.prepare("UPDATE claims SET state='EVIDENCE_RESPONSE' WHERE id=?").run(c.id);await event(c.id,user.id,'EVIDENCE',`SHA-256 ${sha256}`);});
          }
          if(action==='ready') {
            fields(body,[]);await transaction(db,async()=>{
              const current=await db.prepare(`SELECT state FROM claims WHERE id=?${db.kind==='postgres'?' FOR UPDATE':''}`).get(c.id);if(!current||!['OPEN','EVIDENCE_RESPONSE'].includes(current.state))fail(409,'PHASE_CLOSED','Evidence and responses are closed for this case.');if(await db.prepare('SELECT 1 FROM readiness WHERE claim_id=? AND user_id=?').get(c.id,user.id))fail(409,'ALREADY_READY','You already closed your evidence/response window.');
              await db.prepare('INSERT INTO readiness VALUES(?,?,?)').run(c.id,user.id,stamp());await event(c.id,user.id,'READY','Party closed their evidence/response window.');
              if((await db.prepare('SELECT count(*) AS n FROM readiness WHERE claim_id=?').get(c.id)).n===2){await db.prepare("UPDATE claims SET state='VOTING',voting_deadline=? WHERE id=?").run(new Date(+now()+c.voting_seconds*1000).toISOString(),c.id);await event(c.id,null,'VOTING','Both parties are ready.');}
              else await db.prepare("UPDATE claims SET state='EVIDENCE_RESPONSE' WHERE id=?").run(c.id);
            });
          }
          return json(await view(await syncClaim(c.id),user),201);
        }
        if(action==='votes'&&method==='POST') {
          fields(body,['choice']);if(!CHOICES.includes(body.choice))fail(422,'INVALID_INPUT','Choose Guilty, Innocent, or Not enough evidence.');
          await transaction(db,async()=>{const current=await db.prepare(`SELECT * FROM claims WHERE id=?${db.kind==='postgres'?' FOR UPDATE':''}`).get(c.id);if(!current||current.state!=='VOTING'||Date.parse(current.voting_deadline)<=+now())fail(409,'INELIGIBLE','This case is not accepting votes.');if(current.jury_policy!=='account')fail(403,'INELIGIBLE','Verified NFT jury eligibility is not configured.');if(current.plaintiff_id===user.id||current.defendant_id===user.id)fail(403,'INELIGIBLE','Case parties cannot serve on their own jury.');if(await db.prepare('SELECT 1 FROM votes WHERE claim_id=? AND user_id=?').get(c.id,user.id))fail(409,'INELIGIBLE','You have already voted on this case.');await db.prepare('INSERT INTO votes(claim_id,user_id,choice,eligibility_basis,created_at) VALUES(?,?,?,?,?)').run(c.id,user.id,body.choice,'authenticated-account; non-party',stamp());await event(c.id,user.id,'VOTE','Eligible account jury vote recorded. Choice remains private until finalization.');});
          return json(await view(await syncClaim(c.id),user),201);
        }
        if(action==='adjudicate'&&method==='POST') {
          fields(body,[]);if(c.state!=='FINALIZED')fail(409,'TOO_EARLY','A verdict can only be finalized after the voting deadline.');return json(await db.prepare('SELECT * FROM verdicts WHERE claim_id=?').get(c.id));
        }
      }
      const download=path.match(/^\/api\/evidence\/([a-f0-9-]{36})\/content$/);
      if(download&&method==='GET') {
        const e=await db.prepare('SELECT * FROM evidence WHERE id=?').get(download[1]);if(!e)fail(404,'NOT_FOUND','Evidence not found.');
        return new Response(e.content,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="evidence-${e.sha256.slice(0,12)}.bin"`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
      }
      if(path==='/api/profile'&&method==='GET') {
        if(!user)fail(401,'AUTH_REQUIRED','Sign in to view your participation.');
        const votes=await db.prepare('SELECT created_at FROM votes WHERE user_id=?').all(user.id),e=(await db.prepare('SELECT count(DISTINCT claim_id) AS n FROM evidence WHERE author_id=?').get(user.id)).n;
        // Avoid SQLite's permissive DISTINCT/ORDER BY behavior: PostgreSQL
        // requires ordered columns to be selected when DISTINCT is used.
        const records=await db.prepare(`SELECT c.id FROM claims c
          WHERE c.plaintiff_id=? OR c.defendant_id=? OR EXISTS(
            SELECT 1 FROM votes v WHERE v.claim_id=c.id AND v.user_id=?
          ) ORDER BY c.created_at DESC`).all(user.id,user.id,user.id);
        const cases=await Promise.all(records.map(async c=>view(await syncClaim(c.id),user)));
        const wallet=await walletAuth.status(user);
        return json({user:publicUser(user),stats:participationStats(votes,e,now()),cases,identity:{verified:!!wallet.tokenKey,tokenKey:wallet.tokenKey,wallet},source:'shared-offchain',dailyHistory:await daily.history(user)});
      }
      if(path==='/api/reputation'&&method==='GET') {
        const key=tokenKey(Object.fromEntries(url.searchParams));if(!key)fail(422,'INVALID_TOKEN_KEY','Provide chainId, collectionAddress and decimal tokenId.');
        const token=await db.prepare('SELECT * FROM tokens WHERE token_key=?').get(key);if(!token)fail(404,'UNVERIFIED_IDENTITY','No verified record exists for that NFT.');
        const records=await db.prepare('SELECT id FROM claims WHERE plaintiff_token_key=? OR defendant_token_key=?').all(key,key);
        const cases=await Promise.all(records.map(async c=>view(await syncClaim(c.id),user)));
        return json({token,cases,source:'shared-offchain',ownershipNote:'Stored verification is a historical observation, not proof of current ownership.'});
      }
      if(path==='/api/nominations'&&method==='GET')return json({enabled:false,nominations:[],chain});
      if(path==='/api/nominations'&&method==='POST')fail(503,'HOLDER_VERIFICATION_UNAVAILABLE',chain.blocker);
      fail(404,'NOT_FOUND','API route not found.');
    } catch(error) {
      const status=error.status||(error.code==='23505'?409:500);
      if(status===500)console.error('API failure:',error.code||error.name);
      return json({error:{code:error.code&&error.status?error.code:error.code==='23505'?'DUPLICATE_ACTION':'INTERNAL_ERROR',message:status===500?'The court could not complete this request. Try again.':error.message||'That action has already been recorded.'}},status);
    }
  };
  if(!db.serial)return handleRequest;
  let queue=Promise.resolve();
  return (request,context)=>{const next=queue.then(()=>handleRequest(request,context));queue=next.catch(()=>{});return next;};
}
