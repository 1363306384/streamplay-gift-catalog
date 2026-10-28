import fs from 'node:fs/promises';
import { checksum } from './catalog.mjs';

export function prioritizeGifts(gifts, giftIds) {
  const priority = new Set(giftIds);
  return [...gifts].sort((a, b) => Number(priority.has(b.giftId)) - Number(priority.has(a.giftId))
    || (a.points ?? Infinity) - (b.points ?? Infinity)
    || a.name.localeCompare(b.name, 'en') || Number(a.giftId) - Number(b.giftId));
}

export async function readCatalogPriority() {
  const path = 'catalog/priority/middle-east.json';
  try {
    const text = await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const data = JSON.parse(text);
    if (!Array.isArray(data.giftIds) || !data.giftIds.length || data.giftIds.some(id => typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) || new Set(data.giftIds).size !== data.giftIds.length) throw new Error('Invalid catalog priority IDs');
    return { giftIds: data.giftIds, metadata: { path, sha256: checksum(text), regions: data.regions, priorityCount: data.giftIds.length, withinGroup: 'price-then-name' } };
  } catch (error) { if (error.code === 'ENOENT') return { giftIds: [], metadata: null }; throw error; }
}
