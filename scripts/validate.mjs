import fs from 'node:fs/promises';
import { validate, checksum } from './catalog.mjs';
import { IMAGE_BASE_URL, imagePathValid, imageExtension } from './images.mjs';
const root = new URL('../', import.meta.url);
const text = await fs.readFile(new URL('catalog/all.json', root), 'utf8');
const gifts = JSON.parse(text), manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
validate(gifts);
if (manifest.catalog.count !== gifts.length || manifest.catalog.sha256 !== checksum(text)) throw new Error('Manifest does not match catalog');
if (manifest.images.hosting === 'github') {
  const indexText = await fs.readFile(new URL('catalog/image-index.json', root), 'utf8');
  if (checksum(indexText) !== manifest.images.index.sha256) throw new Error('Image index checksum mismatch');
  const index = JSON.parse(indexText), byPath = new Map(Object.values(index).map(entry => [entry.path, entry]));
  const used = new Set(); let totalBytes = 0;
  for (const gift of gifts) {
    if (!gift.giftImageUrl) continue;
    if (!gift.giftImageUrl.startsWith(IMAGE_BASE_URL)) throw new Error('Catalog still contains an external image URL');
    const path = gift.giftImageUrl.slice(IMAGE_BASE_URL.length), entry = byPath.get(path);
    if (!imagePathValid(entry)) throw new Error('Missing or invalid local image entry');
    if (!used.has(path)) {
      const bytes = await fs.readFile(new URL(path, root));
      if (bytes.length !== entry.bytes || checksum(bytes) !== entry.sha256 || !path.endsWith(`.${imageExtension(bytes)}`)) throw new Error('Local image is corrupt');
      used.add(path); totalBytes += bytes.length;
    }
  }
  if (used.size !== manifest.images.count || totalBytes !== manifest.images.totalBytes) throw new Error('Image totals do not match manifest');
}
for (const [region, info] of Object.entries(manifest.regions)) {
  if (!/^[A-Z]{2}$/.test(region) || info.path !== `catalog/regions/${region}.json`) throw new Error('Invalid region path');
  const data = JSON.parse(await fs.readFile(new URL(info.path, root), 'utf8'));
  if (data.region !== region || !Array.isArray(data.giftIds) || data.giftIds.length !== new Set(data.giftIds).size) throw new Error('Invalid region catalog');
  const ids = new Set(gifts.map(gift => gift.giftId));
  if (data.giftIds.some(id => !ids.has(id))) throw new Error('Region contains unknown gift IDs');
}
console.log(JSON.stringify({ valid: true, count: gifts.length, regions: Object.keys(manifest.regions), target: gifts.filter(g => g.giftId === '1374236').map(g => ({giftId:g.giftId,name:g.name,points:g.points})) }));
