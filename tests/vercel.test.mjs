import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createVercelHandler} from '../api/index.mjs';

test('Vercel config routes the full API prefix to one function and serves only the static artifact',async()=>{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.framework,null);
  assert.equal(config.buildCommand,'npm run build:vercel');assert.equal(config.outputDirectory,'dist');
  assert.equal(config.functions['api/index.mjs'].includeFiles,'server/migrations/postgres-*.sql');
  assert.deepEqual(config.rewrites,[{source:'/api/:path*',destination:'/api/index?__route=/api/:path*'}]);
  const root=new URL('../dist/',import.meta.url);
  const deployedHtml=await readFile(new URL('index.html',root),'utf8');
  assert.match(deployedHtml,/<html lang="en" data-shared-court>/);
  assert.doesNotMatch(await readFile(new URL('../index.html',import.meta.url),'utf8'),/<html lang="en" data-shared-court>/);
  for(const image of ['chog-court-logo.png','chog-case-of-the-day.png','chog-court-judge.png','chog-official-pfp.png','chog-reputation-card.png','jury-streaks-daily-docket.png','verdict-machine.png'])await stat(new URL(`assets/images/${image}`,root));
  await assert.rejects(stat(new URL('server/app.mjs',root)),{code:'ENOENT'});
  await assert.rejects(stat(new URL('.env.example',root)),{code:'ENOENT'});
});

test('Vercel internal route parameter reaches the existing API dispatcher without losing public query parameters',async()=>{
  let schemaCalls=0;
  const db={kind:'postgres',serial:false,async ensureSchema(){schemaCalls++;},prepare(sql){return {get:async()=>{assert.equal(sql,'SELECT 1');return {one:1};}};}};
  const handler=createVercelHandler({storeFactory:()=>db,env:{DATABASE_URL:'postgres://test-only',PUBLIC_ORIGIN:'https://court.test'}});
  const request=new Request('https://court.test/api/index?__route=%2Fapi%2Fhealth&preserved=yes');
  const response=await handler.fetch(request);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,database:'postgres',schema:3});assert.equal(schemaCalls,1);
});
