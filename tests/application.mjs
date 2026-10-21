import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from '../server/index.mjs';
import {openDatabase,openTemporaryDemoDatabase} from '../server/database.mjs';
import {launchBrowser,wait} from './browser-tools.mjs';
import {Wallet} from '../server/vendor/ethers-6.17.0.mjs';
import {NFT_COLLECTION} from '../server/wallet.mjs';

const artifacts=await fs.mkdtemp(join(tmpdir(),'chog-app-')),checks=[],errors=[];
const db=openDatabase(join(artifacts,'court.sqlite'));let time=Date.now(),runner,browser,base,failure=null;
// Labelled RPC fixtures only; no real wallet or NFT ownership is simulated as
// production verification. Existing court tests never need external RPC access.
let walletFailure=false,walletDelay=false,releaseWallet,walletHolding=true;const walletChecks=[],browserSigner=Wallet.createRandom();
async function walletInspector(address,tokenId=null){walletChecks.push(address);if(walletDelay)await new Promise(resolve=>releaseWallet=resolve);if(walletFailure)throw Object.assign(Error('Monad RPC is unavailable. Ownership was not verified.'),{status:503,code:'RPC_UNAVAILABLE'});if(address.toLowerCase()===browserSigner.address.toLowerCase())return {address:address.toLowerCase(),contract:NFT_COLLECTION,chainId:143,blockNumber:'0x123',blockHash:'0x'+'b'.repeat(64),tokenId,balance:walletHolding?'1':'0',holder:walletHolding,ownsToken:walletHolding&&tokenId==='476',status:walletHolding?'HOLDER':'NOT_HOLDER',ownershipVerified:false,walletAuthenticated:false,eligible:false,message:walletHolding?'Chog Genesis ownership read succeeded.':'No Chog Genesis NFT is held by this wallet at the observed block.'};return {status:'NOT_ERC721',ownershipVerified:false,eligible:false,blockNumber:'0x123',message:'The supplied contract did not pass the ERC-721 checks. NFT jury access remains unavailable.'};}
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function input(p,selector,value){await p.js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function open(p,view,id){await p.js(`(()=>{const a=document.createElement('a');a.href=${JSON.stringify('#'+view)};${id?`a.dataset.openCase=${JSON.stringify(id)};`:''}document.body.appendChild(a);a.click();a.remove();})()`);await p.until(`document.querySelector('dialog').open && !document.querySelector('#dialog-body').textContent.includes('Opening the shared court')`);assert.equal(await p.js(`!!document.querySelector('#dialog-body > .api-error')`),false,await p.js(`document.querySelector('#dialog-body').textContent`));}
async function readyPage(){const p=await browser.newPage();p.handlers.push(d=>{if(d.method==='Runtime.exceptionThrown')errors.push(d.params);});await p.call('Page.navigate',{url:base});await p.until(`document.documentElement?.dataset.entrance==='done'`);await p.js(`document.fonts.ready.then(()=>true)`);return p;}
async function reload(p){await p.js(`window.__beforeTestReload=true`);await p.call('Page.reload');await p.until(`!window.__beforeTestReload && document.documentElement?.dataset.entrance==='done'`);await p.js(`document.fonts.ready.then(()=>true)`);}
async function register(p,name){await open(p,'account');await input(p,'[name="username"]',name);await input(p,'[name="password"]','browser-test-password-123');await p.js(`document.querySelector('[value="register"]').click()`);await p.until(`!!document.querySelector('#shared-case-list')`);}
async function screenshot(p,name){const r=await p.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(join(artifacts,name+'.png'),Buffer.from(r.data,'base64'));}
// Resizing queues fit() in requestAnimationFrame. A fixed delay can still inspect
// the previous scale in background contexts; wait for the actual layout inputs.
async function resize(p,width,height) {
 await p.call('Page.bringToFront');
 await p.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
 try {await p.until(`(()=>{const h=document.documentElement,c=getComputedStyle(h),w=h.clientWidth,v=innerHeight,s=w/v>1280/800?v/800:w/1280;return innerWidth===${width}&&innerHeight===${height}&&h.classList.contains(c.getPropertyValue('--mode').trim())&&Math.abs(Number(h.style.getPropertyValue('--s'))-s)<1e-7})()`);}
 catch(error){throw Error(error.message+' Layout: '+JSON.stringify(await p.js(`({width:innerWidth,height:innerHeight,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,mode:getComputedStyle(document.documentElement).getPropertyValue('--mode'),classes:document.documentElement.className,scale:document.documentElement.style.getPropertyValue('--s'),visibility:document.visibilityState})`)));}
}
// CDP Enter needs its text payload to generate keypress/native button activation.
async function key(p,key,code=key,windowsVirtualKeyCode=key==='Enter'?13:27){await p.call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,...(key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await p.call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});}
async function decodeImages(p,selector){
 // Visit every lazy image as a user would. decode() alone does not initiate a
 // lazy request for off-screen art. Fail on bad/missing images, with diagnostics.
 const count=await p.js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
 for(let i=0;i<count;i++){
  const target=`document.querySelectorAll(${JSON.stringify(selector)})[${i}]`;
  await p.js(`${target}.scrollIntoView({block:'center',behavior:'instant'})`);
  await p.until(`${target}.complete && ${target}.naturalWidth>0`);
  try{await p.js(`${target}.decode()`);}catch(error){throw Error(`${error.message}\nImage state: ${JSON.stringify(await p.js(`(()=>{const i=${target};return {src:i.currentSrc,complete:i.complete,w:i.naturalWidth,h:i.naturalHeight,connected:i.isConnected}})()`))}`);}
 }
}
const contrastCheck=`(()=>{const luminance=c=>{const a=c.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*a[0]+.7152*a[1]+.0722*a[2]};return [...document.querySelectorAll('.dialog-intro,.field input,.action:not(:disabled),.api-error,.status-tag,.verdict-stamp')].filter(e=>e.getClientRects().length).map(e=>{let bg=getComputedStyle(e).backgroundColor,p=e;while(bg==='rgba(0, 0, 0, 0)'&&p.parentElement){p=p.parentElement;bg=getComputedStyle(p).backgroundColor}const a=luminance(getComputedStyle(e).color),b=luminance(bg);return {element:e.className,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}})})()`;
try {
 runner=createServer({db,port:0,now:()=>new Date(time),evidenceSeconds:3600,votingSeconds:3600,walletInspector});await new Promise((yes,no)=>{runner.server.once('error',no);runner.server.listen(0,'127.0.0.1',yes);});base=`http://127.0.0.1:${runner.server.address().port}`;
 browser=await launchBrowser(artifacts);console.log('Available cached browsers:',browser.installed.join(', '));
 const plaintiff=await readyPage(),defendant=await readyPage(),juror=await readyPage();let caseId;
 await check('HTTP health, static images, server injection and private-file protection',async()=>{
  assert.equal((await(await fetch(base+'/api/health')).json()).ok,true);
  for(const path of ['/.env','/server/app.mjs','/data/chogcourt.sqlite','/package.json'])assert.equal((await fetch(base+path)).status,404);
  assert.equal(await plaintiff.js(`document.documentElement.hasAttribute('data-shared-court')`),true);
  for(const file of ['chog-court-logo.png','chog-court-judge.png','chog-official-pfp.png','verdict-machine.png','jury-streaks-daily-docket.png','chog-reputation-card.png','chog-case-of-the-day.png']){const r=await fetch(base+'/assets/images/'+file);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
 });
 await check('Hero scale tracks scrollbar width changes without a window resize',async()=>{
  await resize(plaintiff,1280,800);
  const original=await plaintiff.js(`document.documentElement.style.overflowY`);
  try {
   for(const overflow of ['hidden','scroll','hidden']){
    await plaintiff.js(`document.documentElement.style.overflowY=${JSON.stringify(overflow)}`);
    await plaintiff.until(`Math.abs(Number(document.documentElement.style.getPropertyValue('--s'))-document.documentElement.clientWidth/1280)<1e-7`);
    assert.equal(await plaintiff.js(`innerWidth`),1280);
   }
  } finally {await plaintiff.js(`document.documentElement.style.overflowY=${JSON.stringify(original)}`);}
 });
 await check('Independent browser sessions register and authenticate separate shared accounts',async()=>{await register(plaintiff,'plaintiff_browser');await register(defendant,'defendant_browser');await register(juror,'juror_browser');assert.ok((await plaintiff.js(`document.querySelector('.live-bar').textContent`)).includes('plaintiff_browser'));assert.ok((await defendant.js(`document.querySelector('.live-bar').textContent`)).includes('defendant_browser'));});
 await check('Case filing explains the defendant registration prerequisite and waits through a 13-second API response',async()=>{
  await open(plaintiff,'file-a-case');
  const form=await plaintiff.js(`document.querySelector('#shared-case-form').textContent`);
  assert.ok(form.includes('ask them to register from Court account and send you their exact username'));
  await input(plaintiff,'[name="title"]','Can the clerk keep the purple gavel?');
  await plaintiff.js(`document.querySelector('[name="category"]').value='Community'`);
  await input(plaintiff,'[name="defendant"]','defendant_browser');
  await input(plaintiff,'[name="argument"]','The clerk moved the gavel without recording its location in the docket.');
  await plaintiff.call('Page.bringToFront');
  await plaintiff.js(`window.slowCaseFetch=window.fetch;window.slowCaseStarted=false;window.fetch=(url,options)=>{
   if(new URL(url,location.href).pathname==='/api/claims'&&options?.method==='POST'){window.slowCaseStarted=true;return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>resolve(new Response(JSON.stringify({error:{code:'TEST_DELAY',message:'Delayed test response received.'}}),{status:503})),13000);
    options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(options.signal.reason)},{once:true});
   });}
   return window.slowCaseFetch(url,options);
  };document.querySelector('#shared-case-form').requestSubmit()`);
  try{
   await plaintiff.until(`window.slowCaseStarted`,3000);
   let completed=false;
   for(let i=0;i<320&&!completed;i++){completed=await plaintiff.js(`document.querySelector('#shared-case-form .api-error')?.textContent.includes('Delayed test response received')`);if(!completed)await wait(50);}
   assert.equal(completed,true,'the delayed API response should arrive before the 30-second client timeout');
  }catch(error){throw Error(error.message+' Browser state: '+JSON.stringify(await plaintiff.js(`({started:window.slowCaseStarted,valid:document.querySelector('#shared-case-form')?.checkValidity(),values:document.querySelector('#shared-case-form')?Object.fromEntries(new FormData(document.querySelector('#shared-case-form'))):null,error:document.querySelector('#shared-case-form .api-error')?.textContent})`)));}
  finally{await plaintiff.js(`window.fetch=window.slowCaseFetch;delete window.slowCaseFetch;delete window.slowCaseStarted`);}
 });
 await check('New account shows real empty daily, verdict and reputation states without invented activity',async()=>{
  await open(plaintiff,'daily');assert.ok((await plaintiff.js(`document.querySelector('#daily-current').textContent`)).includes('No daily question yet'));
  await open(plaintiff,'verdict');assert.ok((await plaintiff.js(`document.querySelector('#shared-case-list').textContent`)).includes('No finalized cases'));assert.equal(await plaintiff.js(`!!document.querySelector('[data-live-verdict]')`),false);
  await open(plaintiff,'reputation');assert.equal(await plaintiff.js(`document.querySelector('.stat strong').textContent`),'0');assert.equal(await plaintiff.js(`document.querySelectorAll('.badge[data-earned="true"]').length`),0);
  assert.ok((await plaintiff.js(`document.querySelector('#dialog-body').textContent`)).includes('No daily participation yet'));assert.ok((await plaintiff.js(`document.querySelector('#dialog-body').textContent`)).includes('No case history yet'));
 });
 await check('Missing Daily route and incomplete responses show actionable errors, not fabricated empty records, and retry recovers',async()=>{
  await plaintiff.js(`window.dailyTestFetch=window.fetch;window.dailyTestMode='legacy';window.fetch=async(...args)=>{if(new URL(args[0],location.href).pathname==='/api/daily')return window.dailyTestMode==='legacy'?new Response(JSON.stringify({error:{code:'NOT_FOUND',message:'API route not found.'}}),{status:404}):new Response(JSON.stringify({config:null,previous:null}));return window.dailyTestFetch(...args);}`);
  try{
   await plaintiff.js(`document.querySelector('#menu-panel a[href="#daily"]').click()`);
   await plaintiff.until(`document.querySelector('.api-error')?.textContent.includes('GET /api/daily returned 404')`);
   assert.ok((await plaintiff.js(`document.querySelector('.api-error').textContent`)).includes('Restart or update'));assert.equal(await plaintiff.js(`!!document.querySelector('#daily-current,[data-daily-result]')`),false);
   await plaintiff.js(`window.dailyTestMode='incomplete';document.querySelector('[data-shared-refresh]').click()`);
   await plaintiff.until(`document.querySelector('.api-error')?.textContent.includes('Daily Docket data is incomplete')`);
  }finally{await plaintiff.js(`window.fetch=window.dailyTestFetch;delete window.dailyTestFetch;delete window.dailyTestMode;`);}
  await plaintiff.js(`document.querySelector('[data-shared-refresh]').click()`);await plaintiff.until(`!!document.querySelector('#daily-current')`);
 });
 await check('Wallet UI handles missing provider and rejection; injected test wallet connects without signing',async()=>{
  await open(juror,'account');await juror.js(`document.querySelector('[data-wallet="connect"]').click()`);await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('No browser wallet')`);
  await juror.js(`window.walletFixture={address:'0x'+'a'.repeat(40),chain:'0x1',reject:true,calls:[],handlers:{}};window.ethereum={request:async q=>{const w=window.walletFixture;w.calls.push(q);if(q.method==='eth_requestAccounts'){if(w.reject)throw {code:4001};return [w.address]}if(q.method==='eth_accounts')return w.address?[w.address]:[];if(q.method==='eth_chainId')return w.chain;if(q.method==='wallet_switchEthereumChain'){w.chain=q.params[0].chainId;return null}throw Error('Forbidden or unexpected wallet method')},on:(e,f)=>window.walletFixture.handlers[e]=f,removeListener:(e,f)=>{if(window.walletFixture.handlers[e]===f)delete window.walletFixture.handlers[e]}};document.querySelector('[data-wallet="connect"]').click()`);
  await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('rejected')`);assert.equal(walletChecks.length,0);
  await juror.js(`window.walletFixture.reject=false;document.querySelector('[data-wallet="connect"]').focus()`);await key(juror,'Enter');await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('Wrong network')`);
  assert.equal(await juror.js(`document.querySelector('[data-wallet-address]').textContent`),'0x'+'a'.repeat(40));assert.equal(walletChecks.length,0);
  await juror.js(`document.querySelector('[data-wallet="switch"]').click()`);await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('ERC-721')`);assert.equal(walletChecks.length,1);
  assert.ok((await juror.js(`document.querySelector('#wallet-panel').textContent`)).includes('NFT ownership: not verified'));
 });
 await check('Wallet account/network changes recheck; RPC failures and empty accounts never grant NFT eligibility',async()=>{
  walletFailure=true;await juror.js(`window.walletFixture.address='0x'+'b'.repeat(40);window.walletFixture.handlers.accountsChanged([window.walletFixture.address])`);await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('RPC is unavailable')`);assert.equal(walletChecks.at(-1),'0x'+'b'.repeat(40));
  walletFailure=false;const count=walletChecks.length;await juror.js(`window.walletFixture.chain='0x1';window.walletFixture.handlers.chainChanged('0x1')`);await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('Wrong network')`);assert.equal(walletChecks.length,count);
  await juror.js(`window.walletFixture.chain='0x8f';window.walletFixture.handlers.chainChanged('0x8f')`);await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('ERC-721')`);assert.equal(walletChecks.length,count+1);
  await juror.js(`window.walletFixture.address=null;window.walletFixture.handlers.accountsChanged([])`);await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('No account')`);assert.equal(await juror.js(`document.querySelector('[data-wallet-address]').textContent`),'No wallet connected');
  assert.equal(db.prepare('SELECT count(*) n FROM tokens').get().n,0);
 });
 await check('Disconnect discards an in-flight check; provider disconnect and reload clear connection without changing court session',async()=>{
  walletDelay=true;await juror.js(`window.walletFixture.address='0x'+'c'.repeat(40);document.querySelector('[data-wallet="connect"]').click()`);
  for(let i=0;i<100&&!releaseWallet;i++)await wait(25);assert.equal(typeof releaseWallet,'function');await juror.js(`document.querySelector('[data-wallet="disconnect"]').click()`);releaseWallet();walletDelay=false;await wait(100);
  assert.equal(await juror.js(`document.querySelector('[data-wallet-address]').textContent`),'No wallet connected');assert.ok((await juror.js(`document.querySelector('[data-wallet-status]').textContent`)).includes('Disconnected from this page'));
  await juror.js(`document.querySelector('[data-wallet="connect"]').click()`);await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('ERC-721')`);await juror.js(`window.walletFixture.handlers.disconnect({code:4900})`);await juror.until(`document.querySelector('[data-wallet-status]').textContent.includes('Wallet disconnected')`);
  assert.ok((await juror.js(`window.walletFixture.calls.map(q=>q.method)`)).every(m=>['eth_requestAccounts','eth_accounts','eth_chainId','wallet_switchEthereumChain'].includes(m)));
  await reload(juror);await open(juror,'account');assert.equal(await juror.js(`document.querySelector('[data-wallet-address]').textContent`),'No wallet connected');assert.ok((await juror.js(`document.querySelector('.live-bar').textContent`)).includes('juror_browser'));
 });
 await check('Signed-wallet flow verifies a token using real signatures and labelled RPC fixtures, handles rejection/transfer/offline, and revokes on chain change',async()=>{
  const holder=await readyPage();await register(holder,'nft_identity_browser');await open(holder,'account');
  await holder.call('Runtime.addBinding',{name:'signTestMessage'});
  holder.handlers.push(d=>{if(d.method==='Runtime.bindingCalled'&&d.params.name==='signTestMessage')browserSigner.signMessage(Buffer.from(JSON.parse(d.params.payload).hex.slice(2),'hex')).then(signature=>holder.js(`window.walletFixture.resolve(${JSON.stringify(signature)})`)).catch(e=>errors.push({testSigningError:e.message}));});
  await holder.js(`window.walletFixture={address:${JSON.stringify(browserSigner.address)},chain:'0x8f',reject:true,calls:[],handlers:{}};window.ethereum={request:async q=>{const w=window.walletFixture;w.calls.push(q);if(q.method==='eth_requestAccounts'||q.method==='eth_accounts')return [w.address];if(q.method==='eth_chainId')return w.chain;if(q.method==='personal_sign'){if(w.reject)throw {code:4001};return new Promise(resolve=>{w.resolve=resolve;window.signTestMessage(JSON.stringify({hex:q.params[0]}))})}throw Error('Forbidden wallet method')},on:(e,f)=>window.walletFixture.handlers[e]=f,removeListener:(e,f)=>{if(window.walletFixture.handlers[e]===f)delete window.walletFixture.handlers[e]}};document.querySelector('[data-wallet="connect"]').click()`);
  await holder.until(`document.querySelector('[data-wallet="verify"]') && !document.querySelector('[data-wallet="verify"]').disabled`);
  await input(holder,'[data-wallet-token]','476');await holder.js(`document.querySelector('[data-wallet="verify"]').click()`);await holder.until(`document.querySelector('[data-wallet-status]').textContent.includes('rejected')`);
  assert.ok((await holder.js(`document.querySelector('[data-wallet-proof]').textContent`)).includes('not verified'));
  await holder.js(`window.walletFixture.reject=false;document.querySelector('[data-wallet="verify"]').click()`);await holder.until(`document.querySelector('[data-wallet-proof]').textContent.includes('verified at the recorded block')`);
  assert.ok((await holder.js(`document.querySelector('#wallet-panel').textContent`)).includes('eip155:143:erc721:'+NFT_COLLECTION+'/476'));
  for(const theme of ['light','purple']){await resize(holder,390,844);await holder.js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);assert.equal(await holder.js(`document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth+1`),true);for(const c of await holder.js(contrastCheck))assert.ok(c.ratio>=4.5,JSON.stringify(c));}
  await open(holder,'reputation');assert.ok((await holder.js(`document.querySelector('#dialog-body').textContent`)).includes('verified token observation'));await open(holder,'account');
  walletHolding=false;await holder.js(`document.querySelector('[data-wallet="inspect"]').click()`);await holder.until(`document.querySelector('[data-wallet-status]').textContent.includes('No Chog Genesis')`);assert.ok((await holder.js(`document.querySelector('[data-wallet-proof]').textContent`)).includes('not verified'));
  walletFailure=true;await holder.js(`document.querySelector('[data-wallet="inspect"]').click()`);await holder.until(`document.querySelector('[data-wallet-status]').textContent.includes('RPC is unavailable')`);assert.equal(await holder.js(`fetch('/api/wallet/status').then(r=>r.json()).then(r=>r.ownershipVerified)`),false);walletFailure=false;walletHolding=true;
  await holder.js(`document.querySelector('[data-wallet="verify"]').click()`);await holder.until(`document.querySelector('[data-wallet-proof]').textContent.includes('verified at the recorded block')`);
  await holder.js(`window.walletFixture.chain='0x1';window.walletFixture.handlers.chainChanged('0x1')`);await holder.until(`document.querySelector('[data-wallet-status]').textContent.includes('Wrong network')`);assert.equal(await holder.js(`fetch('/api/wallet/status').then(r=>r.json()).then(r=>r.walletAuthenticated)`),false);
  assert.ok((await holder.js(`window.walletFixture.calls.map(q=>q.method)`)).every(m=>['eth_requestAccounts','eth_accounts','eth_chainId','personal_sign'].includes(m)));
  await holder.js(`document.querySelector('[data-wallet="disconnect"]').click()`);
 });
 await check('Wallet panel fits light/purple desktop and mobile, with readable controls and keyboard focus',async()=>{
  for(const [w,h]of [[1440,900],[390,844]])for(const theme of ['light','purple']){
   await resize(juror,w,h);await juror.js(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await open(juror,'account');
   assert.equal(await juror.js(`(()=>{const d=document.querySelector('dialog');return d.scrollWidth<=d.clientWidth+1})()`),true);
   for(const c of await juror.js(contrastCheck))assert.ok(c.ratio>=4.5,JSON.stringify(c));
   await juror.js(`document.querySelector('[data-wallet="connect"]').focus()`);assert.equal(await juror.js(`document.activeElement.dataset.wallet`),'connect');
  }
  await resize(juror,1280,800);await juror.js(`document.documentElement.dataset.theme='light'`);
 });
 await check('Primary CTA files a shared case visible to another browser',async()=>{
  await open(plaintiff,'file-a-case');await input(plaintiff,'[name="title"]','Did the Chog leave the gavel in the gallery?');await input(plaintiff,'[name="defendant"]','defendant_browser');await input(plaintiff,'[name="argument"]','The gallery camera shows a purple figure beside the court desk. We need both sides of the story.');await plaintiff.js(`document.querySelector('#shared-case-form').requestSubmit()`);await plaintiff.until(`!!document.querySelector('[data-shared-ready]')`);
  caseId=await plaintiff.js(`(async()=>{const r=await fetch('/api/claims');return (await r.json()).cases[0].id})()`);await open(defendant,'case',caseId);assert.ok((await defendant.js(`document.querySelector('#dialog-body').textContent`)).includes('Did the Chog leave the gavel'));assert.equal(await defendant.js(`!!document.querySelector('.verdict-stamp')`),false);
 });
 await check('Evidence hashing, duplicate errors, defendant response and bilateral phase transition work through forms',async()=>{
  await input(plaintiff,'[data-api-form="evidence"] [name="label"]','Gallery testimony');await input(plaintiff,'[data-api-form="evidence"] [name="text"]','The gallery attendant saw the gavel returned to the court desk.');await plaintiff.js(`document.querySelector('[data-api-form="evidence"]').requestSubmit()`);await plaintiff.until(`!!document.querySelector('.evidence-hash')`);assert.match(await plaintiff.js(`document.querySelector('.evidence-hash').textContent`),/SHA-256: [a-f0-9]{64}/);
  await input(plaintiff,'[data-api-form="evidence"] [name="label"]','Duplicate testimony');await input(plaintiff,'[data-api-form="evidence"] [name="text"]','The gallery attendant saw the gavel returned to the court desk.');await plaintiff.js(`document.querySelector('[data-api-form="evidence"]').requestSubmit()`);await plaintiff.until(`!!document.querySelector('[data-api-form="evidence"] .api-error')`);assert.ok((await plaintiff.js(`document.querySelector('.api-error').textContent`)).includes('already'));
  await input(defendant,'[data-api-form="response"] [name="body"]','I returned the gavel to the desk before the hearing began, as the attendant confirms.');await defendant.js(`document.querySelector('[data-api-form="response"]').requestSubmit()`);await defendant.until(`!document.querySelector('[data-api-form="response"]') && !!document.querySelector('[data-shared-ready]')`);
  await plaintiff.js(`document.querySelector('[data-shared-ready]').click()`);await plaintiff.until(`!document.querySelector('[data-shared-ready]')`);await defendant.js(`document.querySelector('[data-shared-ready]').click()`);await defendant.until(`document.querySelector('#dialog-body').textContent.includes('Case parties cannot serve')`);
  assert.equal(await defendant.js(`document.querySelectorAll('[data-shared-vote]').length`),0);
 });
 await check('Eligible jury votes once; true activity appears in reputation and daily docket',async()=>{
  await open(juror,'case',caseId);await juror.js(`document.querySelector('[data-shared-vote="INNOCENT"]').click()`);await juror.until(`document.querySelector('#dialog-body').textContent.includes('Your recorded vote: INNOCENT')`);assert.equal(await juror.js(`document.querySelectorAll('[data-shared-vote]').length`),0);
  await open(juror,'reputation');assert.equal(await juror.js(`document.querySelector('.stat strong').textContent`),'1');assert.equal(await juror.js(`document.querySelectorAll('.badge[data-earned="true"]').length`),1);await open(juror,'daily');assert.ok((await juror.js(`document.querySelector('#dialog-body').textContent`)).includes('Did the Chog leave the gavel'));
 });
 await check('Reputation preserves real records with legacy history omissions and handles loading, partial, null and failed API responses',async()=>{
  await juror.js(`window.profileTestFetch=window.fetch;window.profileTestMode='loading';window.fetch=async(...args)=>{
   const response=await window.profileTestFetch(...args);if(new URL(args[0],location.href).pathname!=='/api/profile')return response;
   if(window.profileTestMode==='loading')await new Promise(resolve=>window.releaseProfileTest=resolve);
   const data=await response.json();
   if(window.profileTestMode==='legacy'){delete data.dailyHistory;data.identity={verified:false,tokenKey:null};}
   if(window.profileTestMode==='partial'){data.dailyHistory=null;data.stats=null;data.cases=null;delete data.identity;}
   if(window.profileTestMode==='null')return new Response('null');
   if(window.profileTestMode==='error')return new Response(JSON.stringify({error:{code:'TEST_OUTAGE',message:'Profile temporarily unavailable (test fixture).'}}),{status:503});
   return new Response(JSON.stringify(data),{status:response.status});
  };document.querySelector('#menu-panel a[href="#reputation"]').click()`);
  try{
   await juror.until(`!!window.releaseProfileTest`);assert.ok((await juror.js(`document.querySelector('#dialog-body [role="status"]').textContent`)).includes('Opening the shared court'));assert.equal(await juror.js(`!!document.querySelector('.stat')`),false);
   await juror.js(`window.profileTestMode='legacy';window.releaseProfileTest()`);
   await juror.until(`!!document.querySelector('[data-profile-unavailable]')`);
   assert.ok((await juror.js(`document.querySelector('[data-profile-unavailable]').textContent`)).includes('Daily Docket history'));
   assert.equal(await juror.js(`document.querySelector('.stat strong').textContent`),'1');
   assert.equal(await juror.js(`document.querySelectorAll('.badge[data-earned="true"]').length`),1);
   assert.equal(await juror.js(`document.querySelector('[data-shared-case]').dataset.sharedCase`),caseId);
   assert.ok(!(await juror.js(`document.querySelector('#dialog-body').textContent`)).includes('No daily participation yet'));
   await juror.js(`window.profileTestMode='partial';document.querySelector('[data-shared-refresh]').click()`);
   await juror.until(`document.querySelectorAll('[data-profile-unavailable]').length===4`);
   assert.equal(await juror.js(`!!document.querySelector('.stat,.badge,[data-shared-case]')`),false);
   assert.ok((await juror.js(`document.querySelector('#dialog-body').textContent`)).includes('Score unavailable'));
   await juror.js(`window.profileTestMode='null';document.querySelector('[data-shared-refresh]').click()`);
   await juror.until(`document.querySelector('.api-error')?.textContent.includes('invalid response')`);
   await juror.js(`window.profileTestMode='error';document.querySelector('[data-shared-refresh]').click()`);
   await juror.until(`document.querySelector('.api-error')?.textContent.includes('Profile temporarily unavailable')`);
   assert.equal(await juror.js(`!!document.querySelector('.stat')`),false);
  }finally{await juror.js(`window.releaseProfileTest?.();window.fetch=window.profileTestFetch;delete window.profileTestFetch;delete window.profileTestMode;delete window.releaseProfileTest;`);}
  await juror.js(`document.querySelector('[data-shared-refresh]').click()`);await juror.until(`!!document.querySelector('.stat')`);
  assert.equal(await juror.js(`document.querySelector('.stat strong').textContent`),'1');assert.equal(await juror.js(`!!document.querySelector('[data-profile-unavailable]')`),false);
 });
 await check('Additional separate jurors finalize a real stored outcome only after the deadline',async()=>{
  for(const name of ['second_juror','third_juror']){const p=await readyPage();await register(p,name);await open(p,'case',caseId);await p.js(`document.querySelector('[data-shared-vote="INNOCENT"]').click()`);await p.until(`document.querySelector('#dialog-body').textContent.includes('Your recorded vote')`);}
  await open(plaintiff,'verdict',caseId);assert.equal(await plaintiff.js(`!!document.querySelector('.verdict-stamp')`),false);time+=3601000;await open(plaintiff,'case',caseId);assert.equal(await plaintiff.js(`document.querySelector('.verdict-stamp').textContent`),'INNOCENT');assert.ok((await plaintiff.js(`document.querySelector('[data-live-verdict]').textContent`)).includes('3 server-accepted'));
  await screenshot(plaintiff,'shared-verdict');
 });
 await check('Shared verdict download and copy-link fallback identify the finalized off-chain record',async()=>{
  await plaintiff.js(`document.querySelector('[data-shared-export]').click()`);const path=join(artifacts,`chog-court-${caseId}-OFFCHAIN.svg`);let svg;
  for(let i=0;i<100;i++){try{svg=await fs.readFile(path,'utf8');break;}catch{await wait(50);}}
  assert.ok(svg?.includes('INNOCENT')&&svg.includes('SHARED OFF-CHAIN RECORD')&&svg.includes('data:font/woff2;base64,'));
  assert.equal(await plaintiff.js(`new DOMParser().parseFromString(${JSON.stringify(svg)},'image/svg+xml').querySelector('parsererror')===null`),true);
  await plaintiff.js(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('denied'))}});document.querySelector('[data-shared-copy]').click()`);await plaintiff.until(`!!document.querySelector('.api-error')`);assert.ok((await plaintiff.js(`document.querySelector('.api-error').textContent`)).includes('#case/'+caseId));
 });
 await check('Finalized case appears consistently in docket, verdict listings, Verdict Machine and participant reputation',async()=>{
  for(const view of ['docket','rulings','reputation']){
   await open(juror,view);
   assert.equal(await juror.js(`document.querySelector('[data-shared-case="${caseId}"]').dataset.sharedCase`),caseId);
   assert.ok((await juror.js(`document.querySelector('[data-shared-case="${caseId}"]').textContent`)).includes('Finalized: INNOCENT'));
  }
  await open(juror,'verdict',caseId);assert.equal(await juror.js(`document.querySelector('[data-live-verdict] .verdict-stamp').textContent`),'INNOCENT');
 });
 await check('Refresh and a new login retain case history and actual participation',async()=>{
  await juror.call('Page.navigate',{url:base+'/#case/'+caseId});await juror.until(`!!document.querySelector('[data-live-verdict]')`);await reload(juror);await juror.until(`!!document.querySelector('[data-live-verdict]')`);assert.equal(await juror.js(`document.querySelector('.verdict-stamp').textContent`),'INNOCENT');
  const fresh=await readyPage();await open(fresh,'account');await input(fresh,'[name="username"]','juror_browser');await input(fresh,'[name="password"]','browser-test-password-123');await fresh.js(`document.querySelector('[value="login"]').click()`);await fresh.until(`!!document.querySelector('#shared-case-list')`);await open(fresh,'reputation');assert.equal(await fresh.js(`document.querySelector('.stat strong').textContent`),'1');
 });
 let dailyId,nextDailyId;
 await check('Daily question submission is shared, escaped, immutable and queues the next question',async()=>{
  await open(plaintiff,'daily');await plaintiff.js(`document.querySelector('#daily-submit-panel').open=true`);
  await input(plaintiff,'[name="question"]','Should <img src=x onerror=alert(1)> wear a tiny wig?');await input(plaintiff,'[name="choice1"]','Purple wig');await input(plaintiff,'[name="choice2"]','Golden crown');
  await plaintiff.js(`document.querySelector('[data-api-form="daily-submit"]').requestSubmit()`);await plaintiff.until(`!!document.querySelector('#daily-current [data-daily-trial]')`);
  dailyId=await plaintiff.js(`document.querySelector('#daily-current [data-daily-trial]').dataset.dailyTrial`);
  assert.equal(await plaintiff.js(`document.querySelector('#daily-current h3 img')`),null);assert.equal(await plaintiff.js(`!!document.querySelector('[data-api-form="daily-vote"]')`),false);
  await plaintiff.js(`document.querySelector('#daily-submit-panel').open=true`);await input(plaintiff,'[name="question"]','Which Chog snack should the next courtroom serve?');await input(plaintiff,'[name="choice1"]','Tiny purple cupcakes');await input(plaintiff,'[name="choice2"]','Golden popcorn');
  await plaintiff.js(`document.querySelector('[data-api-form="daily-submit"]').requestSubmit()`);await plaintiff.until(`!document.querySelector('[data-api-form="daily-submit"]') && document.querySelector('#dialog-body').textContent.includes('Your question is waiting')`);
  nextDailyId=await plaintiff.js(`(async()=>{const r=await fetch('/api/daily');return (await r.json()).next.id})()`);
  await open(defendant,'daily');assert.equal(await defendant.js(`document.querySelector('#daily-current [data-daily-trial]').dataset.dailyTrial`),dailyId);assert.equal(await defendant.js(`!!document.querySelector('#daily-current [data-daily-result]')`),false);
 });
 await check('Separate daily voters use keyboard controls; duplicate votes fail and jury scores stay unchanged',async()=>{
  for(const p of [defendant,juror]){
   await open(p,'daily');await p.js(`document.querySelector('[name="choice"][value="0"]').focus()`);await key(p,' ','Space',32);
   assert.equal(await p.js(`document.querySelector('[name="choice"][value="0"]').checked`),true);
   await p.js(`document.querySelector('[data-api-form="daily-vote"] button').focus()`);await key(p,'Enter');await p.until(`!!document.querySelector('#daily-current [data-daily-recorded]')`);
   assert.equal(await p.js(`!!document.querySelector('[data-api-form="daily-vote"]')`),false);
   assert.equal(await p.js(`(async()=>{const a=await(await fetch('/api/auth/me')).json();const r=await fetch('/api/daily/${dailyId}/votes',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':a.csrf},body:JSON.stringify({choice:1})});return r.status})()`),409);
  }
  const p=await readyPage();await register(p,'daily_voter');await open(p,'daily');await p.js(`document.querySelector('[name="choice"][value="1"]').click();document.querySelector('[data-api-form="daily-vote"]').requestSubmit()`);await p.until(`!!document.querySelector('#daily-current [data-daily-recorded]')`);
  await open(juror,'reputation');assert.equal(await juror.js(`document.querySelector('.stat strong').textContent`),'1');assert.ok((await juror.js(`document.querySelector('#dialog-body').textContent`)).includes('Daily Docket history'));
  await open(plaintiff,'daily');assert.equal(await plaintiff.js(`!!document.querySelector('#daily-current [data-daily-result]')`),false);
 });
 await check('Daily deadline reveals the actual result, opens the next question and survives reload',async()=>{
  const before=await(await fetch(base+'/api/daily')).json();time=Date.parse(before.current.closes_at);
  await plaintiff.js(`document.querySelector('[data-daily-refresh]').click()`);await plaintiff.until(`document.querySelector('#daily-current [data-daily-trial]')?.dataset.dailyTrial===${JSON.stringify(nextDailyId)}`);
  assert.ok((await plaintiff.js(`document.querySelector('#daily-results [data-daily-result]').textContent`)).includes('Winner: Purple wig'));assert.ok((await plaintiff.js(`document.querySelector('#daily-results').textContent`)).includes('66.7%'));
  assert.equal(await plaintiff.js(`!!document.querySelector('#daily-current [data-daily-result]')`),false);
  await juror.call('Page.navigate',{url:base+'/#daily'});await juror.until(`!!document.querySelector('#daily-results [data-daily-recorded]')`);await reload(juror);await juror.until(`!!document.querySelector('#daily-results [data-daily-recorded]')`);
  assert.ok((await juror.js(`document.querySelector('#daily-results [data-daily-recorded]').textContent`)).includes('Purple wig'));await screenshot(juror,'daily-result-and-next');
 });
 await check('Seven requested responsive layouts scroll to every section, contain all art, and keep modal controls reachable',async()=>{
  for(const [w,h]of [[1440,900],[1280,800],[768,1024],[1024,768],[390,844],[360,800],[844,390]]){
   await resize(plaintiff,w,h);await plaintiff.js(`document.querySelector('dialog').close();window.scrollTo(0,0)`);
   assert.equal(await plaintiff.js(`document.documentElement.scrollWidth<=innerWidth`),true,`${w} horizontal overflow`);
   for(const section of ['courtroom','court-gallery','court-guide']){await plaintiff.js(`document.querySelector('.section-links a[href="#${section}"]').click()`);await wait(50);assert.equal(await plaintiff.js(`(()=>{const r=document.querySelector(${JSON.stringify('#'+section)}).getBoundingClientRect();return r.top<innerHeight&&r.bottom>0})()`),true);}
   await plaintiff.js(`document.querySelector('#court-gallery').scrollIntoView()`);await decodeImages(plaintiff,'.page-gallery img');
   assert.equal(await plaintiff.js(`[...document.querySelectorAll('.page-gallery img')].every(i=>getComputedStyle(i).objectFit==='contain'&&Math.abs(i.getBoundingClientRect().width/i.getBoundingClientRect().height-i.naturalWidth/i.naturalHeight)<.01)`),true,`${w} image ratio`);
   await open(plaintiff,'gallery');assert.equal(await plaintiff.js(`document.querySelector('#dialog-body').scrollWidth<=document.querySelector('#dialog-body').clientWidth`),true);await plaintiff.js(`document.querySelector('dialog').scrollTop=999999`);assert.equal(await plaintiff.js(`document.querySelector('dialog').scrollTop>0`),true);await plaintiff.js(`document.querySelector('.close-btn').click()`);await plaintiff.js(`window.scrollTo(0,document.documentElement.scrollHeight)`);assert.equal(await plaintiff.js(`document.querySelector('footer').getBoundingClientRect().bottom<=innerHeight+1`),true);
   for(const view of ['docket','daily','reputation','featured','case']){await open(plaintiff,view,view==='case'?caseId:undefined);assert.equal(await plaintiff.js(`document.querySelector('#dialog-body').scrollWidth<=document.querySelector('#dialog-body').clientWidth`),true,`${view} at ${w}`);}
   if(w===390)await screenshot(plaintiff,'case-mobile');
  }
 });
 await check('Approved branding, coherent header, logo and favicon use the verified asset',async()=>{
  await plaintiff.js(`document.querySelector('dialog').close();window.scrollTo(0,0)`);
  assert.equal(await plaintiff.js(`document.querySelector('h1').getAttribute('aria-label')`),'EVERY CHOG GETS A HEARING.');
  assert.equal(await plaintiff.js(`[...document.querySelectorAll('h1 .ln')].map(e=>e.textContent).join(' ')`),'EVERY CHOG GETS A HEARING.');
  assert.equal(await plaintiff.js(`document.querySelector('.hero-tagline').textContent`),'A court by Chog. A verdict by you.');
  assert.equal(await plaintiff.js(`document.querySelectorAll('.hdr .util').length`),0);
  assert.equal(await plaintiff.js(`[...document.querySelectorAll('.brand-logo')].every(i=>i.getAttribute('src')==='assets/images/chog-court-logo.png')`),true);
  await decodeImages(plaintiff,'.brand-logo');
  assert.equal(await plaintiff.js(`document.querySelector('link[rel="icon"]').getAttribute('href')`),'assets/images/chog-court-logo.png');
  assert.equal(await plaintiff.js(`document.querySelector('.footer-bottom').textContent.includes('Built by @sopskistar')`),true);
 });
 await check('Both themes cover all seven layouts, forms, cards, dialogs, focus and persist on reload',async()=>{
  const p=await readyPage();assert.equal(await p.js(`document.documentElement.dataset.theme`),'light');
  for(const theme of ['purple','light']){
   await p.js(`document.querySelector('.theme-toggle').focus()`);assert.equal(await p.js(`document.activeElement===document.querySelector('.theme-toggle')`),true,'Theme button must receive focus');await key(p,'Enter');assert.equal(await p.js(`document.documentElement.dataset.theme`),theme,await p.js(`JSON.stringify({active:document.activeElement.outerHTML,theme:document.documentElement.dataset.theme,ready:document.readyState,dialog:document.querySelector('dialog').open})`));
   assert.equal(await p.js(`document.querySelector('.theme-toggle').getAttribute('aria-label')`),`Switch to ${theme==='purple'?'Court Light':'Chog Purple'} theme`);
   assert.equal(await p.js(`getComputedStyle(document.querySelector('.theme-toggle')).outlineStyle`),'solid');
   await reload(p);assert.equal(await p.js(`document.documentElement.dataset.theme`),theme);
   for(const [w,h]of [[1440,900],[1280,800],[1024,768],[768,1024],[390,844],[360,800],[844,390]]){
    await resize(p,w,h);await p.js(`document.querySelector('dialog').close();window.scrollTo(0,0)`);
    assert.equal(await p.js(`document.documentElement.scrollWidth<=innerWidth`),true,`${theme} ${w} overflow`);
    assert.equal(await p.js(`(()=>{const a=document.querySelector('h1').getBoundingClientRect(),b=document.querySelector('.hero-copy').getBoundingClientRect();return a.bottom<=b.top||a.right<=b.left||a.left>=b.right})()`),true,`${theme} ${w} headline overlap`);
    assert.equal(await p.js(`[...document.querySelectorAll('.hdr .main-row > *, .mainnav > *')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=document.querySelector('.hdr').getBoundingClientRect().bottom+1})`),true,`${theme} ${w} header controls: `+await p.js(`JSON.stringify({header:document.querySelector('.hdr').getBoundingClientRect(),controls:[...document.querySelectorAll('.hdr .main-row > *, .mainnav > *')].filter(e=>e.getClientRects().length).map(e=>({cls:e.className,r:e.getBoundingClientRect()}))})`));
    if(w===1280||w===390)await screenshot(p,`${theme}-home-${w}`);
    for(const view of ['account','docket','daily','reputation','featured','gallery']){
     await open(p,view);assert.equal(await p.js(`document.querySelector('#dialog-body').scrollWidth<=document.querySelector('#dialog-body').clientWidth`),true,`${theme} ${w} ${view}`);
     for(const item of await p.js(contrastCheck))assert.ok(item.ratio>=4.5,`${theme} ${view} ${item.element} contrast ${item.ratio}`);
    }
    if(w===390)await screenshot(p,`${theme}-gallery-${w}`);
   }
   await p.js(`document.querySelector('dialog').close();window.scrollTo(0,0)`);
  }
 });
 await check('Theme switching works when storage access throws, including at startup',async()=>{
  const p=await browser.newPage();await p.call('Page.addScriptToEvaluateOnNewDocument',{source:`Storage.prototype.getItem=()=>{throw new DOMException('denied','SecurityError')};Storage.prototype.setItem=()=>{throw new DOMException('denied','SecurityError')};`});
  await p.call('Page.navigate',{url:base});await p.until(`document.documentElement?.dataset.entrance==='done'`);assert.equal(await p.js(`document.documentElement.dataset.theme`),'light');await p.js(`document.querySelector('.theme-toggle').click()`);assert.equal(await p.js(`document.documentElement.dataset.theme`),'purple');await open(p,'gallery');assert.equal(await p.js(`document.querySelectorAll('#dialog-body .gallery-art').length`),6);
 });
 await check('All six enlarged images contain full artwork, scroll independently and restore keyboard focus',async()=>{
  const p=await readyPage();await p.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(let i=0;i<6;i++){
   await p.js(`(()=>{const b=document.querySelector('.page-gallery [data-art="${i}"]');b.scrollIntoView({block:'center',behavior:'instant'});b.focus();})()`);await key(p,'Enter');await p.until(`!!document.querySelector('.art-enlarged')`);await decodeImages(p,'.art-enlarged img');
   assert.equal(await p.js(`(()=>{const i=document.querySelector('.art-enlarged img'),r=i.getBoundingClientRect();return getComputedStyle(i).objectFit==='contain'&&Math.abs(r.width/r.height-i.naturalWidth/i.naturalHeight)<.01})()`),true);
   if(i>=2)assert.ok((await p.js(`document.querySelector('.art-enlarged figcaption').textContent`)).includes('not live application records'));
   if(i%2){await p.js(`document.querySelector('.close-btn').click()`);}else{await key(p,'Escape');}
   await p.until(`!document.querySelector('dialog').open && document.activeElement===document.querySelector('.page-gallery [data-art="${i}"]')`);
  }
  await p.js(`document.querySelector('.page-gallery [data-art="0"]').click()`);await p.call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await wait(100);await p.js(`document.querySelector('dialog').scrollTop=999999`);assert.equal(await p.js(`document.querySelector('dialog').scrollTop>0 && document.querySelector('.close-btn').getBoundingClientRect().top>=0`),true);await key(p,'Escape');
 });
 await check('Every footer link has a real destination, page scroll reaches footer and back-to-top works',async()=>{
  const p=await readyPage();
  for(const view of ['docket','file-a-case','verdict','how-it-works','rules']){await p.js(`document.querySelector('footer a[href="#${view}"]').focus();document.querySelector('footer a[href="#${view}"]').click()`);await p.until(`document.querySelector('dialog').open`);await key(p,'Escape');await p.until(`document.activeElement===document.querySelector('footer a[href="#${view}"]')`);}
  await p.js(`document.querySelector('footer a[href="#court-gallery"]').click()`);await p.until(`document.querySelector('#court-gallery').getBoundingClientRect().top<innerHeight`);
  assert.deepEqual(await p.js(`[...document.querySelectorAll('footer nav[aria-label="Community"] a')].map(a=>a.href)`),['https://x.com/sopskistar','https://github.com/sopskistar','https://github.com/sopskistar/chogcourt','https://www.chog.xyz/','https://x.com/ChogNFT','https://discord.com/invite/chog']);
  assert.equal(await p.js(`[...document.querySelectorAll('footer a[target="_blank"]')].every(a=>a.rel.includes('noopener')&&a.rel.includes('noreferrer'))`),true);
  await p.js(`window.scrollTo(0,document.documentElement.scrollHeight)`);assert.equal(await p.js(`document.querySelector('footer').getBoundingClientRect().bottom<=innerHeight+1`),true);await screenshot(p,'footer-desktop');await p.js(`document.querySelector('.footer-bottom a[href="#home"]').click()`);await p.until(`scrollY===0`);
 });
 await check('Every primary navigation destination works; nominations are clearly disabled, practice remains separate',async()=>{
  for(const view of ['docket','rulings','gallery','how-it-works','rules','verdict','daily','reputation','featured','file-a-case','account','search'])await open(plaintiff,view);
  await open(plaintiff,'featured');assert.equal(await plaintiff.js(`document.querySelector('.court-sheet button').disabled`),true);assert.ok((await plaintiff.js(`document.querySelector('#dialog-body').textContent`)).includes('Not verified or checked'));
  await plaintiff.js(`document.querySelector('[data-court-mode="practice"]').click()`);assert.ok((await plaintiff.js(`document.querySelector('#dialog-body').textContent`)).includes('LOCAL PRACTICE'));assert.ok((await plaintiff.js(`document.querySelector('#dialog-body').textContent`)).includes('DEMO'));await plaintiff.js(`document.querySelector('[data-court-mode="shared"]').click()`);await plaintiff.until(`!!document.querySelector('#shared-case-list')`);assert.ok(!(await plaintiff.js(`document.querySelector('#shared-case-list').textContent`)).includes('example-001'));
 });
 await check('API outage produces a retry message, never fabricated shared results',async()=>{
  await plaintiff.call('Network.setBlockedURLs',{urls:[base+'/api/*']});await open(plaintiff,'gallery');await plaintiff.js(`document.querySelector('.close-btn').click();document.querySelector('.court-door a').click()`);await plaintiff.until(`!!document.querySelector('.api-error')`);assert.equal(await plaintiff.js(`!!document.querySelector('[data-live-verdict]')`),false);await plaintiff.call('Network.setBlockedURLs',{urls:[]});await plaintiff.js(`document.querySelector('[data-shared-refresh]').click()`);await plaintiff.until(`!!document.querySelector('#shared-case-list')`);
 });
 await check('A late API failure cannot overwrite a subsequently opened gallery',async()=>{
  await plaintiff.call('Network.setBlockedURLs',{urls:[base+'/api/*']});
  await plaintiff.js(`document.querySelector('.court-door a').click();document.querySelector('#menu-panel a[href="#gallery"]').click()`);await wait(500);
  assert.equal(await plaintiff.js(`document.querySelectorAll('#dialog-body .gallery-art').length`),6);assert.equal(await plaintiff.js(`!!document.querySelector('#dialog-body .api-error')`),false);
  await plaintiff.call('Network.setBlockedURLs',{urls:[]});
 });
 await check('Real-time 60-second local demo: separate accounts, actual votes, result and next docket',async()=>{
  const isolated=openTemporaryDemoDatabase(),normalBase=base;
  let demo;
  try{
   demo=createServer({db:isolated.db,port:0,host:'127.0.0.1'});await new Promise((yes,no)=>{demo.server.once('error',no);demo.server.listen(0,'127.0.0.1',yes);});base='http://127.0.0.1:'+demo.server.address().port;
   const users=[];for(const name of ['demo_author','demo_one','demo_two','demo_three']){const p=await readyPage();await register(p,name);users.push(p);}
   const author=users[0];await open(author,'daily');assert.equal(await author.js(`!!document.querySelector('[data-demo-notice]')`),true);assert.equal(await author.js(`document.documentElement.hasAttribute('data-local-demo')`),true);
   async function question(title){await author.js(`document.querySelector('#daily-submit-panel').open=true`);await input(author,'[name="question"]',title);await input(author,'[name="choice1"]','Purple wig');await input(author,'[name="choice2"]','Golden crown');await author.js(`document.querySelector('[data-api-form="daily-submit"]').requestSubmit()`);await author.until(`document.querySelector('#dialog-body').textContent.includes(${JSON.stringify(title)}) && !document.querySelector('#dialog-body').textContent.includes('Opening the shared court')`);}
   await question('Which tiny hat should Chog wear today?');const first=(await(await fetch(base+'/api/daily')).json()).current;
   assert.equal(Date.parse(first.closes_at)-Date.parse(first.opened_at),60000);assert.equal(first.participation,0);
   await question('Which tiny hat should Chog wear next?');
   for(const p of users.slice(1)){await open(p,'daily');await p.js(`document.querySelector('[name="choice"][value="0"]').click();document.querySelector('[data-api-form="daily-vote"]').requestSubmit()`);await p.until(`!!document.querySelector('#daily-current [data-daily-recorded]')`);}
   const pending=(await(await fetch(base+'/api/daily')).json()).current;assert.equal(pending.participation,3);assert.equal(pending.result,null);
   console.log('Waiting for the actual demo deadline (no clock override):',first.closes_at);
   while(Date.now()<Date.parse(first.closes_at))await wait(Math.min(1000,Date.parse(first.closes_at)-Date.now()+10));
   await author.js(`document.querySelector('[data-daily-refresh]').click()`);await author.until(`document.querySelector('#daily-current h3')?.textContent==='Which tiny hat should Chog wear next?'`);
   assert.ok((await author.js(`document.querySelector('#daily-results [data-daily-result]').textContent`)).includes('Winner: Purple wig'));assert.ok((await author.js(`document.querySelector('#daily-results [data-daily-result]').textContent`)).includes('3 vote(s)'));
   await screenshot(author,'real-60-second-demo');
   assert.equal((await(await fetch(normalBase+'/api/config')).json()).daily.windowSeconds,86400);
  }finally{base=normalBase;if(demo)await new Promise(resolve=>demo.server.close(resolve));isolated.db.close();await fs.rm(isolated.directory,{recursive:true,force:true});}
 });
 await check('No uncaught JavaScript exceptions in the shared application journey',async()=>assert.deepEqual(errors,[]));
}catch(error){failure=error.stack||String(error);console.error(failure);process.exitCode=1;}
finally{await fs.writeFile(join(artifacts,'report.json'),JSON.stringify({status:failure?'failed':'passed',failure,checks,passed:checks.length,errors,artifacts,browsersTested:['Chromium'],browsersUnavailable:['Firefox','WebKit']},null,2));console.log('Shared app report:',artifacts);if(browser)await browser.close();if(runner)await new Promise(resolve=>runner.server.close(resolve));db.close();}
