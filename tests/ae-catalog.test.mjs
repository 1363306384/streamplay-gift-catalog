import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAeCatalog } from '../scripts/ae-catalog.mjs';
test('Reject sudden AE shrink rather than replace a complete list with a partial result', () => {
  assert.throws(()=>prepareAeCatalog({country:'AE',data:{gifts:[{id:'1'}]}},{giftIds:['1','2','3','4','5']},[{giftId:'1'}]),/dropped/);
});
test('AE ID normalization preserves distinct gifts and removes duplicate IDs', () => {
  const result=prepareAeCatalog({country:'AE',data:{gifts:[{id:2},{id:'1'},{id:'2'}]}},null,[{giftId:'1'},{giftId:'2'}]);
  assert.deepEqual(result.giftIds,['1','2']);
});
