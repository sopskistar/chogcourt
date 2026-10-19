import {openTemporaryDemoDatabase} from '../server/database.mjs';
import {createServer} from '../server/index.mjs';

// Deliberately no .env loading, path option, host option, or production mode.
if(process.env.NODE_ENV==='production'||['DATABASE_PATH','PUBLIC_ORIGIN','HOST','PORT'].some(k=>process.env[k]))throw Error('Demo refuses deployment settings. Run in a development shell without DATABASE_PATH, PUBLIC_ORIGIN, HOST or PORT.');
const {db,directory}=openTemporaryDemoDatabase();
let runner;
try {runner=createServer({db,host:'127.0.0.1',port:4174,origin:'http://127.0.0.1:4174',production:false,quorum:3,evidenceSeconds:86400,votingSeconds:86400,juryPolicy:'account',registrationCode:''});}
catch(error){db.close();throw error;}
const {server}=runner;
server.listen(4174,'127.0.0.1',()=>{
  console.log('LOCAL DEMO ONLY — http://127.0.0.1:4174/#daily');
  console.log('Daily questions last 60 seconds. Community Court retains its normal 24-hour defaults.');
  console.log('Fresh isolated database:',directory+'/demo.sqlite');
  console.log('No seeded users or votes. Register an author and three voters before submitting a question.');
});
server.on('error',error=>{console.error(error.message);db.close();process.exitCode=1;});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();console.log('Demo stopped. Temporary records remain at '+directory+'; a new run uses a new database.');process.exit(0);}));
