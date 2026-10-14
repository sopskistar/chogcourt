import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from './database.mjs';
import {createApplication} from './app.mjs';

export function createServer(options={}) {
  const production=options.production??process.env.NODE_ENV==='production';
  const port=options.port??Number(process.env.PORT||4173),host=options.host??process.env.HOST??'127.0.0.1';
  const origin=options.origin??process.env.PUBLIC_ORIGIN??`http://127.0.0.1:${port}`;
  if(production&&(!origin.startsWith('https://')||!process.env.DATABASE_PATH))throw Error('Production requires HTTPS PUBLIC_ORIGIN and DATABASE_PATH on a persistent volume.');
  const db=options.db||openDatabase(process.env.DATABASE_PATH||'./data/chogcourt.sqlite');
  const settings={db,origin,production,quorum:Number(process.env.MIN_QUORUM||3),evidenceSeconds:Number(process.env.EVIDENCE_SECONDS||86400),votingSeconds:Number(process.env.VOTING_SECONDS||86400),juryPolicy:process.env.JURY_POLICY||'account',registrationCode:process.env.REGISTRATION_CODE||'',...options};
  let app=createApplication(settings);
  const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
  const images=new Set(['chog-court-logo.png','chog-case-of-the-day.png','chog-court-judge.png','chog-official-pfp.png','chog-reputation-card.png','jury-streaks-daily-docket.png','verdict-machine.png']);
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    try {
      const path=new URL(req.url,'http://local').pathname;
      if(path.startsWith('/api/')) {
        const chunks=[];let length=0;
        for await(const part of req){length+=part.length;if(length>1500000){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'TOO_LARGE',message:'Request exceeds 1.5 MB.'}}));return;}chunks.push(part);}
        const response=await app(new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),{ip:req.socket.remoteAddress});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const filename=path.startsWith('/assets/images/')?path.slice('/assets/images/'.length):null;
      if(!['/','/index.html'].includes(path)&&!images.has(filename)){res.writeHead(404);res.end('Not found');return;}
      let bytes=await readFile(resolve(root,filename?'assets/images/'+filename:'index.html'));
      if(!filename)bytes=Buffer.from(bytes.toString('utf8').replace('<html lang="en">','<html lang="en" data-shared-court>'));
      res.writeHead(200,{'Content-Type':filename?'image/png':'text/html; charset=utf-8','Cache-Control':filename?'public, max-age=3600':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch {if(!res.headersSent)res.writeHead(500);res.end('Request failed');}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  server.on('listening',()=>{if(port===0&&!options.origin&&!process.env.PUBLIC_ORIGIN)app=createApplication({...settings,origin:`http://127.0.0.1:${server.address().port}`});});
  return {server,db,host,port};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {server,db,host,port}=createServer();
  server.listen(port,host,()=>console.log(`Chog Court listening on http://${host}:${port} (shared SQLite court)`));
  server.on('error',error=>{console.error(error.message);db.close();process.exitCode=1;});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
}
