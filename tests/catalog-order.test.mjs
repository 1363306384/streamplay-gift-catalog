import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeGifts } from '../scripts/catalog-order.mjs';
test('Regional membership comes before price, without dropping or modifying gifts', () => {
  const gifts = [{giftId:'1',name:'Other',points:1}, {giftId:'2',name:'Regional expensive',points:15000}, {giftId:'3',name:'Regional cheap',points:1}];
  const sorted = prioritizeGifts(gifts, ['2','3']);
  assert.deepEqual(sorted.map(g=>g.giftId), ['3','2','1']);
  assert.equal(sorted.length, gifts.length);
  assert.equal(sorted[1], gifts[1]);
  assert.equal(gifts[0].giftId, '1');
});
