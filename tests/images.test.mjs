import test from 'node:test';
import assert from 'node:assert/strict';
import { imageExtension, imagePathValid } from '../scripts/images.mjs';
test('Reject HTML and recognize supported image signatures', () => {
  assert.throws(() => imageExtension(Buffer.from('<html>not an image</html>')));
  assert.equal(imageExtension(Buffer.from('524946460000000057454250', 'hex')), 'webp');
  assert.equal(imageExtension(Buffer.from('89504e470d0a1a0a', 'hex')), 'png');
  assert.equal(imageExtension(Buffer.from('ffd8ff', 'hex')), 'jpg');
  assert.equal(imageExtension(Buffer.from('GIF89a')), 'gif');
});
test('Mirror paths must match the content hash and stay in images/', () => {
  const hash = 'a'.repeat(64);
  const entry = { path: `images/${hash}.webp`, sha256: hash, bytes: 100 };
  assert.equal(imagePathValid(entry), true);
  assert.equal(imagePathValid({...entry, path: '../README.md'}), false);
  assert.equal(imagePathValid({...entry, path: `images/${'b'.repeat(64)}.webp`}), false);
  assert.equal(imagePathValid({...entry, bytes: 6 * 1024 * 1024}), false);
});
