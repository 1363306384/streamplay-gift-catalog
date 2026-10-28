import fs from 'node:fs/promises';
import { validate, checksum } from './catalog.mjs';
const root = new URL('../', import.meta.url);
const text = await fs.readFile(new URL('catalog/all.json', root), 'utf8');
const gifts = JSON.parse(text), manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
validate(gifts);
if (manifest.catalog.count !== gifts.length || manifest.catalog.sha256 !== checksum(text)) throw new Error('Manifest does not match catalog');
for (const [region, info] of Object.entries(manifest.regions)) {
  if (!/^[A-Z]{2}$/.test(region) || info.path !== `catalog/regions/${region}.json`) throw new Error('Invalid region path');
  const data = JSON.parse(await fs.readFile(new URL(info.path, root), 'utf8'));
  if (data.region !== region || !Array.isArray(data.giftIds) || data.giftIds.length !== new Set(data.giftIds).size) throw new Error('Invalid region catalog');
  const ids = new Set(gifts.map(gift => gift.giftId));
  if (data.giftIds.some(id => !ids.has(id))) throw new Error('Region contains unknown gift IDs');
}
console.log(JSON.stringify({ valid: true, count: gifts.length, regions: Object.keys(manifest.regions), target: gifts.filter(g => g.giftId === '1374236').map(g => ({giftId:g.giftId,name:g.name,points:g.points})) }));
