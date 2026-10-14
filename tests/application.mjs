import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from '../server/index.mjs';
import {openDatabase} from '../server/database.mjs';
import {launchBrowser,wait} from './browser-tools.mjs';

const artifacts=await fs.mkdtemp(join(tmpdir(),'chog-app-')),checks=[],errors=[];
const db=openDatabase(join(artifacts,'court.sqlite'));let time=Date.now(),runner,browser,base,failure=null;
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
async function input(p,selector,value){await p.js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function open(p,view,id){await p.js(`(()=>{const a=document.createElement('a');a.href=${JSON.stringify('#'+view)};${id?`a.dataset.openCase=${JSON.stringify(id)};`:''}document.body.appendChild(a);a.click();a.remove();})()`);await p.until(`document.querySelector('dialog').open && !document.querySelector('#dialog-body').textContent.includes('Opening the shared court')`);assert.equal(await p.js(`!!document.querySelector('#dialog-body > .api-error')`),false,await p.js(`document.querySelector('#dialog-body').textContent`));}
async function readyPage(){const p=await browser.newPage();p.handlers.push(d=>{if(d.method==='Runtime.exceptionThrown')errors.push(d.params);});await p.call('Page.navigate',{url:base});await p.until(`document.documentElement?.dataset.entrance==='done'`);await p.js(`document.fonts.ready.then(()=>true)`);return p;}
async function reload(p){await p.js(`window.__beforeTestReload=true`);await p.call('Page.reload');await p.until(`!window.__beforeTestReload && document.documentElement?.dataset.entrance==='done'`);await p.js(`document.fonts.ready.then(()=>true)`);}
async function register(p,name){await open(p,'account');await input(p,'[name="username"]',name);await input(p,'[name="password"]','browser-test-password-123');await p.js(`document.querySelector('[value="register"]').click()`);await p.until(`!!document.querySelector('#shared-case-list')`);}
async function screenshot(p,name){const r=await p.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(join(artifacts,name+'.png'),Buffer.from(r.data,'base64'));}
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
 runner=createServer({db,port:0,now:()=>new Date(time),evidenceSeconds:3600,votingSeconds:3600});await new Promise((yes,no)=>{runner.server.once('error',no);runner.server.listen(0,'127.0.0.1',yes);});base=`http://127.0.0.1:${runner.server.address().port}`;
 browser=await launchBrowser(artifacts);console.log('Available cached browsers:',browser.installed.join(', '));
 const plaintiff=await readyPage(),defendant=await readyPage(),juror=await readyPage();let caseId;
 await check('HTTP health, static images, server injection and private-file protection',async()=>{
  assert.equal((await(await fetch(base+'/api/health')).json()).ok,true);
  for(const path of ['/.env','/server/app.mjs','/data/chogcourt.sqlite','/package.json'])assert.equal((await fetch(base+path)).status,404);
  assert.equal(await plaintiff.js(`document.documentElement.hasAttribute('data-shared-court')`),true);
  for(const file of ['chog-court-logo.png','chog-court-judge.png','chog-official-pfp.png','verdict-machine.png','jury-streaks-daily-docket.png','chog-reputation-card.png','chog-case-of-the-day.png']){const r=await fetch(base+'/assets/images/'+file);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
 });
 await check('Independent browser sessions register and authenticate separate shared accounts',async()=>{await register(plaintiff,'plaintiff_browser');await register(defendant,'defendant_browser');await register(juror,'juror_browser');assert.ok((await plaintiff.js(`document.querySelector('.live-bar').textContent`)).includes('plaintiff_browser'));assert.ok((await defendant.js(`document.querySelector('.live-bar').textContent`)).includes('defendant_browser'));});
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
 await check('Refresh and a new login retain case history and actual participation',async()=>{
  await juror.call('Page.navigate',{url:base+'/#case/'+caseId});await juror.until(`!!document.querySelector('[data-live-verdict]')`);await reload(juror);await juror.until(`!!document.querySelector('[data-live-verdict]')`);assert.equal(await juror.js(`document.querySelector('.verdict-stamp').textContent`),'INNOCENT');
  const fresh=await readyPage();await open(fresh,'account');await input(fresh,'[name="username"]','juror_browser');await input(fresh,'[name="password"]','browser-test-password-123');await fresh.js(`document.querySelector('[value="login"]').click()`);await fresh.until(`!!document.querySelector('#shared-case-list')`);await open(fresh,'reputation');assert.equal(await fresh.js(`document.querySelector('.stat strong').textContent`),'1');
 });
 await check('Seven requested responsive layouts scroll to every section, contain all art, and keep modal controls reachable',async()=>{
  for(const [w,h]of [[1440,900],[1280,800],[768,1024],[1024,768],[390,844],[360,800],[844,390]]){
   await plaintiff.call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<500});await plaintiff.js(`document.querySelector('dialog').close();window.scrollTo(0,0)`);await wait(80);
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
    await p.call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<500});await p.js(`document.querySelector('dialog').close();window.scrollTo(0,0)`);await wait(80);
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
 await check('No uncaught JavaScript exceptions in the shared application journey',async()=>assert.deepEqual(errors,[]));
}catch(error){failure=error.stack||String(error);console.error(failure);process.exitCode=1;}
finally{await fs.writeFile(join(artifacts,'report.json'),JSON.stringify({status:failure?'failed':'passed',failure,checks,passed:checks.length,errors,artifacts,browsersTested:['Chromium'],browsersUnavailable:['Firefox','WebKit']},null,2));console.log('Shared app report:',artifacts);if(browser)await browser.close();if(runner)await new Promise(resolve=>runner.server.close(resolve));db.close();}
