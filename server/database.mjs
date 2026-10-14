import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

export function openDatabase(path) {
  if(path!==':memory:') mkdirSync(dirname(resolve(path)),{recursive:true});
  const db=new DatabaseSync(path,{timeout:5000});
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const exists=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").get();
  if(!exists) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(readFileSync(new URL('./migrations/001_initial.sql',import.meta.url),'utf8'));db.exec('COMMIT'); }
    catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  const version=db.prepare('SELECT max(version) AS version FROM migrations').get().version;
  if(version!==1){db.close();throw Error('Unsupported database schema version; do not overwrite this database.');}
  return db;
}
export function transaction(db,fn) {
  db.exec('BEGIN IMMEDIATE');
  try {const value=fn();db.exec('COMMIT');return value;} catch(error){db.exec('ROLLBACK');throw error;}
}
