import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, providerGifts, merge, validate } from '../scripts/catalog.mjs';
const gift = (id, price = 1) => normalize({id,name:'Same name',diamond_count:price},'tiktools');
test('Distinct IDs survive identical names; duplicate IDs merge', () => {
  const data = merge([], [gift('1'), gift('2'), gift('1', 5)]);
  assert.equal(data.length, 2); assert.equal(data[0].points, 5); validate(data);
});
test('Unknown price does not overwrite known price; explicit zero does', () => {
  assert.equal(merge([gift('1', 10)], [gift('1', null)])[0].points, 10);
  assert.equal(merge([gift('1', 10)], [gift('1', 0)])[0].points, 0);
  assert.equal(gift('1', null).priceKnown, false);
});
test('Sample and invalid catalogs never become full catalogs', () => {
  for (const payload of [{source:'sample',data:{gifts:[{}]}},{status_code:1,data:{gifts:[{}]}},{data:{gifts:[]}}]) assert.throws(()=>providerGifts(payload));
});
test('Gifts absent from a refresh are retained for existing bindings', () => {
  assert.equal(merge([gift('1')],[gift('2')]).length,2);
});
test('Reject unsafe IDs and unsafe icons; valid remote URLs stay complete', () => {
  assert.equal(normalize({id:'9007199254740993',name:'unsafe'},'tiktools'),null);
  assert.equal(normalize({id:'1',name:'test',icon:'javascript:alert(1)'},'tiktools').image,'');
  const u='https://example.com/gift.webp?a=b';assert.equal(normalize({id:'1',name:'test',icon:u},'tiktools').image,u);
});
