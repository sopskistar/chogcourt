// Compatibility diagnostics only. This owner-supplied address is published as
// the fungible $CHOG token, not an authenticated Chog NFT collection. Never use
// a successful balanceOf(address) call here as NFT evidence: ERC-20 shares it.
export const MONAD_CHAIN_ID=143;
export const OWNER_COLLECTION_REFERENCE='0x350035555e10d9afaf1566aaebfced5ba6c27777';
export const NFT_BLOCKER='The supplied address is published as the $CHOG fungible token. An authoritative Chog NFT collection address and signed wallet authentication are still required. NFT jury access remains unavailable.';
const error=(code,message)=>Object.assign(Error(message),{status:503,code});

export function createWalletInspector({rpcUrl=process.env.MONAD_RPC_URL||'https://rpc.monad.xyz',fetchImpl=fetch}={}) {
  const endpoint=new URL(rpcUrl);
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw Error('MONAD_RPC_URL must be an HTTPS endpoint without embedded username/password.');
  return async function inspect(address) {
    if(typeof address!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(address))throw Object.assign(Error('Provide a valid wallet address.'),{status:422,code:'INVALID_ADDRESS'});
    const signal=AbortSignal.timeout(8000);let nextId=0;
    async function rpc(method,params) {
      const id=++nextId;
      try {
        const response=await fetchImpl(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal,redirect:'error'});
        if(!response.ok)throw Error('RPC HTTP failure');
        const data=await response.json();
        if(data.id!==id||data.jsonrpc!=='2.0')throw Error('Invalid RPC envelope');
        if(data.error){if(data.error.code===3)throw error('CONTRACT_REVERT','The contract rejected the NFT interface check.');throw Error('RPC rejected request');}
        if(!Object.hasOwn(data,'result'))throw Error('Missing RPC result');
        return data.result;
      }catch(e){if(e.code==='CONTRACT_REVERT')throw e;throw error('RPC_UNAVAILABLE','Monad RPC is unavailable or returned an invalid response. Ownership was not verified. Retry later.');}
    }
    const chain=await rpc('eth_chainId',[]);
    if(typeof chain!=='string'||!/^0x[0-9a-f]+$/i.test(chain)||BigInt(chain)!==143n)throw error('WRONG_RPC_NETWORK','The RPC endpoint did not identify Monad mainnet (143). Ownership was not checked.');
    const block=await rpc('eth_getBlockByNumber',['latest',false]);
    if(!block||!/^0x[0-9a-f]+$/i.test(block.number)||!/^0x[0-9a-f]{64}$/i.test(block.hash))throw error('RPC_UNAVAILABLE','Monad RPC did not provide a valid block reference.');
    const base={address:address.toLowerCase(),chainId:MONAD_CHAIN_ID,contract:OWNER_COLLECTION_REFERENCE,blockNumber:block.number,blockHash:block.hash,ownershipVerified:false,walletAuthenticated:false,eligible:false,collectionTrusted:false};
    const code=await rpc('eth_getCode',[OWNER_COLLECTION_REFERENCE,block.number]);
    if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(code))throw error('RPC_UNAVAILABLE','Monad RPC returned invalid contract code.');
    if(code==='0x')return {...base,status:'NO_CONTRACT',message:'No contract exists at the supplied address at this block. NFT ownership was not checked.'};
    const word=n=>'0x'+n.toString(16).padStart(64,'0');
    async function supports(interfaceId) {
      const result=await rpc('eth_call',[{to:OWNER_COLLECTION_REFERENCE,data:'0x01ffc9a7'+interfaceId.padEnd(64,'0')},block.number]);
      if(result!==word(0)&&result!==word(1))throw error('RPC_UNAVAILABLE','The NFT interface response is malformed. Ownership was not verified.');
      return result===word(1);
    }
    let compatible=false;
    try{compatible=await supports('01ffc9a7')&&!await supports('ffffffff')&&await supports('80ac58cd');}
    catch(e){if(e.code!=='CONTRACT_REVERT')throw e;}
    // Interface support alone cannot establish official collection identity or
    // authenticate the caller. Even a changed/proxied contract cannot unlock it.
    return {...base,status:compatible?'COLLECTION_IDENTITY_CONFLICT':'NOT_ERC721',erc721Compatible:compatible,message:compatible?NFT_BLOCKER:'The supplied contract did not pass the ERC-165/ERC-721 NFT checks. '+NFT_BLOCKER};
  };
}
