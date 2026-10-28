import test from 'node:test';
import assert from 'node:assert/strict';
import { imageFilename } from '../scripts/public-catalog.mjs';
test('Readable gift filenames include ID and match the original convention', () => {
  assert.equal(imageFilename({giftId:'59881',name:'A Shard of Hope'}), 'a-shard-of-hope-59881.webp');
  assert.equal(imageFilename({giftId:'607157',name:'Spidey Pin'}), 'spidey-pin-607157.webp');
  assert.equal(imageFilename({giftId:'1',name:'../../hello'}), 'hello-1.webp');
  assert.equal(imageFilename({giftId:'2',name:'你好'}), 'gift-2.webp');
  assert.notEqual(imageFilename({giftId:'1',name:'Rose'}), imageFilename({giftId:'2',name:'Rose'}));
});
