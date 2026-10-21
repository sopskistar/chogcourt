export const CHOICES=Object.freeze(['GUILTY','INNOCENT','NOT_ENOUGH_EVIDENCE']);
export function verdictFrom(votes,quorum) {
  const totals=CHOICES.map(choice=>votes.filter(v=>v.choice===choice).length),total=votes.length;
  const max=Math.max(...totals),winners=totals.map((n,i)=>n===max?i:-1).filter(i=>i>=0);
  const reason=total<quorum?'INSUFFICIENT_QUORUM':winners.length!==1?'TIE':'PLURALITY';
  return {outcome:reason==='PLURALITY'?CHOICES[winners[0]]:'NOT_ENOUGH_EVIDENCE',reason,total,guilty:totals[0],innocent:totals[1],insufficient:totals[2],min_quorum:quorum};
}
export function participationStats(votes,evidenceCases=0,now=new Date()) {
  const day=value=>new Date(value).toISOString().slice(0,10),previous=value=>day(Date.parse(value+'T00:00:00Z')-86400000);
  const days=[...new Set(votes.map(v=>day(v.created_at)))].sort(),set=new Set(days),today=day(now);
  let anchor=set.has(today)?today:previous(today),current=0,longest=0,run=0,last=null;
  while(set.has(anchor)){current++;anchor=previous(anchor);}
  for(const d of days){run=last===previous(d)?run+1:1;longest=Math.max(longest,run);last=d;}
  return {votes:votes.length,current,longest,badges:[votes.length>=1,votes.length>=5,longest>=3],evidenceCases,score:Math.min(100,10*votes.length+5*evidenceCases)};
}
export function tokenKey({chainId,collectionAddress,tokenId}={}) {
  if(!/^[1-9]\d*$/.test(String(chainId))||!/^0x[0-9a-fA-F]{40}$/.test(collectionAddress||'')||!/^\d+$/.test(String(tokenId))) return null;
  return `eip155:${BigInt(chainId)}:erc721:${collectionAddress.toLowerCase()}/${BigInt(tokenId)}`;
}
// No public endpoint may create verified records from client-supplied claims.
// Future ownership adapters must independently verify the allowlisted collection
// and block reference, then pass evidence to this internal persistence boundary.
export function saveVerifiedToken(db,proof) {
  const key=tokenKey(proof);
  if(!key||proof.verified!==true||!proof.verificationSource||!proof.verifiedAt||!/^0x[0-9a-fA-F]{40}$/.test(proof.owner||'')) throw Error('Verified ownership evidence required');
  db.prepare(`INSERT INTO tokens(token_key,chain_id,collection_address,token_id,verified_at,verification_source,current_owner) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(token_key) DO UPDATE SET verified_at=excluded.verified_at,verification_source=excluded.verification_source,current_owner=excluded.current_owner`).run(key,String(BigInt(proof.chainId)),proof.collectionAddress.toLowerCase(),String(BigInt(proof.tokenId)),proof.verifiedAt,proof.verificationSource,proof.owner.toLowerCase());
  return key;
}
export async function saveVerifiedTokenAsync(db,proof) {
  const key=tokenKey(proof);
  if(!key||proof.verified!==true||!proof.verificationSource||!proof.verifiedAt||!/^0x[0-9a-fA-F]{40}$/.test(proof.owner||'')) throw Error('Verified ownership evidence required');
  await db.prepare(`INSERT INTO tokens(token_key,chain_id,collection_address,token_id,verified_at,verification_source,current_owner) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(token_key) DO UPDATE SET verified_at=excluded.verified_at,verification_source=excluded.verification_source,current_owner=excluded.current_owner`).run(key,String(BigInt(proof.chainId)),proof.collectionAddress.toLowerCase(),String(BigInt(proof.tokenId)),proof.verifiedAt,proof.verificationSource,proof.owner.toLowerCase());
  return key;
}
