import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { serialize, checksum } from './catalog.mjs';

export function groupedCatalog(gifts, imageHashes, regionalIds) {
  const priority = new Set(regionalIds), groups = new Map();
  for (const gift of gifts) {
    const image = imageHashes.get(gift.giftId);
    if (!image) throw new Error('Missing verified image identity');
    const key = JSON.stringify([gift.name.trim(), gift.points, image]);
    const group = groups.get(key) ?? [];
    group.push(gift); groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    group.sort((a,b) => Number(priority.has(b.giftId))-Number(priority.has(a.giftId)) || Number(a.giftId)-Number(b.giftId));
    const first=group[0];
    return { giftIds:group.map(g=>g.giftId), name:first.name, points:first.points, image:first.image };
  }).sort((a,b) => Number(b.giftIds.some(id=>priority.has(id)))-Number(a.giftIds.some(id=>priority.has(id)))
    || (a.points??Infinity)-(b.points??Infinity) || a.name.localeCompare(b.name,'en') || Number(a.giftIds[0])-Number(b.giftIds[0]));
}

async function main() {
  const root=new URL('../',import.meta.url);
  const original=await fs.readFile(new URL('catalog/all.json',root));
  const gifts=JSON.parse(original), hashes=new Map();
  for(const gift of gifts) hashes.set(gift.giftId,checksum(await fs.readFile(new URL(`images/${gift.image}`,root))));
  const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9);
  let regions;
  if(source) regions=JSON.parse(await fs.readFile(source,'utf8'));
  else {
    const key=process.env.TIKTOOLS_API_KEY?.trim();
    if(!key) throw new Error('Configure catalog provider credential');
    regions=await Promise.all(['AE','JP'].map(async country=>{
      const response=await fetch(`https://api.tik.tools/webcast/gifts_by_country?country=${country}`,{headers:{'x-api-key':key},redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok) throw new Error('Regional catalog unavailable');
      const payload=await response.json();
      if(payload.error||payload.success===false||payload.is_sample||payload.data?.is_sample||payload.source==='sample'||payload.data?.source==='sample'||(payload.country??payload.data?.country)!==country) throw new Error('Regional catalog invalid');
      return {country,valid:true,gifts:payload.data?.gifts};
    }));
  }
  const outputs=[];
  for(const country of ['AE','JP']) {
    const region=regions.find(r=>r.country===country);
    if(!region?.valid||!Array.isArray(region.gifts)||!region.gifts.length) throw new Error('Regional catalog missing');
    const ids=region.gifts.map(g=>String(g.id??g.giftId));
    if(ids.some(id=>!/^[1-9]\d*$/.test(id))) throw new Error('Invalid regional gift ID');
    const grouped=groupedCatalog(gifts,hashes,ids), flattened=grouped.flatMap(g=>g.giftIds);
    if(flattened.length!==gifts.length||new Set(flattened).size!==gifts.length) throw new Error('Regional export lost gift IDs');
    outputs.push([`catalog/${country.toLowerCase()}.json`,serialize(grouped)]);
    console.log(JSON.stringify({country,cards:grouped.length,giftIds:flattened.length,priorityIds:gifts.filter(g=>ids.includes(g.giftId)).length,regionalIdsOutsideBase:new Set(ids.filter(id=>!hashes.has(id))).size}));
  }
  for(const [file,body] of outputs) await fs.writeFile(new URL(file,root),body);
  if(!original.equals(await fs.readFile(new URL('catalog/all.json',root)))) throw new Error('Original full catalog changed');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error('Regional export failed; no provider payloads or credentials logged.');process.exitCode=1;});
