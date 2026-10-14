import {openDatabase} from './database.mjs';
const db=openDatabase(process.env.DATABASE_PATH||'./data/chogcourt.sqlite');
console.log('Database migration version',db.prepare('SELECT max(version) AS version FROM migrations').get().version);
db.close();
