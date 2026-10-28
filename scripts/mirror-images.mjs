import fs from 'node:fs/promises';
import { mirrorImages } from './images.mjs';
import { validate, serialize, checksum } from './catalog.mjs';
import { publicCatalog, publish } from './public-catalog.mjs';
import { readCatalogPriority } from './catalog-order.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
const gifts = JSON.parse(await fs.readFile(new URL(manifest.details?.path ?? 'catalog/all.json', root), 'utf8'));
validate(gifts);
const result = await mirrorImages(gifts);
validate(result.gifts);
const publicGifts = await publicCatalog(result.gifts);
const hash = checksum(serialize(publicGifts));
const metadata = { ...result.metadata, publicBaseUrl: `${result.metadata.baseUrl}images/`, publicFileCount: publicGifts.filter(g => g.image).length };
if (hash !== manifest.catalog.sha256 || checksum(serialize(result.gifts)) !== manifest.details?.sha256 || JSON.stringify(manifest.images) !== JSON.stringify(metadata) || JSON.stringify(manifest.ordering) !== JSON.stringify((await readCatalogPriority()).metadata)) {
  manifest.version++;
  manifest.updatedAt = new Date().toISOString();
  manifest.images = metadata;
  await publish(result.gifts, publicGifts, manifest);
}
console.log(JSON.stringify({ count: result.gifts.length, images: result.metadata.count, bytes: result.metadata.totalBytes, downloaded: result.downloaded, version: manifest.version }));
