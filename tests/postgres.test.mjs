import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPostgresStore} from '../server/postgres.mjs';

function fakePool(initialVersion=0) {
  const calls=[];let version=initialVersion;
  const respond=async(text,values=[])=>{
    calls.push({text,values});
    if(text.includes('max(version)'))return {rows:[{version}],rowCount:1};
    if(text.includes('RETURNING hits'))return {rows:[{hits:1}],rowCount:1};
    const migrated=text.match(/INSERT INTO migrations\(version,applied_at\) VALUES\s*\((\d+)/);
    if(migrated)version=Math.max(version,Number(migrated[1]));
    return {rows:[],rowCount:1};
  };
  return {calls,query:respond,connect:async()=>({query:respond,release(){calls.push({text:'RELEASE'});}}),async end(){}};
}

test('PostgreSQL store parameterizes query values and scopes every transaction to one client',async()=>{
  const pool=fakePool(),db=createPostgresStore({pool});
  await db.query('SELECT ? AS value',[41]);
  assert.equal(pool.calls[0].text,'SELECT $1 AS value');assert.deepEqual(pool.calls[0].values,[41]);
  await db.transaction(async tx=>{await tx.query('INSERT INTO evidence(content) VALUES(?)',[Buffer.from([0,255])]);});
  const statements=pool.calls.map(x=>x.text);
  assert.ok(statements.includes('BEGIN'));assert.ok(statements.includes('INSERT INTO evidence(content) VALUES($1)'));assert.ok(statements.includes('COMMIT'));assert.ok(statements.includes('RELEASE'));
});

test('PostgreSQL transactions roll back and always release a failed client',async()=>{
  const pool=fakePool(),db=createPostgresStore({pool});
  await assert.rejects(db.transaction(async()=>{throw Error('test rollback');}),/test rollback/);
  const statements=pool.calls.map(x=>x.text);
  assert.ok(statements.includes('BEGIN'));assert.ok(statements.includes('ROLLBACK'));assert.ok(statements.includes('RELEASE'));assert.ok(!statements.includes('COMMIT'));
});

test('Schema initialization is serialized, transactional, version checked and covers all persisted app tables',async()=>{
  const pool=fakePool(),db=createPostgresStore({pool});
  await Promise.all([db.ensureSchema(),db.ensureSchema()]);
  const statements=pool.calls.map(x=>x.text);
  assert.equal(statements.filter(x=>x==='BEGIN').length,1);
  assert.ok(statements.some(x=>x.includes('pg_advisory_xact_lock')));
  const ddl=statements.filter(x=>x.includes('CREATE TABLE IF NOT EXISTS'));
  const allDdl=ddl.join('\n');assert.ok(allDdl);
  for(const name of ['users','sessions','tokens','claims','evidence','responses','readiness','votes','verdicts','history','nominations','daily_trials','daily_choices','daily_votes','daily_results','wallet_sessions','wallet_challenges','rate_limits'])assert.match(allDdl,new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\b`));
  assert.ok(allDdl.includes('UNIQUE(claim_id,sha256)'));assert.ok(allDdl.includes('PRIMARY KEY(claim_id,user_id)'));assert.equal(statements.filter(x=>/INSERT INTO migrations/.test(x)).length,3);assert.equal(statements.filter(x=>/max\(version\)/.test(x)).length,2);assert.ok(statements.includes('COMMIT'));
});

test('An older PostgreSQL schema applies only its remaining additive migration',async()=>{
  const pool=fakePool(2),db=createPostgresStore({pool});await db.ensureSchema();
  const migrations=pool.calls.map(x=>x.text).filter(x=>/INSERT INTO migrations/.test(x));
  assert.equal(migrations.length,1);assert.match(migrations[0],/\(3,/);assert.ok(pool.calls.some(x=>x.text.includes('CREATE TABLE IF NOT EXISTS rate_limits')));
});

test('Fresh schema DDL remains a PostgreSQL-only schema with bytea evidence and foreign keys',async()=>{
  const ddl=(await Promise.all([1,2,3].map(n=>readFile(new URL(`../server/migrations/postgres-00${n}.sql`,import.meta.url),'utf8')))).join('\n');
  assert.match(ddl,/content bytea NOT NULL/);assert.match(ddl,/REFERENCES claims\(id\)/);assert.match(ddl,/GENERATED ALWAYS AS IDENTITY/);assert.doesNotMatch(ddl,/PRAGMA|AUTOINCREMENT|COLLATE NOCASE/);
});
