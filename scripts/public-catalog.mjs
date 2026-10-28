import fs from 'node:fs/promises';
import { IMAGE_BASE_URL, imageExtension } from './images.mjs';
import { serialize, checksum } from './catalog.mjs';
import { prioritizeGifts, readCatalogPriority } from './catalog-order.mjs';

const root = new URL('../', import.meta.url);
export function imageFilename(gift, extension = 'webp') {
  const slug = gift.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '') || 'gift';
  return `${slug}-${gift.giftId}.${extension}`;
}

export async function publicCatalog(gifts) {
  const result = [];
  for (const gift of gifts) {
    let image = '';
    if (gift.giftImageUrl) {
      if (!gift.giftImageUrl.startsWith(`${IMAGE_BASE_URL}images/`)) throw new Error('Public export requires mirrored images');
      const path = gift.giftImageUrl.slice(IMAGE_BASE_URL.length);
      if (!/^images\/[a-f0-9]{64}\.(webp|png|jpg|gif)$/.test(path)) throw new Error('Invalid mirrored image path');
      const bytes = await fs.readFile(new URL(path, root));
      image = imageFilename(gift, imageExtension(bytes));
      const destination = new URL(`images/${image}`, root);
      let existing;
      try { existing = await fs.readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!existing?.equals(bytes)) await fs.writeFile(destination, bytes);
    }
    result.push({ giftId: gift.giftId, name: gift.name, points: gift.points, image });
  }
  return prioritizeGifts(result, (await readCatalogPriority()).giftIds);
}

export async function publish(gifts, publicGifts, manifest) {
  const details = serialize(gifts), body = serialize(publicGifts);
  manifest.schemaVersion = 2;
  manifest.ordering = (await readCatalogPriority()).metadata;
  manifest.catalog = { path: 'catalog/all.json', count: publicGifts.length, sha256: checksum(body) };
  manifest.details = { path: 'catalog/details.json', sha256: checksum(details) };
  manifest.images.publicBaseUrl = `${IMAGE_BASE_URL}images/`;
  manifest.images.publicFileCount = publicGifts.filter(gift => gift.image).length;
  for (const [path, text] of [['catalog/details.json', details], ['catalog/all.json', body]]) {
    await fs.writeFile(new URL(`${path}.tmp`, root), text);
    await fs.rename(new URL(`${path}.tmp`, root), new URL(path, root));
  }
  await fs.writeFile(new URL('manifest.json', root), serialize(manifest));
}
