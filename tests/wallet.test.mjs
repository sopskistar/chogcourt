import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createWalletInspector,OWNER_COLLECTION_REFERENCE} from '../server/wallet.mjs';
import {createApplication} from '../server/app.mjs';
import {openDatabase} from '../server/database.mjs';

const address='0x'+'a'.repeat(40),block={number:'0x123',hash:'0x'+'b'.repeat(64)},word=n=>'0x'+n.toString(16).padStart(64,'0');
function mockRPC(reply) {
 const calls=[];
 return {calls,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://rpc.monad.xyz/');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
  const q=JSON.parse(options.body);calls.push(q);
  const value=await reply(q,calls.length);
  return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,...value}));
 }};
}
const chainReply=q=>({result:q.method==='eth_chainId'?'0x8f':q.method==='eth_getBlockByNumber'?block:q.method==='eth_getCode'?'0x1234':word(0)});
test('Real-RPC-compatible read-only diagnostic rejects supplied token interface; never reads ERC-20 balance as NFT proof',async()=>{
 const fake=mockRPC(q=>q.method==='eth_call'?{error:{code:3,message:'execution reverted'}}:chainReply(q));
 const r=await createWalletInspector(fake)(address);
 assert.equal(r.status,'NOT_ERC721');assert.equal(r.erc721Compatible,false);assert.equal(r.ownershipVerified,false);assert.equal(r.eligible,false);assert.equal(r.walletAuthenticated,false);assert.equal(r.contract,OWNER_COLLECTION_REFERENCE);assert.equal(r.blockHash,block.hash);
 assert.deepEqual(fake.calls.map(q=>q.method),['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call']);
 for(const q of fake.calls.filter(q=>q.method==='eth_call')){assert.equal(q.params[0].to,OWNER_COLLECTION_REFERENCE);assert.equal(q.params[1],block.number);assert.ok(q.params[0].data.startsWith('0x01ffc9a7'));}
});
test('Even ERC-721 interface support cannot override the official collection mismatch or grant eligibility',async()=>{
 const fake=mockRPC(q=>q.method==='eth_call'?{result:q.params[0].data.includes('ffffffff')?word(0):word(1)}:chainReply(q));
 const r=await createWalletInspector(fake)(address);
 assert.equal(r.status,'COLLECTION_IDENTITY_CONFLICT');assert.equal(r.collectionTrusted,false);assert.equal(r.ownershipVerified,false);assert.equal(r.eligible,false);assert.equal(fake.calls.length,6);
});
test('Wrong chain, missing contract and lying ERC-165 support fail closed',async()=>{
 let fake=mockRPC(()=>({result:'0x1'}));await assert.rejects(createWalletInspector(fake)(address),{code:'WRONG_RPC_NETWORK'});assert.equal(fake.calls.length,1);
 fake=mockRPC(q=>q.method==='eth_getCode'?{result:'0x'}:chainReply(q));assert.equal((await createWalletInspector(fake)(address)).status,'NO_CONTRACT');
 fake=mockRPC(q=>q.method==='eth_call'?{result:word(1)}:chainReply(q));assert.equal((await createWalletInspector(fake)(address)).status,'NOT_ERC721');
});
test('RPC outages, rate limits, malformed data and timeouts are unavailable, not a no-NFT result; secrets are not exposed',async()=>{
 for(const fetchImpl of [async()=>{throw Error('secret-provider-key')},async()=>new Response('',{status:429}),async()=>new Response('invalid'),async()=>{throw new DOMException('secret-timeout','TimeoutError')}]){
  await assert.rejects(createWalletInspector({fetchImpl})(address),e=>e.code==='RPC_UNAVAILABLE'&&!e.message.includes('secret'));
 }
 for(const reply of [()=>({result:null}),q=>q.method==='eth_chainId'?chainReply(q):{result:{number:'0x123'}}])await assert.rejects(createWalletInspector(mockRPC(reply))(address));
 await assert.rejects(createWalletInspector(mockRPC(q=>q.method==='eth_call'?{result:'0x1'}:chainReply(q)))(address),{code:'RPC_UNAVAILABLE'});
 assert.throws(()=>createWalletInspector({rpcUrl:'http://unsafe.test'}));
 for(const input of ['',address.slice(1),[address],null])await assert.rejects(createWalletInspector({fetchImpl:()=>{throw Error('must not call')}})(input),{code:'INVALID_ADDRESS'});
});
test('Inspector API enforces account, CSRF, origin, exact fields and rate limits without persisting identity',async()=>{
 const db=openDatabase(':memory:');let inspected=0;
 const app=createApplication({db,origin:'http://court.test',walletInspector:async a=>{inspected++;return {address:a,ownershipVerified:false,eligible:false,status:'NOT_ERC721'};}});
 async function call(path,body={},headers={}){const r=await app(new Request('http://court.test'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://court.test',...headers},body:JSON.stringify(body)}));return {r,data:await r.json()};}
 try{
  const auth=await call('/api/auth/register',{username:'wallet_test',password:'test-only-password-123'});
  const headers={Cookie:auth.r.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':auth.data.csrf};
  assert.equal((await call('/api/wallet/inspect',{address})).r.status,401);
  assert.equal((await call('/api/wallet/inspect',{address},{...headers,'X-CSRF-Token':'bad'})).r.status,403);
  assert.equal((await call('/api/wallet/inspect',{address},{...headers,Origin:'https://bad.test'})).r.status,403);
  assert.equal((await call('/api/wallet/inspect',{address,verified:true},headers)).r.status,422);
  assert.equal(inspected,0);
  for(let i=0;i<6;i++){const r=await call('/api/wallet/inspect',{address},headers);assert.equal(r.r.status,200);assert.equal(r.data.ownershipVerified,false);}
  assert.equal((await call('/api/wallet/inspect',{address},headers)).r.status,429);assert.equal(inspected,6);
  assert.equal(db.prepare('SELECT count(*) n FROM tokens').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM claims').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM votes').get().n,0);
 }finally{db.close();}
});
test('Vercel guard prevents static build and server startup before opening a database',()=>{
 for(const args of [['scripts/build.mjs'],['--input-type=module','-e','import {createServer} from "./server/index.mjs";createServer();']]){
  const r=spawnSync(process.execPath,args,{cwd:new URL('..',import.meta.url),env:{...process.env,VERCEL:'1'},encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/persistent Node\/Docker host|persistent disk/);
 }
});
