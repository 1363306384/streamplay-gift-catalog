import fs from 'node:fs/promises';
import { checksum, serialize } from './catalog.mjs';

export const IMAGE_BASE_URL = 'https://raw.githubusercontent.com/1363306384/streamplay-gift-catalog/main/';
const root = new URL('../', import.meta.url);
const hosts = new Set(['p16-webcast.tiktokcdn.com', 'updates.devkit.sh']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageExtension(bytes) {
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'gif';
  throw new Error('Image response is not a supported image');
}

export function imagePathValid(entry) {
  return entry && /^[a-f0-9]{64}$/.test(entry.sha256) &&
    new RegExp(`^images/${entry.sha256}\\.(webp|png|jpg|gif)$`).test(entry.path) &&
    Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= MAX_IMAGE_BYTES;
}

async function readIndex(path) {
  try { return JSON.parse(await fs.readFile(new URL(path, root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

async function validLocal(entry) {
  if (!imagePathValid(entry)) return false;
  try {
    const bytes = await fs.readFile(new URL(entry.path, root));
    return bytes.length === entry.bytes && checksum(bytes) === entry.sha256 && entry.path.endsWith(`.${imageExtension(bytes)}`);
  } catch { return false; }
}

async function download(sourceUrl) {
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.has(url.hostname)) throw new Error('Image host is not configured for mirroring');
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Image HTTP ${response.status}`);
      if (!response.headers.get('content-type')?.startsWith('image/')) throw new Error('Image response has incorrect content type');
      if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw new Error('Image too large');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > MAX_IMAGE_BYTES) { await response.body.cancel().catch(() => {}); throw new Error('Image too large'); }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const sha256 = checksum(bytes), extension = imageExtension(bytes), path = `images/${sha256}.${extension}`;
      await fs.writeFile(new URL(path, root), bytes);
      return { path, sha256, bytes: bytes.length };
    } catch (error) { lastError = error; }
  }
  throw new Error(lastError?.message ?? 'Image download failed');
}

/** Download first, then update catalog URLs only when every referenced image is available. */
export async function mirrorImages(gifts) {
  await fs.mkdir(new URL('images/', root), { recursive: true });
  await fs.mkdir(new URL('.cache/', root), { recursive: true });
  const published = await readIndex('catalog/image-index.json');
  const index = { ...published, ...await readIndex('.cache/image-index.json') };
  const sources = [...new Set(gifts.map(g => g.giftImageUrl).filter(Boolean))];
  const localByPath = new Map(Object.values(index).filter(imagePathValid).map(entry => [entry.path, entry]));
  const failures = []; let cursor = 0, completed = 0, downloaded = 0;
  const resolved = new Map();
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (cursor < sources.length) {
      const source = sources[cursor++];
      try {
        if (source.startsWith(IMAGE_BASE_URL)) {
          const entry = localByPath.get(source.slice(IMAGE_BASE_URL.length));
          if (!await validLocal(entry)) throw new Error('Local image is missing or corrupt');
          resolved.set(source, entry);
        } else {
          let entry = index[source];
          if (!await validLocal(entry)) { entry = await download(source); downloaded++; }
          index[source] = entry;
          resolved.set(source, entry);
        }
      } catch (error) { failures.push({ source, reason: error.message }); }
      completed++;
      if (completed % 200 === 0) console.log(JSON.stringify({ imageProgress: completed, total: sources.length, failures: failures.length }));
    }
  }));
  // Keep partial downloads resumable without publishing partial catalog metadata.
  await fs.writeFile(new URL('.cache/image-index.json', root), serialize(index));
  if (failures.length) {
    await fs.writeFile(new URL('.cache/image-failures.json', root), serialize(failures));
    throw new Error(`Image mirroring failed for ${failures.length} URLs; catalog retained. See .cache/image-failures.json`);
  }
  const orderedIndex = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
  const indexText = serialize(orderedIndex);
  await fs.writeFile(new URL('catalog/image-index.json.tmp', root), indexText);
  await fs.rename(new URL('catalog/image-index.json.tmp', root), new URL('catalog/image-index.json', root));
  const mirrored = gifts.map(gift => {
    if (!gift.giftImageUrl) return gift;
    const entry = resolved.get(gift.giftImageUrl), imageUrl = `${IMAGE_BASE_URL}${entry.path}`;
    return { ...gift, image: imageUrl, giftImageUrl: imageUrl };
  });
  const unique = new Map([...resolved.values()].map(entry => [entry.path, entry]));
  return { gifts: mirrored, metadata: { hosting: 'github', baseUrl: IMAGE_BASE_URL, directory: 'images/',
    count: unique.size, totalBytes: [...unique.values()].reduce((sum, entry) => sum + entry.bytes, 0),
    index: { path: 'catalog/image-index.json', sha256: checksum(indexText) } }, downloaded };
}
