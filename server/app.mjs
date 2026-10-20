import {createHash,randomBytes,randomUUID,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {transaction,isDemoDatabase,SCHEMA_VERSION} from './database.mjs';
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
  const daily=createDaily({db,now});
  const walletAuth=createWalletAuth({db,origin,now,inspect:walletInspector});
  const sessionName=isDemoDatabase(db)?'chog_demo_session':'chog_session';
  if(!['account','nft'].includes(juryPolicy))throw Error('JURY_POLICY must be account or nft');
  for(const n of [quorum,evidenceSeconds,votingSeconds])if(!Number.isSafeInteger(n)||n<1)throw Error('Court rule values must be positive integers');
  const stamp=()=>now().toISOString();
  const limits=new Map();
  function rate(key,max) {
    const time=+now();if(limits.size>10000)for(const [k,v]of limits)if(v.until<=time)limits.delete(k);
    const entry=limits.get(key);if(!entry||entry.until<=time){limits.set(key,{n:1,until:time+60000});return;}
    if(++entry.n>max)fail(429,'RATE_LIMIT','Too many requests. Wait a minute and try again.');
  }
  const event=(claimId,actor,eventName,detail)=>db.prepare('INSERT INTO history(claim_id,actor_id,event,detail,created_at) VALUES(?,?,?,?,?)').run(claimId,actor,eventName,detail,stamp());
  function finalize(c) {
    if(c.state==='FINALIZED')return;
    const result=verdictFrom(db.prepare('SELECT choice FROM votes WHERE claim_id=?').all(c.id),c.min_quorum);
    db.prepare('INSERT INTO verdicts(claim_id,outcome,reason,total,guilty,innocent,insufficient,min_quorum,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(c.id,result.outcome,result.reason,result.total,result.guilty,result.innocent,result.insufficient,result.min_quorum,stamp());
    db.prepare("UPDATE claims SET state='FINALIZED' WHERE id=?").run(c.id);
    event(c.id,null,'FINALIZED',`${result.outcome}: ${result.reason}`);
  }
  function syncClaim(claimId) {
    return transaction(db,()=>{
      let c=db.prepare('SELECT * FROM claims WHERE id=?').get(claimId);
      if(!c)fail(404,'NOT_FOUND','Case not found.');
      if(['OPEN','EVIDENCE_RESPONSE'].includes(c.state)&&Date.parse(c.response_deadline)<=+now()) {
        const deadline=new Date(Date.parse(c.response_deadline)+c.voting_seconds*1000).toISOString();
        db.prepare("UPDATE claims SET state='VOTING',voting_deadline=? WHERE id=?").run(deadline,c.id);
        event(c.id,null,'VOTING','Evidence/response deadline reached.');
        c=db.prepare('SELECT * FROM claims WHERE id=?').get(claimId);
      }
      if(c.state==='VOTING'&&Date.parse(c.voting_deadline)<=+now())finalize(c);
      return db.prepare('SELECT * FROM claims WHERE id=?').get(claimId);
    });
  }
  function eligible(c,user) {
    if(!user)return {eligible:false,reason:'Sign in to participate.'};
    if(c.plaintiff_id===user.id||c.defendant_id===user.id)return {eligible:false,reason:'Case parties cannot serve on their own jury.'};
    if(c.jury_policy!=='account')return {eligible:false,reason:'Verified NFT jury eligibility is not configured.'};
    if(c.state!=='VOTING')return {eligible:false,reason:'This case is not accepting votes.'};
    if(db.prepare('SELECT 1 FROM votes WHERE claim_id=? AND user_id=?').get(c.id,user.id))return {eligible:false,reason:'You have already voted on this case.'};
    return {eligible:true,reason:'Active authenticated court account; not a case party. This is not NFT-holder verification.'};
  }
  function view(c,user) {
    const names=db.prepare('SELECT id,username FROM users WHERE id IN (?,?)').all(c.plaintiff_id,c.defendant_id);
    const evidenceCount=db.prepare('SELECT count(*) AS n FROM evidence WHERE claim_id=?').get(c.id).n;
    const votes=db.prepare('SELECT count(*) AS n FROM votes WHERE claim_id=?').get(c.id).n;
    const score=Math.min(100,8*Math.min(5,evidenceCount)+4*Math.min(15,votes));
    return {...c,plaintiff:names.find(u=>u.id===c.plaintiff_id).username,defendant:names.find(u=>u.id===c.defendant_id).username,source:'shared-offchain',evidence_count:evidenceCount,jury_participation:votes,eligibility:eligible(c,user),my_vote:user?db.prepare('SELECT choice FROM votes WHERE claim_id=? AND user_id=?').get(c.id,user.id)?.choice||null:null,ready:db.prepare('SELECT user_id FROM readiness WHERE claim_id=?').all(c.id).map(r=>r.user_id),response:db.prepare('SELECT id,body,created_at FROM responses WHERE claim_id=?').get(c.id)||null,verdict:db.prepare('SELECT * FROM verdicts WHERE claim_id=?').get(c.id)||null,chaos:{score,label:score<25?'Low Chaos':score<60?'Court Is Heating Up':'Maximum Chaos',basis:'8 × evidence items (max 5) + 4 × eligible account jurors (max 15). Activity only; never affects the verdict.'}};
  }
  function session(request) {
    const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionName+'='))?.slice(sessionName.length+1);
    if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
    return db.prepare('SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1').get(hash(token),stamp())||null;
  }
  function login(user) {
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(stamp());
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),user.id,new Date(+now()+7*86400000).toISOString(),csrf);
    return {token,csrf};
  }
  const cookie=token=>`${sessionName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token?604800:0}${production?'; Secure':''}`;
  const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  const chain={network:'Monad',chainId:143,tokenContract:'0x350035555E10d9AfAF1566AaebfCeD5BA6C27777',tokenSource:'https://www.chog.xyz/',nftCollection:NFT_COLLECTION,nftSource:'https://mint.chog.xyz/',walletConnection:'injected-eip1193',nominationThreshold:null,walletVerification:true,nftJuryEnabled:false,balanceVerified:false,nominationEnabled:false,blocker:NFT_BLOCKER};
  return async function handle(request,{ip='local'}={}) {
    try {
      const url=new URL(request.url),path=url.pathname,method=request.method;
      if(path==='/api/health'&&method==='GET'){db.prepare('SELECT 1').get();return json({ok:true,database:'sqlite',schema:SCHEMA_VERSION});}
      if(!path.startsWith('/api/'))return json({error:{code:'NOT_FOUND',message:'API route not found.'}},404);
      const user=session(request);let body={};
      if(method!=='GET') {
        const source=request.headers.get('origin');if(source&&source!==origin)fail(403,'ORIGIN','Cross-origin requests are not accepted.');
        if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'CONTENT_TYPE','Use application/json.');
        const raw=await request.text();if(Buffer.byteLength(raw)>1500000)fail(413,'TOO_LARGE','Request is too large.');
        try {body=JSON.parse(raw);}catch{fail(400,'INVALID_JSON','Invalid JSON body.');}
        if(!body||Array.isArray(body)||typeof body!=='object')fail(422,'INVALID_INPUT','Expected a JSON object.');
        if(!['/api/auth/register','/api/auth/login'].includes(path)) {
          if(!user)fail(401,'AUTH_REQUIRED','Sign in to continue.');
          if(request.headers.get('x-csrf-token')!==user.csrf)fail(403,'CSRF','Session check failed. Reload and try again.');
          rate('write:'+user.id,60);
        }
      }
      if(path==='/api/config'&&method==='GET')return json({source:isDemoDatabase(db)?'local-demo':'shared-offchain',juryPolicy,quorum,evidenceSeconds,votingSeconds,chain,registrationRequiresCode:!!registrationCode,daily:daily.config});
      if(path==='/api/wallet/inspect'&&method==='POST'){
        fields(body,['address']);rate('wallet:'+user.id,6);rate('wallet:global',60);
        return json(await walletInspector(body.address));
      }
      if(path==='/api/wallet/status'&&method==='GET')return json(walletAuth.status(user));
      if(path==='/api/wallet/disconnect'&&method==='POST'){fields(body,[]);return json(walletAuth.disconnect(user));}
      if(path==='/api/wallet/challenge'&&method==='POST'){
        fields(body,['address','chainId','tokenId']);rate('wallet-challenge:'+user.id,12);
        return json(walletAuth.challenge(user,body));
      }
      if(path==='/api/wallet/verify'&&method==='POST'){
        fields(body,['challengeId','signature']);rate('wallet-verify:'+user.id,6);rate('wallet:global',60);
        return json(await walletAuth.verify(user,body));
      }
      if(path==='/api/wallet/recheck'&&method==='POST'){
        fields(body,[]);rate('wallet-recheck:'+user.id,6);rate('wallet:global',60);
        return json(await walletAuth.recheck(user));
      }
      if(path==='/api/daily'&&method==='GET')return json(daily.list(user));
      if(path==='/api/daily'&&method==='POST')return json(daily.submit(body,user),201);
      const dailyMatch=path.match(/^\/api\/daily\/([a-f0-9-]{36})(?:\/(votes))?$/);
      if(dailyMatch&&!dailyMatch[2]&&method==='GET')return json(daily.get(dailyMatch[1],user));
      if(dailyMatch?.[2]==='votes'&&method==='POST')return json(daily.vote(dailyMatch[1],body,user),201);
      if(path==='/api/auth/me'&&method==='GET')return json({user:publicUser(user),csrf:user?.csrf||null});
      if(['/api/auth/register','/api/auth/login'].includes(path)&&method==='POST') {
        rate('auth:'+ip,20);fields(body,['username','password','invitation']);
        const name=username(body.username),password=body.password;
        if(typeof password!=='string'||password.length<12||password.length>128)fail(422,'INVALID_INPUT','Use a password of 12–128 characters. Never use a wallet seed phrase.');
        let account=db.prepare('SELECT * FROM users WHERE username=?').get(name);
        if(path.endsWith('/register')) {
          if(registrationCode&&body.invitation!==registrationCode)fail(403,'INVITATION','A valid court invitation is required.');
          if(account)fail(409,'USERNAME_TAKEN','That username is already registered.');
          const salt=randomBytes(16).toString('hex'),digest=(await scrypt(password,salt,64)).toString('hex');
          try{db.prepare('INSERT INTO users(id,username,password_hash,salt,created_at) VALUES(?,?,?,?,?)').run(id(),name,digest,salt,stamp());}catch(error){if(error.code?.includes('CONSTRAINT'))fail(409,'USERNAME_TAKEN','That username is already registered.');throw error;}
          account=db.prepare('SELECT * FROM users WHERE username=?').get(name);
        } else {
          const digest=await scrypt(password,account?.salt||'not-an-account',64);
          if(!account||!account.active||!timingSafeEqual(digest,Buffer.from(account.password_hash,'hex')))fail(401,'LOGIN_FAILED','Username or password is incorrect.');
        }
        const auth=login(account);return json({user:publicUser(account),csrf:auth.csrf},200,{'Set-Cookie':cookie(auth.token)});
      }
      if(path==='/api/auth/logout'&&method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);return json({ok:true},200,{'Set-Cookie':cookie('')});}
      if(path==='/api/claims'&&method==='POST') {
        fields(body,['title','category','argument','defendant']);
        const title=text(body.title,'Question',8,80),argument=text(body.argument,'Argument',20,1200),category=body.category;
        if(!CATEGORIES.includes(category))fail(422,'INVALID_INPUT','Choose a court division.');
        const defendant=db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username(body.defendant));
        if(!defendant)fail(422,'DEFENDANT_NOT_FOUND','The defendant must register a court account first.');
        if(defendant.id===user.id)fail(422,'SELF_CASE','The plaintiff and defendant must be different accounts.');
        if(db.prepare('SELECT count(*) AS n FROM claims WHERE plaintiff_id=? AND created_at>=?').get(user.id,new Date(+now()-86400000).toISOString()).n>=20)fail(429,'CASE_LIMIT','Limit: 20 new cases per account per 24 hours.');
        const claimId=id();transaction(db,()=>{
          db.prepare('INSERT INTO claims(id,title,category,argument,plaintiff_id,defendant_id,state,created_at,response_deadline,voting_seconds,min_quorum,jury_policy) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(claimId,title,category,argument,user.id,defendant.id,'OPEN',stamp(),new Date(+now()+evidenceSeconds*1000).toISOString(),votingSeconds,quorum,juryPolicy);
          event(claimId,user.id,'OPEN','Case filed. Allegation only; no final finding.');
        });return json(view(syncClaim(claimId),user),201);
      }
      if(path==='/api/claims'&&method==='GET') {
        const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));
        const cases=db.prepare('SELECT id FROM claims ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?').all(Math.floor(offset)).map(c=>view(syncClaim(c.id),user));
        return json({cases,nextOffset:cases.length===50?offset+50:null});
      }
      const match=path.match(/^\/api\/claims\/([a-f0-9-]{36})(?:\/(evidence|response|ready|votes|adjudicate|verdict|history))?$/);
      if(match) {
        const c=syncClaim(match[1]),action=match[2];
        if(!action&&method==='GET')return json(view(c,user));
        if(action==='history'&&method==='GET')return json({events:db.prepare('SELECT h.event,h.detail,h.created_at,u.username AS actor FROM history h LEFT JOIN users u ON u.id=h.actor_id WHERE claim_id=? ORDER BY h.id').all(c.id)});
        if(action==='verdict'&&method==='GET'){if(c.state!=='FINALIZED')fail(409,'PENDING','This case has no final verdict.');return json(db.prepare('SELECT * FROM verdicts WHERE claim_id=?').get(c.id));}
        if(action==='evidence'&&method==='GET')return json({evidence:db.prepare('SELECT e.id,e.label,e.mime_type,e.sha256,e.byte_length,e.created_at,u.username AS author FROM evidence e JOIN users u ON u.id=e.author_id WHERE claim_id=? ORDER BY e.created_at,e.id').all(c.id)});
        if(method==='POST'&&['evidence','response','ready'].includes(action)) {
          if(!['OPEN','EVIDENCE_RESPONSE'].includes(c.state))fail(409,'PHASE_CLOSED','Evidence and responses are closed for this case.');
          if(![c.plaintiff_id,c.defendant_id].includes(user.id))fail(403,'PARTY_REQUIRED','Only the plaintiff and defendant can submit or close their case evidence.');
          if(db.prepare('SELECT 1 FROM readiness WHERE claim_id=? AND user_id=?').get(c.id,user.id))fail(409,'ALREADY_READY','You already closed your evidence/response window.');
          if(action==='response') {
            fields(body,['body']);if(c.defendant_id!==user.id)fail(403,'DEFENDANT_ONLY','Only the defendant can respond.');
            const response=text(body.body,'Response',20,2000);
            if(db.prepare('SELECT 1 FROM responses WHERE claim_id=?').get(c.id))fail(409,'DUPLICATE_RESPONSE','A response is already on record.');
            transaction(db,()=>{db.prepare('INSERT INTO responses VALUES(?,?,?,?,?)').run(id(),c.id,user.id,response,stamp());db.prepare("UPDATE claims SET state='EVIDENCE_RESPONSE' WHERE id=?").run(c.id);event(c.id,user.id,'RESPONSE','Defendant response submitted.');});
          }
          if(action==='evidence') {
            fields(body,['label','text','base64']);
            if((typeof body.text==='string')===(typeof body.base64==='string'))fail(422,'INVALID_INPUT','Provide exactly one text or base64 evidence payload.');
            const label=text(body.label,'Evidence label',3,100);let bytes,mime;
            if(typeof body.text==='string'){bytes=Buffer.from(text(body.text,'Evidence',20,20000),'utf8');mime='text/plain';}
            else {if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64))fail(422,'INVALID_INPUT','Invalid base64 file.');bytes=Buffer.from(body.base64,'base64');mime='application/octet-stream';}
            if(!bytes.length||bytes.length>1048576)fail(413,'TOO_LARGE','Evidence must be between 1 byte and 1 MiB.');
            const sha256=hash(bytes);
            if(db.prepare('SELECT 1 FROM evidence WHERE claim_id=? AND sha256=?').get(c.id,sha256))fail(409,'DUPLICATE_EVIDENCE','Those exact evidence bytes are already on this case.');
            if(db.prepare('SELECT count(*) AS n FROM evidence WHERE claim_id=?').get(c.id).n>=20)fail(409,'EVIDENCE_LIMIT','This case has reached its 20-item evidence limit.');
            transaction(db,()=>{db.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?,?,?,?)').run(id(),c.id,user.id,label,mime,sha256,bytes.length,bytes,stamp());db.prepare("UPDATE claims SET state='EVIDENCE_RESPONSE' WHERE id=?").run(c.id);event(c.id,user.id,'EVIDENCE',`SHA-256 ${sha256}`);});
          }
          if(action==='ready') {
            fields(body,[]);transaction(db,()=>{
              db.prepare('INSERT INTO readiness VALUES(?,?,?)').run(c.id,user.id,stamp());event(c.id,user.id,'READY','Party closed its evidence/response window.');
              if(db.prepare('SELECT count(*) AS n FROM readiness WHERE claim_id=?').get(c.id).n===2){db.prepare("UPDATE claims SET state='VOTING',voting_deadline=? WHERE id=?").run(new Date(+now()+c.voting_seconds*1000).toISOString(),c.id);event(c.id,null,'VOTING','Both parties are ready.');}
              else db.prepare("UPDATE claims SET state='EVIDENCE_RESPONSE' WHERE id=?").run(c.id);
            });
          }
          return json(view(syncClaim(c.id),user),201);
        }
        if(action==='votes'&&method==='POST') {
          fields(body,['choice']);if(!CHOICES.includes(body.choice))fail(422,'INVALID_INPUT','Choose Guilty, Innocent, or Not enough evidence.');
          const access=eligible(c,user);if(!access.eligible)fail(c.state!=='VOTING'||/already/.test(access.reason)?409:403,'INELIGIBLE',access.reason);
          transaction(db,()=>{db.prepare('INSERT INTO votes(claim_id,user_id,choice,eligibility_basis,created_at) VALUES(?,?,?,?,?)').run(c.id,user.id,body.choice,'authenticated-account; non-party',stamp());event(c.id,user.id,'VOTE','Eligible account jury vote recorded. Choice remains private until finalization.');});
          return json(view(syncClaim(c.id),user),201);
        }
        if(action==='adjudicate'&&method==='POST') {
          fields(body,[]);if(c.state!=='FINALIZED')fail(409,'TOO_EARLY','A verdict can only be finalized after the voting deadline.');return json(db.prepare('SELECT * FROM verdicts WHERE claim_id=?').get(c.id));
        }
      }
      const download=path.match(/^\/api\/evidence\/([a-f0-9-]{36})\/content$/);
      if(download&&method==='GET') {
        const e=db.prepare('SELECT * FROM evidence WHERE id=?').get(download[1]);if(!e)fail(404,'NOT_FOUND','Evidence not found.');
        return new Response(e.content,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="evidence-${e.sha256.slice(0,12)}.bin"`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
      }
      if(path==='/api/profile'&&method==='GET') {
        if(!user)fail(401,'AUTH_REQUIRED','Sign in to view your participation.');
        const votes=db.prepare('SELECT created_at FROM votes WHERE user_id=?').all(user.id),e=db.prepare('SELECT count(DISTINCT claim_id) AS n FROM evidence WHERE author_id=?').get(user.id).n;
        const cases=db.prepare('SELECT DISTINCT c.id FROM claims c LEFT JOIN votes v ON v.claim_id=c.id WHERE c.plaintiff_id=? OR c.defendant_id=? OR v.user_id=? ORDER BY c.created_at DESC').all(user.id,user.id,user.id).map(c=>view(syncClaim(c.id),user));
        const wallet=walletAuth.status(user);
        return json({user:publicUser(user),stats:participationStats(votes,e,now()),cases,identity:{verified:!!wallet.tokenKey,tokenKey:wallet.tokenKey,wallet},source:'shared-offchain',dailyHistory:daily.history(user)});
      }
      if(path==='/api/reputation'&&method==='GET') {
        const key=tokenKey(Object.fromEntries(url.searchParams));if(!key)fail(422,'INVALID_TOKEN_KEY','Provide chainId, collectionAddress and decimal tokenId.');
        const token=db.prepare('SELECT * FROM tokens WHERE token_key=?').get(key);if(!token)fail(404,'UNVERIFIED_IDENTITY','No verified record exists for that NFT.');
        const cases=db.prepare('SELECT id FROM claims WHERE plaintiff_token_key=? OR defendant_token_key=?').all(key,key).map(c=>view(syncClaim(c.id),user));
        return json({token,cases,source:'shared-offchain',ownershipNote:'Stored verification is a historical observation, not proof of current ownership.'});
      }
      if(path==='/api/nominations'&&method==='GET')return json({enabled:false,nominations:[],chain});
      if(path==='/api/nominations'&&method==='POST')fail(503,'HOLDER_VERIFICATION_UNAVAILABLE',chain.blocker);
      fail(404,'NOT_FOUND','API route not found.');
    } catch(error) {
      const status=error.status||500;
      if(status===500)console.error('API failure:',error.code||error.name);
      return json({error:{code:error.code&&error.status?error.code:'INTERNAL_ERROR',message:status===500?'The court could not complete this request. Try again.':error.message}},status);
    }
  };
}
