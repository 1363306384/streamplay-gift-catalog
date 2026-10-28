import test from 'node:test';
import assert from 'node:assert/strict';
import { groupedCatalog } from '../scripts/regional-catalogs.mjs';

test('grouping retains all IDs, separates prices and images, and prioritizes any regional member',()=>{
 const gift=(id,points,image)=>({giftId:id,name:'Same gift',points,image});
 const gifts=[gift('1',1,'one.webp'),gift('2',1,'two.webp'),gift('3',2,'three.webp'),gift('4',1,'four.webp')];
 const hashes=new Map([['1','same'],['2','same'],['3','same'],['4','different']]);
 const before=JSON.stringify(gifts);
 const result=groupedCatalog(gifts,hashes,['2','3']);
 assert.equal(result.length,3);
 assert.deepEqual(result[0].giftIds,['2','1']);
 assert.equal(result[0].image,'two.webp');
 assert.deepEqual(result[1].giftIds,['3']);
 assert.deepEqual(result[2].giftIds,['4']);
 assert.deepEqual(result.flatMap(g=>g.giftIds).sort(),['1','2','3','4']);
 assert.equal(JSON.stringify(gifts),before);
 assert.deepEqual(Object.keys(result[0]),['giftIds','name','points','image']);
});
