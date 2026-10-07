const test = require('node:test');
const assert = require('node:assert/strict');
const {merge} = require('../kitten-history');
const discovery = require('../kitten-discovery');
test('historical supplement never overwrites a live status or live photos', () => {
 const old = [{breederId:'2601-12345',status:'sold',sourceStatus:'成約済み',photos:['old']},{breederId:'2601-12346',status:'sold',sourceStatus:'販売終了'},{breederId:'2601-12347',status:'available'}];
 const result=merge([{breederId:'2601-12345',status:'available',photos:['live']}],old);
 assert.equal(result.length,2); assert.equal(result[0].status,'available');assert.deepEqual(result[0].photos,['live']);
 assert.equal(result[1].sourceStatus,'販売終了');
 assert.equal(discovery.matches({id:'2601-12346',status:'ended'},discovery.normalize({status:'sold'})),false);
});
test('live sold records retain listing-ended distinction without changing other facts',()=>{
 const result=merge([{breederId:'2601-12346',status:'sold',price:200000}],[{breederId:'2601-12346',status:'sold',sourceStatus:'販売終了',price:null}]);
 assert.equal(result[0].price,200000);assert.equal(result[0].sourceStatus,'販売終了');
});
test('replacing a comparison slot preserves the other selected kittens and max three',()=>{
 assert.deepEqual(discovery.replaceCompare(['one','two','three'],'two','four'),['one','four','three']);
 assert.deepEqual(discovery.replaceCompare(['one','two','three'],'two','one'),['one','three']);
 assert.deepEqual(discovery.replaceCompare(['one','two','three'],'missing','four'),['one','two','three']);
});
