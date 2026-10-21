import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {AsyncLocalStorage} from 'node:async_hooks';
import {SCHEMA_VERSION} from './store.mjs';

const {Pool,types}=pg;
const postgresTypes={getTypeParser(oid,format){
  if(oid===20)return value=>Number(value);
  return types.getTypeParser(oid,format);
}};
const migrateSql=version=>readFile(new URL(`./migrations/postgres-00${version}.sql`,import.meta.url),'utf8');
const parameterize=sql=>{let i=0;return sql.replace(/\?/g,()=>`$${++i}`);};
const transactionContext=new AsyncLocalStorage();
function normalize(result){
  for(const field of result.fields||[])if(field.dataTypeID===20)for(const row of result.rows||[])if(row[field.name]!=null)row[field.name]=Number(row[field.name]);
  return result;
}

export function createPostgresStore({connectionString=process.env.DATABASE_URL,pool}={}) {
  if(!pool&&!connectionString)throw Error('DATABASE_URL is required for the PostgreSQL backend.');
  const clientPool=pool||new Pool({connectionString,max:1,idleTimeoutMillis:5000,connectionTimeoutMillis:10000,allowExitOnIdle:true,types:postgresTypes});
  let initialized;
  const store={kind:'postgres',serial:false,pool:clientPool,
    async query(sql,params=[]){const context=transactionContext.getStore();const result=context?.store===store?await context.client.query(parameterize(sql),params):await clientPool.query(parameterize(sql),params);return normalize(result);},
    prepare(sql){return {get:async(...params)=>(await store.query(sql,params)).rows[0],all:async(...params)=>(await store.query(sql,params)).rows,run:async(...params)=>{const result=await store.query(sql,params);return {changes:result.rowCount,rows:result.rows};}};},
    async transaction(fn){
      const client=await clientPool.connect();
      try {await client.query('BEGIN');const tx={query:(sql,params=[])=>client.query(parameterize(sql),params).then(normalize)};const result=await transactionContext.run({store,client},()=>fn(tx));await client.query('COMMIT');return result;}
      catch(error){try{await client.query('ROLLBACK');}catch{}throw error;}
      finally{client.release();}
    },
    async ensureSchema(){
      initialized??=store.transaction(async tx=>{
        await tx.query("SELECT pg_advisory_xact_lock(hashtext('chogcourt-schema-v1'))");
        await tx.query('CREATE TABLE IF NOT EXISTS migrations (version integer PRIMARY KEY, applied_at text NOT NULL)');
        const current=await tx.query('SELECT max(version) AS version FROM migrations');
        let version=Number(current.rows[0]?.version||0);
        if(version>SCHEMA_VERSION)throw Error('Unsupported PostgreSQL schema version; do not overwrite this database.');
        while(version<SCHEMA_VERSION){version++;await tx.query(await migrateSql(version));}
        const final=await tx.query('SELECT max(version) AS version FROM migrations');
        if(Number(final.rows[0]?.version)!==SCHEMA_VERSION)throw Error(`PostgreSQL schema initialization did not reach version ${SCHEMA_VERSION}.`);
      });
      try{return await initialized;}catch(error){initialized=null;throw error;}
    },
    async close(){await clientPool.end();}
  };
  return store;
}

let defaultStore;
export function getPostgresStore(){
  defaultStore??=createPostgresStore();
  return defaultStore;
}
