import {randomBytes} from 'node:crypto';
import {verifyMessage,getAddress} from './vendor/ethers-6.17.0.mjs';
import {transaction} from './store.mjs';
import {tokenKey,saveVerifiedTokenAsync} from './rules.mjs';
import {NFT_COLLECTION,MONAD_CHAIN_ID,walletAddress,nftTokenId} from './wallet.mjs';

const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
const blank=()=>({walletAuthenticated:false,ownershipVerified:false,eligible:false,tokenKey:null});
export function createWalletAuth({db,origin,now,inspect}) {
  const stamp=()=>now().toISOString();
  const active=async user=>db.prepare('SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=TRUE').get(user.token_hash,stamp());
  async function disconnect(user) {
    await transaction(db,async()=>{
      await db.prepare('DELETE FROM wallet_challenges WHERE session_hash=?').run(user.token_hash);
      await db.prepare('DELETE FROM wallet_sessions WHERE session_hash=?').run(user.token_hash);
    });return blank();
  }
  async function status(user) {
    if(!user)return blank();
    const row=await db.prepare('SELECT * FROM wallet_sessions WHERE session_hash=? AND authenticated_at IS NOT NULL AND expires_at>?').get(user.token_hash,stamp());
    if(!row)return blank();
    const observation=row.observation_json?JSON.parse(row.observation_json):null;
    return {...blank(),address:row.address,chainId:MONAD_CHAIN_ID,contract:NFT_COLLECTION,walletAuthenticated:true,authenticatedAt:row.authenticated_at,expiresAt:row.expires_at,ownershipVerified:observation?.status==='HOLDER',tokenKey:observation?.tokenKey||null,observation,note:'Ownership is a timestamped RPC observation, not a guarantee of continued ownership. Court voting remains account-based.'};
  }
  async function challenge(user,body) {
    const address=walletAddress(body.address),tokenId=nftTokenId(body.tokenId),nonce=randomBytes(24).toString('hex');
    if(body.chainId!==MONAD_CHAIN_ID)fail(422,'WRONG_NETWORK','Connect to Monad mainnet (chain ID 143).');
    const issued=stamp(),expiresAt=new Date(+now()+300000).toISOString();
    const message=`${new URL(origin).host} wants you to sign in with your Ethereum account:\n${getAddress(address)}\n\nAuthenticate your Chog Court session and check Chog Genesis ownership. No transaction, approval, or payment.\n\nURI: ${origin}\nVersion: 1\nChain ID: 143\nNonce: ${nonce}\nIssued At: ${issued}\nExpiration Time: ${expiresAt}\nRequest ID: ${user.id}\nResources:\n- urn:chogcourt:collection:143:${NFT_COLLECTION}${tokenId===null?'':`\n- urn:chogcourt:token:${tokenId}`}`;
    await transaction(db,async()=>{
      await db.prepare('DELETE FROM wallet_challenges WHERE expires_at<=?').run(issued);
      await db.prepare('DELETE FROM wallet_challenges WHERE session_hash=?').run(user.token_hash);
      await db.prepare('DELETE FROM wallet_sessions WHERE session_hash=?').run(user.token_hash);
      await db.prepare('INSERT INTO wallet_sessions(session_hash,generation,address,token_id) VALUES(?,?,?,?)').run(user.token_hash,nonce,address,tokenId);
      await db.prepare('INSERT INTO wallet_challenges VALUES(?,?,?,?)').run(user.token_hash,nonce,message,expiresAt);
    });
    return {challengeId:nonce,message,expiresAt,address,chainId:MONAD_CHAIN_ID};
  }
  async function save(user,row,result,deadline) {
    return transaction(db,async()=>{
      if(!await active(user)||+now()>=Date.parse(deadline))fail(401,'WALLET_EXPIRED','Wallet authentication expired. Sign again.');
      const key=result.status==='HOLDER'&&result.ownsToken?tokenKey({chainId:MONAD_CHAIN_ID,collectionAddress:NFT_COLLECTION,tokenId:row.token_id}):null;
      const observation={...result,tokenKey:key,checkedAt:stamp(),source:'monad-rpc',walletAuthenticated:true,ownershipVerified:result.status==='HOLDER',eligible:false};
      const changed=await db.prepare('UPDATE wallet_sessions SET authenticated_at=coalesce(authenticated_at,?),expires_at=?,observation_json=? WHERE session_hash=? AND generation=?').run(stamp(),row.expires_at||new Date(+now()+3600000).toISOString(),JSON.stringify(observation),user.token_hash,row.generation);
      if(!changed.changes)fail(409,'WALLET_CHANGED','Wallet session changed while checking. Reconnect and try again.');
      if(key)await saveVerifiedTokenAsync(db,{chainId:MONAD_CHAIN_ID,collectionAddress:NFT_COLLECTION,tokenId:row.token_id,owner:row.address,verified:true,verifiedAt:stamp(),verificationSource:`monad-rpc:${result.blockNumber}:${result.blockHash}`});
      return status(user);
    });
  }
  async function verify(user,body) {
    if(typeof body.challengeId!=='string'||!/^[a-f0-9]{48}$/.test(body.challengeId)||typeof body.signature!=='string'||!/^0x(?:[0-9a-f]{128}|[0-9a-f]{130})$/i.test(body.signature))fail(422,'INVALID_SIGNATURE','Provide the wallet signature for this challenge.');
    const c=await db.prepare('DELETE FROM wallet_challenges WHERE session_hash=? AND nonce=? RETURNING *').get(user.token_hash,body.challengeId);
    if(!c||Date.parse(c.expires_at)<=+now())fail(401,'CHALLENGE_EXPIRED','Challenge expired, used, or belongs to another session. Sign a new challenge.');
    const row=await db.prepare('SELECT * FROM wallet_sessions WHERE session_hash=? AND generation=?').get(user.token_hash,c.nonce);
    if(!row)fail(409,'WALLET_CHANGED','Wallet session changed. Reconnect.');
    let signer;try{signer=verifyMessage(c.message,body.signature).toLowerCase();}catch{fail(401,'INVALID_SIGNATURE','Wallet signature is invalid. No ownership was verified.');}
    if(signer!==row.address)fail(401,'INVALID_SIGNATURE','The signature does not match the connected wallet.');
    const result=await inspect(row.address,row.token_id);
    return save(user,row,result,c.expires_at);
  }
  async function recheck(user) {
    const current=await status(user);if(!current.walletAuthenticated)fail(401,'WALLET_AUTH_REQUIRED','Sign a wallet challenge before rechecking ownership.');
    const generation=randomBytes(24).toString('hex');
    const row=await db.prepare('UPDATE wallet_sessions SET generation=?,observation_json=NULL WHERE session_hash=? RETURNING *').get(generation,user.token_hash);
    const result=await inspect(row.address,row.token_id);
    return save(user,row,result,row.expires_at);
  }
  return {challenge,verify,recheck,disconnect,status};
}
