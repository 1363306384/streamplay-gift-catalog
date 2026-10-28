import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../', import.meta.url));
const webp = '524946460400000057454250';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'streamplay-catalog-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.join(repo, 'scripts'), path.join(root, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(root, 'catalog', 'priority'), { recursive: true });
  await fs.writeFile(path.join(root, 'catalog', 'priority', 'ae.json'), JSON.stringify({regions:['AE'],giftIds:['1']}));
  const preload = path.join(root, 'mock-fetch.mjs');
  await fs.writeFile(preload, `
    import fs from 'node:fs';
    globalThis.fetch = async (input, options) => {
      const url = String(input);
      if (url === 'https://api.tik.tools/webcast/gift_info') {
        if (options.headers['x-api-key'] !== 'test-key') throw Error('Missing authentication');
        return new Response(fs.readFileSync(process.env.FIXTURE_PAYLOAD, 'utf8'), {headers:{'content-type':'application/json'}});
      }
      if (url === 'https://p16-webcast.tiktokcdn.com/icon.webp') {
        if (process.env.FAIL_IMAGE === '1') return new Response('failed', {status:503});
        return new Response(Buffer.from('${webp}', 'hex'), {headers:{'content-type':'image/webp'}});
      }
      throw Error('Unexpected request');
    };
  `);
  const run = async (gifts, extra = {}) => {
    const payload = path.join(root, 'payload.json');
    await fs.writeFile(payload, JSON.stringify(Array.isArray(gifts) ? {status_code:0,source:'catalog',data:{gifts}} : gifts));
    return spawnSync(process.execPath, ['--import', preload, 'scripts/sync.mjs'], {
      cwd: root, encoding: 'utf8', env: { PATH:process.env.PATH, TIKTOOLS_API_KEY:'test-key', FIXTURE_PAYLOAD:payload, ...extra }, timeout:15000
    });
  };
  return { root, run, read: async p => fs.readFile(path.join(root,p),'utf8') };
}

test('scheduled sync publishes four fields, mirrors once, preserves AE order and skips unchanged content', async t => {
  const f = await fixture(t);
  const rows = [{id:'2',name:'Other',diamond_count:1,icon:'https://p16-webcast.tiktokcdn.com/icon.webp'}, {id:'1',name:'AE',diamond_count:100,icon:'https://p16-webcast.tiktokcdn.com/icon.webp'}];
  assert.equal((await f.run(rows)).status,0);
  const published = JSON.parse(await f.read('catalog/all.json'));
  assert.deepEqual(published.map(g=>g.giftId),['1','2']);
  assert.deepEqual(Object.keys(published[0]),['giftId','name','points','image']);
  assert.equal(published[0].image,'ae-1.webp');
  const before = await f.read('manifest.json');
  const repeat = await f.run(rows, {FAIL_IMAGE:'1'});
  assert.equal(repeat.status,0);
  assert.match(repeat.stdout,/unchanged/);
  assert.equal(await f.read('manifest.json'),before);
  const validation = spawnSync(process.execPath,['scripts/validate.mjs'],{cwd:f.root,encoding:'utf8'});
  assert.equal(validation.status,0,validation.stderr);
});

test('sample, empty, sudden shrink and failed image downloads never replace published catalog', async t => {
  const f = await fixture(t);
  const row = id => ({id:String(id),name:'Gift '+id,diamond_count:1,icon:'https://p16-webcast.tiktokcdn.com/icon.webp'});
  assert.equal((await f.run([1,2,3,4,5].map(row))).status,0);
  const before = await f.read('catalog/all.json'), manifest = await f.read('manifest.json');
  for (const payload of [{source:'sample',data:{gifts:[row(1)]}},{status_code:0,data:{gifts:[]}},[row(1)]]) {
    assert.notEqual((await f.run(payload)).status,0);
    assert.equal(await f.read('catalog/all.json'),before);
    assert.equal(await f.read('manifest.json'),manifest);
  }
  const changed = [1,2,3,4,5].map(id=>({...row(id),icon:'https://p16-webcast.tiktokcdn.com/missing.webp'}));
  assert.notEqual((await f.run(changed)).status,0);
  assert.equal(await f.read('catalog/all.json'),before);
  assert.equal(await f.read('manifest.json'),manifest);
});
