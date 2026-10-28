import { createHash } from 'node:crypto';

export function id(value) {
  const text = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) return null;
  return String(Number(text));
}

function url(value) {
  if (typeof value !== 'string') return '';
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
}

export function normalize(raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const giftId = id(raw.id ?? raw.giftId);
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!giftId || !name) return null;
  const value = raw.diamond_count ?? raw.points;
  const priceKnown = raw.priceKnown !== false && (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  const image = url(raw.icon) || url(raw.icon_url) || url(raw.giftImageUrl) || url(raw.image)
    || (source === 'legacy' && typeof raw.image === 'string' && /^[\w.-]+$/.test(raw.image) ? `https://updates.devkit.sh/app/gifts/${raw.image}` : '');
  return { giftId, name, points: priceKnown ? Number(value) : null, priceKnown: Boolean(priceKnown), image, giftImageUrl: image,
    active: typeof raw.active === 'boolean' ? raw.active : null, source };
}

export function providerGifts(payload) {
  if (!payload || payload.error || payload.success === false || (payload.status_code !== undefined && String(payload.status_code) !== '0')) throw new Error('Provider returned an invalid catalog');
  if (payload.is_sample || payload.source === 'sample' || payload.data?.is_sample || payload.data?.source === 'sample') throw new Error('Sample catalog rejected');
  const rows = payload.data?.gifts ?? payload.gifts;
  if (!Array.isArray(rows) || !rows.length || rows.length > 20000) throw new Error('Invalid catalog size');
  const result = rows.map(row => normalize(row, 'tiktools')).filter(Boolean);
  if (result.length < rows.length * 0.95) throw new Error('Too many invalid gift entries');
  return result;
}

export function merge(previous, incoming) {
  const byId = new Map(previous.map(gift => [gift.giftId, gift]));
  for (const gift of incoming) {
    const old = byId.get(gift.giftId);
    byId.set(gift.giftId, { ...gift,
      ...(old && !gift.priceKnown && old.priceKnown ? { points: old.points, priceKnown: true } : {}),
      ...(!gift.giftImageUrl && old?.giftImageUrl ? { image: old.image, giftImageUrl: old.giftImageUrl } : {}) });
  }
  return [...byId.values()].sort((a, b) => Number(a.giftId) - Number(b.giftId));
}

export const serialize = value => `${JSON.stringify(value, null, 2)}\n`;
export const checksum = text => createHash('sha256').update(text).digest('hex');

export function validate(gifts) {
  if (!Array.isArray(gifts) || !gifts.length) throw new Error('Empty catalog');
  const ids = new Set();
  for (const gift of gifts) {
    if (!gift || id(gift.giftId) !== gift.giftId || ids.has(gift.giftId) || typeof gift.name !== 'string' || !gift.name.trim()) throw new Error('Invalid or duplicate gift ID/name');
    if (gift.priceKnown ? !Number.isSafeInteger(gift.points) || gift.points < 0 : gift.points !== null) throw new Error('Invalid price');
    if (![true, false, null].includes(gift.active) || !['tiktools', 'legacy'].includes(gift.source)) throw new Error('Invalid metadata');
    if (gift.image !== gift.giftImageUrl || (gift.giftImageUrl && !url(gift.giftImageUrl))) throw new Error('Invalid image URL');
    ids.add(gift.giftId);
  }
}
