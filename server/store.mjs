import {AsyncLocalStorage} from 'node:async_hooks';
const demoDatabases=new WeakSet();
const sqliteStores=new WeakMap();
const sqliteContext=new AsyncLocalStorage();
export const SCHEMA_VERSION=3;
export const registerDemoDatabase=db=>demoDatabases.add(db);
export const isDemoDatabase=db=>!!db&&(demoDatabases.has(db)||demoDatabases.has(db.raw));

export function asStore(db) {
  if(db?.kind==='postgres')return db;
  if(!db?.prepare)throw new TypeError('A database store is required.');
  if(sqliteStores.has(db))return sqliteStores.get(db);
  let lock=Promise.resolve();
  const withLock=async fn=>{const previous=lock;let release;lock=new Promise(resolve=>release=resolve);await previous;try{return await fn();}finally{release();}};
  const execute=(sql,params=[])=>{
      const statement=db.prepare(sql);
      if(/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)||/\bRETURNING\b/i.test(sql)) {
        const result=statement.all(...params);return {rows:result,rowCount:result.length};
      }
      const result=statement.run(...params);return {rows:[],rowCount:result.changes,changes:result.changes};
  };
  const store={kind:'sqlite',serial:false,raw:db,
    async query(sql,params=[]) {return sqliteContext.getStore()?.store===store?execute(sql,params):withLock(()=>execute(sql,params));},
    prepare(sql){return {get:async(...params)=>{const result=await store.query(sql,params);return result.rows[0];},all:async(...params)=>(await store.query(sql,params)).rows,run:async(...params)=>{const result=await store.query(sql,params);return {changes:result.rowCount,rows:result.rows};}};},
    async transaction(fn) {return withLock(async()=>{
      db.exec('BEGIN IMMEDIATE');
      try {const result=await sqliteContext.run({store},()=>fn(store));db.exec('COMMIT');return result;}
      catch(error){db.exec('ROLLBACK');throw error;}
    });},
    close:()=>db.close()
  };
  sqliteStores.set(db,store);return store;
}

export function transaction(db,fn) {
  if(db.transaction)return db.transaction(fn);
  db.exec('BEGIN IMMEDIATE');
  try {const result=fn();db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
