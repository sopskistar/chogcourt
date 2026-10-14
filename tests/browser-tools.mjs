import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
export const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class CDP {
 constructor(ws){this.ws=ws;this.next=0;this.pending=new Map();this.handlers=[];ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);clearTimeout(p.timer);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result);}else for(const fn of this.handlers)fn(data);});}
 static async open(url){const ws=new WebSocket(url);await new Promise((yes,no)=>{ws.addEventListener('open',yes,{once:true});ws.addEventListener('error',no,{once:true});});return new CDP(ws);}
 call(method,params={}){return new Promise((resolve,reject)=>{const id=++this.next,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout: '+method));},15000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
 async js(expression){const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 async until(expression){for(let n=0;n<160;n++){if(await this.js(expression))return;await wait(50);}throw Error('Timed out: '+expression);}
 close(){this.ws.close();}
}
export async function launchBrowser(artifacts){
 const candidates=[process.env.CHOG_BROWSER_PATH,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].filter(Boolean);
 let installed=[];try{installed=await fs.readdir(join(homedir(),'.cache/ms-playwright'));for(const dir of installed)if(/^chromium-\d+$/.test(dir))candidates.push(join(homedir(),'.cache/ms-playwright',dir,'chrome-linux64/chrome'));}catch{}
 let executable;for(const path of candidates)try{await fs.access(path);executable=path;break;}catch{}
 if(!executable)throw Error('No Chromium executable available. Set CHOG_BROWSER_PATH.');
 const chrome=spawn(executable,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${join(artifacts,'browser')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((yes,no)=>{let output='';const timer=setTimeout(()=>no(Error('Chromium startup timed out')),15000);chrome.once('error',no);chrome.stderr.on('data',b=>{output+=b;const m=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);yes(m[1]);}});});
 const browser=await CDP.open(endpoint),pages=[];
 async function newPage(){const {browserContextId}=await browser.call('Target.createBrowserContext');await browser.call('Browser.setDownloadBehavior',{behavior:'allow',browserContextId,downloadPath:artifacts});const {targetId}=await browser.call('Target.createTarget',{url:'about:blank',browserContextId});const targets=await(await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json();const page=await CDP.open(targets.find(t=>t.id===targetId).webSocketDebuggerUrl);await page.call('Page.enable');await page.call('Runtime.enable');await page.call('Network.enable');await page.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});pages.push({page,browserContextId});return page;}
 async function close(){for(const p of pages){p.page.close();try{await browser.call('Target.disposeBrowserContext',{browserContextId:p.browserContextId});}catch{}}try{await browser.call('Browser.close');}catch{}browser.close();chrome.kill('SIGTERM');}
 return {newPage,close,installed,executable};
}
