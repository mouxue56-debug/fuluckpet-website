import test from 'node:test';import assert from 'node:assert/strict';import {regions,sample,needed} from '../ambient-timeline.mjs';
test('long page keeps progressing beyond first screen',()=>{const b=regions(15000,[4000,10000]);const a=sample(800,b,200),z=sample(3000,b,200);assert(z[0].progress>a[0].progress);assert(z[0].progress<1);assert.deepEqual(b,[0,4000,10000,15000])});
test('end of each page reaches third clip end without adding scroll height',()=>{const s=sample(15000,regions(15000,[4000,10000]),200);assert.equal(s.length,1);assert.equal(s[0].index,2);assert.equal(s[0].progress,1)});
test('boundary blends equally and reverses deterministically',()=>{const b=[0,4000,10000,15000];const s=sample(4000,b,200);assert.equal(s.length,2);assert.equal(s[0].weight,.5);assert.equal(s[1].weight,.5);assert(sample(4050,b,200)[1].weight>sample(3950,b,200)[1].weight)});
test('initial load one clip, next prepares near boundary, jump skips middle',()=>{const b=[0,4000,10000,15000];assert.deepEqual(needed(0,b,800,1),[0]);assert.deepEqual(needed(3300,b,800,1),[0,1]);assert.deepEqual(needed(14500,b,800,1),[2]);assert.deepEqual(needed(10400,b,800,-1),[2,1])});
test('short filtered page recalculates valid ranges',()=>{assert.deepEqual(regions(900,[]),[0,300,600,900]);const b=regions(900,[4000,10000]);assert(b[1]>0&&b[1]<b[2]&&b[2]<900)});
test('fast jumps postpone intermediate video downloads but normal dragging does not',async()=>{const {fastMove}=await import('../ambient-timeline.mjs');assert.equal(fastMove(800,16,844),true);assert.equal(fastMove(20,16,844),false);assert.equal(fastMove(-800,16,844),true)});
test('a long reading chapter finishes its motion within six screens then holds without extending the page',()=>{
 const b=[0,15000,28000,42000];
 assert.equal(sample(2400,b,200,4800)[0].progress,.5);
 assert.equal(sample(7000,b,200,4800)[0].progress,1);
 assert.equal(sample(17400,b,200,4800)[0].progress,.5);
 assert.equal(sample(42000,b,200,4800)[0].progress,1);
 assert.deepEqual(b,[0,15000,28000,42000]);
});
test('reading motion reverses to the same frame and short chapters retain their natural distance',()=>{
 const b=[0,1000,2000,3000];
 assert.equal(sample(500,b,200,4800)[0].progress,.5);
 const longer=[0,15000,28000,42000];
 const forward=sample(2400,longer,200,4800);
 sample(7000,longer,200,4800);
 assert.deepEqual(sample(2400,longer,200,4800),forward);
 assert.equal(sample(15000,longer,200,4800)[0].weight,.5);
});
test('seeks use the decoded duration rather than assuming every clip has the same length',async()=>{
 const {frameTime}=await import('../ambient-timeline.mjs');
 assert.equal(typeof frameTime,'function');
 assert.equal(frameTime(.5,6),2.97);
 assert.equal(frameTime(.5,10),4.97);
 assert.equal(frameTime(2,6),5.94);
 assert.equal(frameTime(-1,6),0);
 assert.equal(frameTime(.5,Infinity),null);
});
