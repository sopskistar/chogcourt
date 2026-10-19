import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
if(process.env.VERCEL==='1')throw Error('Deployment blocked: this SQLite application requires a persistent Node/Docker host. A Vercel static build would not provide the shared court API. See docs/DEPLOYMENT.md.');
const root=resolve(import.meta.dirname,'..');
const html=await fs.readFile(resolve(root,'index.html'),'utf8');
for(const [,script]of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new Function(script);
assert.ok(html.includes('colDown 14.6s linear infinite'));
for(const name of ['chog-court-logo.png','verdict-machine.png','jury-streaks-daily-docket.png','chog-reputation-card.png','chog-case-of-the-day.png','chog-court-judge.png','chog-official-pfp.png']){
 const data=await fs.readFile(resolve(root,'assets/images',name));assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(html.includes(name));
}
await fs.mkdir(resolve(root,'dist'),{recursive:true});
for(const path of ['index.html','assets','server','package.json','.env.example'])await fs.cp(resolve(root,path),resolve(root,'dist',path),{recursive:true});
console.log('Production artifact prepared in dist/: vanilla frontend, seven PNGs, Node server and schema. No secrets or database copied.');
