import fs from 'node:fs/promises';
import { validate, checksum } from './catalog.mjs';
import { IMAGE_BASE_URL, imagePathValid, imageExtension } from './images.mjs';
import { imageFilename } from './public-catalog.mjs';
import { prioritizeGifts, readCatalogPriority } from './catalog-order.mjs';
const root = new URL('../', import.meta.url);
const text = await fs.readFile(new URL('catalog/all.json', root), 'utf8');
const publicGifts = JSON.parse(text), manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
const detailText = await fs.readFile(new URL(manifest.details.path, root), 'utf8');
if (checksum(detailText) !== manifest.details.sha256) throw new Error('Details checksum mismatch');
const gifts = JSON.parse(detailText);
validate(gifts);
if (manifest.catalog.count !== gifts.length || publicGifts.length !== gifts.length || manifest.catalog.sha256 !== checksum(text)) throw new Error('Manifest does not match catalog');
const detailsById = new Map(gifts.map(gift => [gift.giftId, gift]));
if (new Set(publicGifts.map(g => g.giftId)).size !== gifts.length) throw new Error('Duplicate public gift IDs');
for (const pub of publicGifts) {
  const gift = detailsById.get(pub.giftId);
  if (!gift) throw new Error('Public gift missing in details');
  if (JSON.stringify(Object.keys(pub)) !== JSON.stringify(['giftId', 'name', 'points', 'image']) || pub.giftId !== gift.giftId || pub.name !== gift.name || pub.points !== gift.points) throw new Error('Public catalog must contain exactly four matching fields');
  if (gift.giftImageUrl) {
    const canonical = await fs.readFile(new URL(gift.giftImageUrl.slice(IMAGE_BASE_URL.length), root));
    if (pub.image !== imageFilename(gift, imageExtension(canonical))) throw new Error('Public image filename mismatch');
    const alias = await fs.readFile(new URL(`images/${pub.image}`, root));
    if (!alias.equals(canonical)) throw new Error('Public image does not match source');
  } else if (pub.image !== '') throw new Error('Unexpected image filename');
}
const priority = await readCatalogPriority();
if (JSON.stringify(manifest.ordering) !== JSON.stringify(priority.metadata)) throw new Error('Catalog priority metadata mismatch');
if (priority.giftIds.some(id => !detailsById.has(id))) throw new Error('Priority references unknown gift');
if (JSON.stringify(publicGifts) !== JSON.stringify(prioritizeGifts(publicGifts, priority.giftIds))) throw new Error('Catalog priority order mismatch');
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
