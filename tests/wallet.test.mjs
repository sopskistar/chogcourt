import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Wallet} from '../server/vendor/ethers-6.17.0.mjs';
import {createWalletInspector,NFT_COLLECTION} from '../server/wallet.mjs';
import {createApplication} from '../server/app.mjs';
import {openDatabase} from '../server/database.mjs';
// Disposable, unfunded signers; only RPC is mocked, not signature verification.
const signer=Wallet.createRandom(),other=Wallet.createRandom(),address=signer.address.toLowerCase();
const block={number:'0x123',hash:'0x'+'b'.repeat(64)},word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
function mockRPC(reply) {
 const calls=[];
 return {calls,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://rpc.monad.xyz/');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  const q=JSON.parse(options.body);calls.push(q);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,...await reply(q)}));
 }};
}
function reply(q) {
 if(q.method==='eth_chainId')return {result:'0x8f'};
 if(q.method==='eth_getBlockByNumber')return {result:block};
 if(q.method==='eth_getCode')return {result:'0x1234'};
 const d=q.params[0].data;
 return {result:d.startsWith('0x01ffc9a7')?word(d.includes('ffffffff')?0:1):d.startsWith('0x70a08231')?word(2):word(address)};
}
test('Allowlisted ERC-721 balance and owner reads use a checked Monad block; raw observations are not authentication',async()=>{
 const fake=mockRPC(reply),r=await createWalletInspector(fake)(address,'00476');
 assert.equal(r.status,'HOLDER');assert.equal(r.balance,'2');assert.equal(r.ownsToken,true);assert.equal(r.tokenId,'476');assert.equal(r.tokenOwner,address);assert.equal(r.contract,NFT_COLLECTION);assert.equal(r.blockHash,block.hash);
 assert.equal(r.walletAuthenticated,false);assert.equal(r.ownershipVerified,false);assert.equal(r.eligible,false);
 for(const q of fake.calls.filter(q=>q.method==='eth_call')){assert.equal(q.params[0].to,NFT_COLLECTION);assert.equal(q.params[1],block.number);}
 assert.equal(fake.calls.at(-1).method,'eth_getBlockByNumber');assert.equal(fake.calls.at(-1).params[0],block.number);
 assert.ok(fake.calls.some(q=>q.params[0]?.data?.startsWith('0x6352211e')));
});
test('Zero balance and another token owner are explicit negative observations',async()=>{
 let fake=mockRPC(q=>q.params[0]?.data?.startsWith('0x70a08231')?{result:word(0)}:reply(q));
 assert.equal((await createWalletInspector(fake)(address)).status,'NOT_HOLDER');assert.ok(!fake.calls.some(q=>q.params[0]?.data?.startsWith('0x6352211e')));
 fake=mockRPC(q=>q.params[0]?.data?.startsWith('0x6352211e')?{result:word(other.address)}:reply(q));assert.equal((await createWalletInspector(fake)(address,'476')).status,'TOKEN_NOT_OWNED');
});
test('Wrong chain, missing code, ERC-20/reverting interfaces and lying ERC-165 fail closed before balances',async()=>{
 for(const [modify,code]of [[q=>q.method==='eth_chainId'?{result:'0x1'}:reply(q),'WRONG_RPC_NETWORK'],[q=>q.method==='eth_getCode'?{result:'0x'}:reply(q),'NO_CONTRACT'],[q=>q.method==='eth_call'?{error:{code:3}}:reply(q),'NOT_ERC721'],[q=>q.method==='eth_call'?{result:word(1)}:reply(q),'NOT_ERC721']]){
  const fake=mockRPC(modify);await assert.rejects(createWalletInspector(fake)(address),{code});assert.ok(!fake.calls.some(q=>q.params[0]?.data?.startsWith('0x70a08231')));
 }
});
test('Malformed RPC, inputs, outages, rate limits, timeouts and reorgs never become ownership results',async()=>{
 for(const fetchImpl of [async()=>{throw Error('secret-provider-key')},async()=>new Response('',{status:429}),async()=>new Response('invalid'),async()=>{throw new DOMException('secret-timeout','TimeoutError')}])await assert.rejects(createWalletInspector({fetchImpl})(address),e=>e.code==='RPC_UNAVAILABLE'&&!e.message.includes('secret'));
 for(const modify of [()=>({result:null}),q=>q.method==='eth_getCode'?{result:'not-hex'}:reply(q),q=>q.method==='eth_call'?{result:'0x1'}:reply(q),q=>q.params[0]?.data?.startsWith('0x70a08231')?{result:'0xzz'}:reply(q),q=>q.method==='eth_getBlockByNumber'&&q.params[0]===block.number?{result:{...block,hash:'changed'}}:reply(q)])await assert.rejects(createWalletInspector(mockRPC(modify))(address));
 assert.throws(()=>createWalletInspector({rpcUrl:'http://unsafe.test'}));
 for(const input of ['',address.slice(1),[address],null,'0x'+'0'.repeat(40)])await assert.rejects(createWalletInspector({fetchImpl:()=>{throw Error('must not call')}})(input),{code:'INVALID_ADDRESS'});
 for(const tokenId of ['-1','0x1','1.5',1,(2n**256n).toString()])await assert.rejects(createWalletInspector({fetchImpl:()=>{throw Error('must not call')}})(address,tokenId),{code:'INVALID_TOKEN_ID'});
});
async function fixture({path=':memory:',inspect=createWalletInspector(mockRPC(reply))}={}) {
 const db=openDatabase(path);let time=Date.parse('2026-10-20T12:00:00Z');
 let app=createApplication({db,origin:'http://court.test',now:()=>new Date(time),walletInspector:inspect});
 async function call(path,body,actor,headers={}){const r=await app(new Request('http://court.test'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:'http://court.test',...(actor?{Cookie:actor.cookie,'X-CSRF-Token':actor.csrf}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}));return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const user=await call('/api/auth/register',{username:'wallet_test',password:'test-only-password-123'}),actor={cookie:user.cookie,csrf:user.data.csrf};
 const challenge=async(tokenId='476',a=actor)=>{const r=await call('/api/wallet/challenge',{address,chainId:143,tokenId},a);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const verify=async(c,a=actor,s=signer,message=c.message)=>call('/api/wallet/verify',{challengeId:c.challengeId,signature:await s.signMessage(message)},a);
 return {db,actor,call,challenge,verify,advance:s=>time+=s*1000,restart:()=>{app=createApplication({db,origin:'http://court.test',now:()=>new Date(time),walletInspector:inspect});}};
}
test('Domain/session/chain/address/token-bound challenge plus real signature grants only observed identity',async()=>{
 const f=await fixture();try{
  const c=await f.challenge();assert.match(c.message,/court.test wants you/);assert.match(c.message,/URI: http:\/\/court.test\nVersion: 1\nChain ID: 143/);assert.match(c.message,/Nonce: [a-f0-9]{48}/);assert.match(c.message,/urn:chogcourt:token:476/);assert.equal(Date.parse(c.expiresAt)-Date.parse('2026-10-20T12:00:00Z'),300000);
  const r=await f.verify(c);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.walletAuthenticated,true);assert.equal(r.data.ownershipVerified,true);assert.equal(r.data.eligible,false);assert.equal(r.data.tokenKey,`eip155:143:erc721:${NFT_COLLECTION}/476`);
  assert.equal(r.data.observation.source,'monad-rpc');assert.equal(f.db.prepare('SELECT count(*) n FROM tokens').get().n,1);assert.equal((await f.call('/api/profile',undefined,f.actor)).data.identity.tokenKey,r.data.tokenKey);
  assert.equal(f.db.prepare('SELECT count(*) n FROM claims').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM votes').get().n,0);
 }finally{f.db.close();}
});
test('Replay, another session, wrong signer, altered message and challenge expiration are rejected',async()=>{
 const f=await fixture();try{
  const login=await f.call('/api/auth/login',{username:'wallet_test',password:'test-only-password-123'}),a2={cookie:login.cookie,csrf:login.data.csrf};
  let c=await f.challenge();assert.equal((await f.verify(c,a2)).status,401);assert.equal((await f.verify(c)).status,200);assert.equal((await f.verify(c)).status,401);
  c=await f.challenge();assert.equal((await f.verify(c,f.actor,other)).status,401);assert.equal((await f.verify(c)).status,401);
  c=await f.challenge();assert.equal((await f.verify(c,f.actor,signer,c.message.replace('court.test','evil.test'))).status,401);
  c=await f.challenge();f.advance(300);assert.equal((await f.verify(c)).status,401);assert.equal((await f.call('/api/wallet/status',undefined,f.actor)).data.ownershipVerified,false);
 }finally{f.db.close();}
});
test('Auth, CSRF, origin, fields, chain and rate limits protect wallet endpoints',async()=>{
 const f=await fixture();try{
  const body={address,chainId:143};
  assert.equal((await f.call('/api/wallet/challenge',body)).status,401);assert.equal((await f.call('/api/wallet/challenge',body,f.actor,{'X-CSRF-Token':'bad'})).status,403);assert.equal((await f.call('/api/wallet/challenge',body,f.actor,{Origin:'https://bad.test'})).status,403);
  assert.equal((await f.call('/api/wallet/challenge',{...body,ownershipVerified:true},f.actor)).status,422);assert.equal((await f.call('/api/wallet/challenge',{...body,chainId:1},f.actor)).status,422);
  for(let i=0;i<6;i++){const r=await f.call('/api/wallet/inspect',{address},f.actor);assert.equal(r.status,200);assert.equal(r.data.walletAuthenticated,false);assert.equal(r.data.ownershipVerified,false);}
  assert.equal((await f.call('/api/wallet/inspect',{address},f.actor)).status,429);assert.equal(f.db.prepare('SELECT count(*) n FROM tokens').get().n,0);
 }finally{f.db.close();}
});
test('Nonholders authenticate without NFT identity; omitting token ID never fabricates one',async()=>{
 for(const holding of [false,true]){const f=await fixture({inspect:createWalletInspector(mockRPC(q=>q.params[0]?.data?.startsWith('0x70a08231')?{result:word(holding?2:0)}:reply(q)))});try{
  const r=await f.verify(await f.challenge(null));assert.equal(r.status,200);assert.equal(r.data.walletAuthenticated,true);assert.equal(r.data.ownershipVerified,holding);assert.equal(r.data.tokenKey,null);assert.equal(f.db.prepare('SELECT count(*) n FROM tokens').get().n,0);
 }finally{f.db.close();}}
});
test('Wrong token owner, nonexistent token and RPC failure do not save token identity',async()=>{
 for(const modify of [q=>q.params[0]?.data?.startsWith('0x6352211e')?{result:word(other.address)}:reply(q),q=>q.params[0]?.data?.startsWith('0x6352211e')?{error:{code:3}}:reply(q),()=>{throw Error('offline')}]){const f=await fixture({inspect:createWalletInspector(mockRPC(modify))});try{const r=await f.verify(await f.challenge());assert.ok([200,503].includes(r.status));assert.notEqual(r.data.ownershipVerified,true);assert.equal(f.db.prepare('SELECT count(*) n FROM tokens').get().n,0);}finally{f.db.close();}}
});
test('Recheck observes transfers and clears stale proof on RPC failure, preserving historical tokens',async()=>{
 let transferred=false,offline=false;const inspect=createWalletInspector(mockRPC(q=>{if(offline)throw Error('offline');return transferred&&q.params[0]?.data?.startsWith('0x6352211e')?{result:word(other.address)}:reply(q);}));
 const f=await fixture({inspect});try{
  await f.verify(await f.challenge());transferred=true;const r=await f.call('/api/wallet/recheck',{},f.actor);assert.equal(r.status,200);assert.equal(r.data.ownershipVerified,false);assert.equal(r.data.tokenKey,null);assert.equal(f.db.prepare('SELECT count(*) n FROM tokens').get().n,1);
  offline=true;assert.equal((await f.call('/api/wallet/recheck',{},f.actor)).status,503);const status=(await f.call('/api/wallet/status',undefined,f.actor)).data;assert.equal(status.ownershipVerified,false);assert.equal(status.observation,null);
 }finally{f.db.close();}
});
test('Disconnect/logout prevent late RPC completion from restoring authentication',async()=>{
 for(const route of ['/api/wallet/disconnect','/api/auth/logout']){let release;const f=await fixture({inspect:async(...args)=>{await new Promise(resolve=>release=resolve);return createWalletInspector(mockRPC(reply))(...args);}});try{
  const c=await f.challenge(),pending=f.verify(c);while(!release)await new Promise(resolve=>setImmediate(resolve));assert.equal((await f.call(route,{},f.actor)).status,200);release();assert.ok([401,409].includes((await pending).status));assert.equal(f.db.prepare('SELECT count(*) n FROM tokens').get().n,0);assert.equal((await f.call('/api/wallet/status',undefined,f.actor)).data.walletAuthenticated,false);
 }finally{f.db.close();}}
});
test('One-hour expiry, restart persistence and nonce replay protection',async()=>{
 const f=await fixture();try{
  const c=await f.challenge();assert.equal((await f.verify(c)).status,200);f.restart();assert.equal((await f.call('/api/wallet/status',undefined,f.actor)).data.walletAuthenticated,true);assert.equal((await f.verify(c)).status,401);f.advance(3600);assert.equal((await f.call('/api/wallet/status',undefined,f.actor)).data.walletAuthenticated,false);assert.equal((await f.call('/api/wallet/recheck',{},f.actor)).status,401);
 }finally{f.db.close();}
});
test('Migration 003 preserves populated v2 Daily Docket; proofs persist after SQLite reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'chog-wallet-test-')),path=join(dir,'court.sqlite');let db=new DatabaseSync(path);
 try{
  for(const name of ['001_initial.sql','002_daily_trials.sql'])db.exec(await readFile(new URL('../server/migrations/'+name,import.meta.url),'utf8'));
  db.exec("INSERT INTO users VALUES('u','prior','hash','salt','2026-01-01',1); INSERT INTO daily_trials(id,author_id,question,created_at) VALUES('prior-daily','u','An existing daily question?','2026-01-01');");
  const before=db.prepare('SELECT * FROM daily_trials').all();db.close();db=openDatabase(path);assert.deepEqual(db.prepare('SELECT * FROM daily_trials').all(),before);db.close();
  const f=await fixture({path});assert.equal((await f.verify(await f.challenge())).status,200);f.db.close();db=openDatabase(path);
  assert.deepEqual(db.prepare('SELECT * FROM daily_trials').all(),before);assert.equal(db.prepare('SELECT count(*) n FROM wallet_sessions WHERE authenticated_at IS NOT NULL').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM wallet_challenges').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM tokens').get().n,1);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
test('Vercel guard prevents build and startup before opening a database',()=>{
 for(const args of [['scripts/build.mjs'],['--input-type=module','-e','import {createServer} from "./server/index.mjs";createServer();']]){
  const r=spawnSync(process.execPath,args,{cwd:new URL('..',import.meta.url),env:{...process.env,VERCEL:'1'},encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/persistent Node\/Docker host|persistent disk/);
 }
});
