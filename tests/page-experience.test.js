'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const experience = require('../page-experience.js');

test('FAQ search combines selected category with normalized localized question and answer', () => {
  const rows = [
    {category:'purchase', question:{ja:'ワクチン費用',en:'Vaccine fee',zh:'疫苗费用'},answer:{ja:'10,000円',en:'10,000 yen',zh:'10,000日元'}},
    {category:'care',question:{ja:'ブラシ',en:'Brush',zh:'梳毛'},answer:{ja:'道具',en:'Tools',zh:'工具'}}
  ];
  assert.deepEqual(experience.filterFaq(rows,'purchase','  ＶＡＣＣＩＮＥ  ','en'), [rows[0]]);
  assert.deepEqual(experience.filterFaq(rows,'care','10,000','zh'), []);
  assert.deepEqual(experience.filterFaq(rows,'all','工具','zh'), [rows[1]]);
  assert.deepEqual(experience.filterFaq(rows,'all','missing','ja'), []);
});

test('kitten context accepts an exact known id and safe photo, without inferring animal facts', () => {
  const rows=[{breederId:'2608-52935',name:'sample',photos:['https://example.com/cat.jpg'],price:270000,gender:'female'}];
  assert.deepEqual(experience.kittenContext(rows,'2608-52935'),{id:'2608-52935',photo:'https://example.com/cat.jpg'});
  assert.equal(experience.kittenContext(rows,'unknown'),null);
  assert.equal(experience.kittenContext(rows,'<script>'),null);
  assert.equal(experience.kittenContext([{breederId:'a',photos:['javascript:alert(1)']}],'a').photo,'');
});

test('waitlist template includes preferences in all three languages and no invented availability', () => {
  for(const lang of ['ja','en','zh']) {
    const template=experience.waitlistTemplate(lang);
    assert.ok(template.length > 35);
    assert.ok(template.includes('\n'));
    assert.ok(!/2026|available|在售/.test(template));
  }
  assert.equal(experience.waitlistTemplate('bad'),experience.waitlistTemplate('ja'));
});

test('localized links keep only supported same-site language prefixes', () => {
  assert.equal(experience.localHref('/kittens.html','zh'),'/zh/kittens.html');
  assert.equal(experience.localHref('/guide/','en'),'/en/guide/');
  assert.equal(experience.localHref('/booking.html','ja'),'/booking.html');
  assert.equal(experience.localHref('/kittens.html','bad'),'/kittens.html');
});

test('dog service translations preserve the closed booking gate and projected prices', () => {
  const ui=require('../dog-services-public-ui.js');
  const projection=require('../dog-services-preparing.json');
  for(const [lang,closed] of [['en','Not accepting bookings'],['zh','暂不接受预约']]) {
    for(const surface of ['boarding','care']) {
      const html=ui.renderSurface(surface,projection,lang);
      assert.ok(html.includes(closed));
      assert.ok(!/[ぁ-んァ-ヶ]/.test(html));
      assert.ok(!html.includes('href="https://page.line.me'));
    }
    assert.ok(ui.renderSurface('boarding',projection,lang).includes('¥5,000'));
  }
  assert.equal(ui.renderSurface('boarding',{public:false},'en'),'');
});
