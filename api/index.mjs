import {createApplication} from '../server/app.mjs';
import {getPostgresStore} from '../server/postgres.mjs';

export function createVercelHandler({storeFactory=getPostgresStore,env=process.env}={}) {
  let handlerPromise;
  async function getHandler() {
    if(!env.DATABASE_URL)throw Error('DATABASE_URL is required.');
    if(!env.PUBLIC_ORIGIN)throw Error('PUBLIC_ORIGIN must be the canonical HTTPS deployment origin.');
    const origin=new URL(env.PUBLIC_ORIGIN);
    if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash)throw Error('PUBLIC_ORIGIN must be an HTTPS origin without a path.');
    handlerPromise??=(async()=>{
      const db=storeFactory();await db.ensureSchema();
      return createApplication({db,origin:origin.origin,production:true,
        quorum:Number(env.MIN_QUORUM||3),evidenceSeconds:Number(env.EVIDENCE_SECONDS||86400),
        votingSeconds:Number(env.VOTING_SECONDS||86400),juryPolicy:env.JURY_POLICY||'account',
        registrationCode:env.REGISTRATION_CODE||''});
    })();
    try{return await handlerPromise;}catch(error){handlerPromise=null;throw error;}
  }
  return {async fetch(request) {
    try {
      const app=await getHandler(),url=new URL(request.url),route=url.searchParams.get('__route');
      const path=route&&route.startsWith('/api/')?route:undefined;
      const forwarded=request.headers.get('x-forwarded-for');
      const ip=forwarded?.split(',').at(-1)?.trim()||'vercel';
      return await app(request,{ip,path});
    } catch(error) {
      console.error('Vercel initialization failure:',error.code||error.name);
      return Response.json({error:{code:'SERVICE_UNAVAILABLE',message:'The court service is not ready. Check database configuration and try again.'}},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }};
}

export default createVercelHandler();
