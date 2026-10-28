import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalize, providerGifts, merge, validate, serialize, checksum } from './catalog.mjs';
import { mirrorImages } from './images.mjs';
import { publicCatalog, publish } from './public-catalog.mjs';
import { readCatalogPriority } from './catalog-order.mjs';

const root = new URL('../', import.meta.url);
const read = async path => { try { return JSON.parse(await fs.readFile(new URL(path, root), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
async function fetchJson(endpoint, headers = {}) {
  const response = await fetch(endpoint, { headers: { accept: 'application/json', ...headers }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Catalog request failed: HTTP ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('Catalog response too large');
  return JSON.parse(text);
}

try {
  const key = process.env.TIKTOOLS_API_KEY?.trim();
  if (!key) throw new Error('Set TIKTOOLS_API_KEY in the environment');
  const oldManifest = await read('manifest.json');
  let previous = await read(oldManifest?.details?.path ?? 'catalog/all.json') ?? [];
  if (previous.length) validate(previous);
  // Only the initial migration reads the old source; subsequent syncs are independent of it.
  if (process.argv.includes('--bootstrap-legacy')) {
    if (previous.length) throw new Error('Legacy bootstrap is allowed only for an empty catalog');
    const legacy = await fetchJson('https://updates.devkit.sh/app/gifts/gifts.json');
    if (!Array.isArray(legacy) || !legacy.length) throw new Error('Invalid legacy catalog');
    previous = merge([], legacy.map(row => normalize(row, 'legacy')).filter(Boolean));
  }
  const incoming = merge([], providerGifts(await fetchJson('https://api.tik.tools/webcast/gift_info', { 'x-api-key': key })));
  const oldCount = oldManifest?.sources?.tiktools?.count;
  if (oldCount && incoming.length < oldCount * 0.8) throw new Error('Provider count fell by more than 20%; keeping published catalog');
  const mirrored = await mirrorImages(merge(previous, incoming));
  const gifts = mirrored.gifts;
  validate(gifts);
  const publicGifts = await publicCatalog(gifts);
  const hash = checksum(serialize(publicGifts));
  const metadata = { ...mirrored.metadata, publicBaseUrl: `${mirrored.metadata.baseUrl}images/`, publicFileCount: publicGifts.filter(g => g.image).length };
  if (oldManifest?.catalog?.sha256 === hash && oldManifest?.details?.sha256 === checksum(serialize(gifts)) && JSON.stringify(oldManifest.images) === JSON.stringify(metadata) && JSON.stringify(oldManifest.ordering) === JSON.stringify((await readCatalogPriority()).metadata)) {
    console.log(JSON.stringify({ status: 'unchanged', checkedAt: new Date().toISOString(), count: gifts.length }));
  } else {
    const manifest = { schemaVersion: 1, version: (oldManifest?.version ?? 0) + 1, updatedAt: new Date().toISOString(), scope: 'worldwide-reference',
      catalog: { path: 'catalog/all.json', count: gifts.length, sha256: hash }, regions: oldManifest?.regions ?? {},
      sources: { tiktools: { endpoint: 'https://api.tik.tools/webcast/gift_info', count: incoming.length }, legacy: { retainedOnly: gifts.filter(g => g.source === 'legacy').length, region: null } },
      images: metadata };
    // Publish metadata last; readers can validate the referenced file checksum.
    await publish(gifts, publicGifts, manifest);
    console.log(JSON.stringify({ status: 'updated', version: manifest.version, count: gifts.length, providerCount: incoming.length, root: fileURLToPath(root) }));
  }
} catch (error) {
  // Never print provider payloads, request headers, or credentials.
  console.error(error instanceof SyntaxError ? 'Catalog returned invalid JSON' : error.message.includes('HTTP') || /^(Set |Provider |Sample |Invalid |Empty |Too many |Legacy |Catalog )/.test(error.message) ? error.message : 'Catalog sync failed; published data retained');
  process.exitCode = 1;
}
