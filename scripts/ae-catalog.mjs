import { id, serialize, normalize } from './catalog.mjs';

export const AE_ENDPOINT = 'https://api.tik.tools/webcast/gifts_by_country?country=AE';

export function aeAdditions(payload, gifts) {
  const known = new Set(gifts.map(g => g.giftId)), additions = new Map();
  for (const row of payload?.data?.gifts ?? []) {
    const giftId = id(row?.id ?? row?.giftId);
    if (!giftId || known.has(giftId)) continue;
    const gift = normalize(row, 'tiktools');
    if (!gift || !gift.priceKnown || !gift.giftImageUrl) throw new Error('New AE gift lacks complete metadata');
    additions.set(giftId, gift);
  }
  return [...additions.values()];
}

export function prepareAeCatalog(payload, previous, gifts) {
  if (!payload || payload.error || payload.success === false || (payload.status_code !== undefined && String(payload.status_code) !== '0')) throw new Error('Invalid AE response');
  if (payload.is_sample || payload.source === 'sample' || payload.data?.is_sample || payload.data?.source === 'sample') throw new Error('AE sample rejected');
  if ((payload.country ?? payload.data?.country) !== 'AE') throw new Error('AE country mismatch');
  const rows = payload.data?.gifts;
  if (!Array.isArray(rows) || !rows.length || rows.length > 20000) throw new Error('Invalid AE list');
  const rawIds = rows.map(gift => id(gift?.id ?? gift?.giftId));
  if (rawIds.some(value => !value)) throw new Error('Invalid AE gift ID');
  const giftIds = [...new Set(rawIds)].sort((a,b) => Number(a)-Number(b));
  if (previous?.giftIds?.length && giftIds.length < previous.giftIds.length * 0.8) throw new Error('AE count dropped more than 20%');
  const known = new Set(gifts.map(gift => gift.giftId));
  if (giftIds.some(value => !known.has(value))) throw new Error('AE gifts missing from full catalog');
  // Keep publication stable if membership and provider are unchanged; check time lives in run logs.
  if (previous?.source === AE_ENDPOINT && serialize(previous.giftIds) === serialize(giftIds)) return previous;
  return { schemaVersion:1, label:'United Arab Emirates priority', regions:['AE'], scope:'regional-catalog-membership-not-exclusive',
    source:AE_ENDPOINT, checkedAt:new Date().toISOString(), samples:[{region:'AE',count:giftIds.length,matchedCount:giftIds.length}],giftIds,unresolvedIds:[] };
}
