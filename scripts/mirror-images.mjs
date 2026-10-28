import fs from 'node:fs/promises';
import { mirrorImages } from './images.mjs';
import { validate, serialize, checksum } from './catalog.mjs';

const root = new URL('../', import.meta.url);
const gifts = JSON.parse(await fs.readFile(new URL('catalog/all.json', root), 'utf8'));
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
validate(gifts);
const result = await mirrorImages(gifts);
validate(result.gifts);
const body = serialize(result.gifts), hash = checksum(body);
if (hash !== manifest.catalog.sha256 || JSON.stringify(manifest.images) !== JSON.stringify(result.metadata)) {
  manifest.version++;
  manifest.updatedAt = new Date().toISOString();
  manifest.catalog.sha256 = hash;
  manifest.images = result.metadata;
  await fs.writeFile(new URL('catalog/all.json.tmp', root), body);
  await fs.rename(new URL('catalog/all.json.tmp', root), new URL('catalog/all.json', root));
  await fs.writeFile(new URL('manifest.json', root), serialize(manifest));
}
console.log(JSON.stringify({ count: result.gifts.length, images: result.metadata.count, bytes: result.metadata.totalBytes, downloaded: result.downloaded, version: manifest.version }));
