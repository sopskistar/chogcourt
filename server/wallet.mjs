// Official mint.chog.xyz configuration and its linked OpenSea collection agree.
// Read-only ownership observations; authentication is handled in wallet-auth.mjs.
export const MONAD_CHAIN_ID=143;
export const NFT_COLLECTION='0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763';
export const NFT_BLOCKER='Chog Genesis identity verification is available in Account. NFT-only jury policy and $CHOG nominations remain disabled; existing account voting rules are unchanged.';
const error=(code,message)=>Object.assign(Error(message),{status:503,code});
export function walletAddress(value) {
  if(typeof value!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(value)||/^0x0{40}$/i.test(value))throw Object.assign(Error('Provide a nonzero wallet address.'),{status:422,code:'INVALID_ADDRESS'});
  return value.toLowerCase();
}
export function nftTokenId(value) {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||!/^\d{1,78}$/.test(value)||BigInt(value)>=2n**256n)throw Object.assign(Error('Token ID must be a decimal uint256 string, not an artwork name.'),{status:422,code:'INVALID_TOKEN_ID'});
  return BigInt(value).toString();
}

export function createWalletInspector({rpcUrl=process.env.MONAD_RPC_URL||'https://rpc.monad.xyz',fetchImpl=fetch}={}) {
  const endpoint=new URL(rpcUrl);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw Error('MONAD_RPC_URL must be an HTTPS endpoint without embedded username/password.');
  return async function inspect(address,tokenId=null) {
    address=walletAddress(address);tokenId=nftTokenId(tokenId);
    const signal=AbortSignal.timeout(8000);let nextId=0;
    async function rpc(method,params) {
      const id=++nextId;
      try {
        const response=await fetchImpl(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal,redirect:'error'});
        if(!response.ok)throw Error('RPC HTTP failure');
        const data=await response.json();
        if(data.id!==id||data.jsonrpc!=='2.0')throw Error('Invalid RPC envelope');
        if(data.error){if(data.error.code===3)throw error('CONTRACT_REVERT','The NFT contract rejected this read. Check the token ID and retry.');throw Error('RPC rejected request');}
        if(!Object.hasOwn(data,'result'))throw Error('Missing RPC result');
        return data.result;
      }catch(e){if(e.code==='CONTRACT_REVERT')throw e;throw error('RPC_UNAVAILABLE','Monad RPC is unavailable or returned an invalid response. Ownership was not verified. Retry later.');}
    }
    const chain=await rpc('eth_chainId',[]);
    if(typeof chain!=='string'||!/^0x[0-9a-f]+$/i.test(chain)||BigInt(chain)!==143n)throw error('WRONG_RPC_NETWORK','The RPC endpoint did not identify Monad mainnet (143). Ownership was not checked.');
    const block=await rpc('eth_getBlockByNumber',['latest',false]);
    if(!block||!/^0x[0-9a-f]+$/i.test(block.number)||!/^0x[0-9a-f]{64}$/i.test(block.hash))throw error('RPC_UNAVAILABLE','Monad RPC did not provide a valid block reference.');
    const base={address,chainId:MONAD_CHAIN_ID,contract:NFT_COLLECTION,blockNumber:block.number,blockHash:block.hash,ownershipVerified:false,walletAuthenticated:false,eligible:false,collectionTrusted:true,tokenId};
    const code=await rpc('eth_getCode',[NFT_COLLECTION,block.number]);
    if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(code))throw error('RPC_UNAVAILABLE','Monad RPC returned invalid contract code.');
    if(code==='0x')throw error('NO_CONTRACT','Chog Genesis contract code was not found. Ownership could not be checked.');
    const word=n=>'0x'+n.toString(16).padStart(64,'0');
    async function supports(interfaceId) {
      const result=await rpc('eth_call',[{to:NFT_COLLECTION,data:'0x01ffc9a7'+interfaceId.padEnd(64,'0')},block.number]);
      if(result!==word(0)&&result!==word(1))throw error('RPC_UNAVAILABLE','The NFT interface response is malformed. Ownership was not verified.');
      return result===word(1);
    }
    let compatible=false;
    try{compatible=await supports('01ffc9a7')&&!await supports('ffffffff')&&await supports('80ac58cd');}
    catch(e){if(e.code!=='CONTRACT_REVERT')throw e;}
    if(!compatible)throw error('NOT_ERC721','The collection did not pass ERC-165/ERC-721 checks. Ownership was not verified.');
    const uint=async data=>{
      const result=await rpc('eth_call',[{to:NFT_COLLECTION,data},block.number]);
      if(typeof result!=='string'||!/^0x[0-9a-f]{64}$/i.test(result))throw error('RPC_UNAVAILABLE','Malformed NFT ownership response. Retry later.');
      return result;
    };
    const balance=BigInt(await uint('0x70a08231'+address.slice(2).padStart(64,'0'))).toString();
    let tokenOwner=null;
    if(tokenId!==null){
      const result=await uint('0x6352211e'+BigInt(tokenId).toString(16).padStart(64,'0'));
      if(!/^0x0{24}[0-9a-f]{40}$/i.test(result)||BigInt(result)===0n)throw error('RPC_UNAVAILABLE','Malformed NFT owner address.');
      tokenOwner='0x'+result.slice(-40).toLowerCase();
    }
    // Ensure all number-pinned reads still belong to the observed block.
    const confirmed=await rpc('eth_getBlockByNumber',[block.number,false]);
    if(confirmed?.hash!==block.hash)throw error('RPC_UNAVAILABLE','Monad block changed during verification. Retry.');
    const holder=BigInt(balance)>0n,ownsToken=tokenId!==null&&tokenOwner===address;
    const status=!holder?'NOT_HOLDER':tokenId!==null&&!ownsToken?'TOKEN_NOT_OWNED':'HOLDER';
    return {...base,status,erc721Compatible:true,balance,tokenOwner,ownsToken,holder,message:status==='HOLDER'?'Chog Genesis ownership read succeeded.':status==='NOT_HOLDER'?'No Chog Genesis NFT is held by this wallet at the observed block.':'This wallet does not own the selected token ID.'};
  };
}
