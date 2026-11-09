import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { serialize, checksum, id } from './catalog.mjs';

const countries = ['AE', 'JP'];
export const studioCatalogPath = 'catalog/studio.json';

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

export function studioCatalog(gifts, imageHashes, regionalIds) {
  const known = new Set(gifts.map(gift => gift.giftId));
  const regions = Object.fromEntries(countries.map(country => {
    const ids = regionalIds?.[country];
    if (!Array.isArray(ids) || ids.some(value => typeof value !== 'string' || id(value) !== value)) {
      throw new Error('Invalid regional gift IDs');
    }
    const matched = [...new Set(ids.filter(value => known.has(value)))].sort((a, b) => Number(a) - Number(b));
    if (!matched.length) throw new Error('Regional catalog has no matching gift IDs');
    return [country, matched];
  }));
  const groups = groupedCatalog(gifts, imageHashes, []).map(group => group.giftIds);
  return { schemaVersion: 1, groups, regions };
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
    regions = await Promise.all(countries.map(async country => {
      const response = await fetch(`https://api.tik.tools/webcast/gifts_by_country?country=${country}`, {
        headers: { 'x-api-key': key }, redirect: 'error', signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error('Regional catalog unavailable');
      const payload = await response.json();
      if (!payload || payload.error || payload.success === false ||
          (payload.status_code !== undefined && String(payload.status_code) !== '0') ||
          payload.is_sample || payload.data?.is_sample || payload.source === 'sample' ||
          payload.data?.source === 'sample' || (payload.country ?? payload.data?.country) !== country) {
        throw new Error('Regional catalog invalid');
      }
      return { country, valid: true, gifts: payload.data?.gifts };
    }));
  }
  const observedIds = {};
  for (const country of countries) {
    const region = regions.find(entry => entry?.country === country);
    if (!region?.valid || !Array.isArray(region.gifts) || !region.gifts.length || region.gifts.length > 20000) {
      throw new Error('Regional catalog missing');
    }
    observedIds[country] = region.gifts.map(gift => {
      const value = gift?.id ?? gift?.giftId;
      return typeof value === 'number' || typeof value === 'string' ? id(value) : null;
    });
  }
  const studio = studioCatalog(gifts, hashes, observedIds);
  const outputs = [];
  for (const country of countries) {
    const grouped = groupedCatalog(gifts, hashes, studio.regions[country]);
    const flattened = grouped.flatMap(group => group.giftIds);
    if (flattened.length !== gifts.length || new Set(flattened).size !== gifts.length) {
      throw new Error('Regional export lost gift IDs');
    }
    outputs.push([`catalog/${country.toLowerCase()}.json`, serialize(grouped)]);
    console.log(JSON.stringify({
      country, cards: grouped.length, giftIds: flattened.length,
      priorityIds: studio.regions[country].length,
      regionalIdsOutsideBase: new Set(observedIds[country].filter(id => !hashes.has(id))).size
    }));
  }
  const studioBody = `${JSON.stringify(studio)}\n`;
  outputs.push([studioCatalogPath, studioBody]);
  const manifestUrl = new URL('manifest.json', root);
  const manifest = JSON.parse(await fs.readFile(manifestUrl, 'utf8'));
  const baseVersion = Number(process.env.GIFT_CATALOG_BASE_VERSION ?? manifest.version);
  if (!Number.isSafeInteger(manifest.version) || !Number.isSafeInteger(baseVersion) ||
      baseVersion < 0 || baseVersion > manifest.version) {
    throw new Error('Invalid starting catalog version');
  }
  const studioDescriptor = { path: studioCatalogPath, sha256: checksum(studioBody) };
  const changed = [];
  for (const [file, body] of outputs) {
    const destination = new URL(file, root);
    const previous = await fs.readFile(destination, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (previous !== body) changed.push([file, body]);
  }
  if (changed.length || JSON.stringify(manifest.studioCatalog) !== JSON.stringify(studioDescriptor)) {
    if (manifest.version === baseVersion) {
      manifest.version++;
      manifest.updatedAt = new Date().toISOString();
    }
    manifest.studioCatalog = studioDescriptor;
    changed.push(['manifest.json', serialize(manifest)]);
  }
  if(!original.equals(await fs.readFile(new URL('catalog/all.json',root)))) throw new Error('Original full catalog changed');
  for (const [file, body] of changed) await fs.writeFile(new URL(`${file}.tmp`, root), body);
  for (const [file] of changed) await fs.rename(new URL(`${file}.tmp`, root), new URL(file, root));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(()=>{console.error('Regional export failed; no provider payloads or credentials logged.');process.exitCode=1;});
