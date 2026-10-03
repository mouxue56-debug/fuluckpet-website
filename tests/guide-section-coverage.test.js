'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse, parseFragment, serialize } = require('parse5');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const attr = (n,k) => n.attrs?.find(a => a.name === k)?.value;
const hasClass = (n,c) => (attr(n,'class') || '').split(/\s+/).includes(c);
function all(n, predicate) { return [ ...(predicate(n) ? [n] : []), ...(n.childNodes || []).flatMap(c => all(c,predicate)) ]; }
const translations = vm.createContext({});
vm.runInContext(read('guide/i18n-guide-body.js'), translations);
test('all 48 guide topics have corresponding images in Japanese, English and Chinese', () => {
  let topicCount = 0, imageCount = 0;
  for (const file of fs.readdirSync(path.join(root,'guide')).filter(f => f.endsWith('.html') && f !== 'index.html')) {
    const doc = parse(read('guide/' + file));
    const body = all(doc, n => Boolean(attr(n,'data-i18n-html')))[0];
    const key = attr(body,'data-i18n-html');
    assert.equal(all(body,n=>Boolean(attr(n,'data-i18n'))).length,0,file + ': body replacement must own its headings so the Japanese restore snapshot is not pretranslated');
    const sections = all(body,n => hasClass(n,'guide-section') && all(n,x => x.tagName === 'h2').length > 0);
    topicCount += sections.length;
    const expected = sections.map(section => {
      const id = attr(section,'id');
      assert.ok(id, file + ': stable topic anchor');
      assert.ok(all(doc,n => n.tagName === 'a' && attr(n,'href') === '#' + id).length, file + ': topic in contents');
      const images = all(section,n => n.tagName === 'img');
      assert.ok(images.length, file + ': each topic needs a relevant image');
      imageCount += images.length;
      return { id, images: images.map(n => attr(n,'src')) };
    });
    for (const lang of ['en','zh']) {
      const translated = parse(translations.guideBodyTranslations[lang][key]);
      const actual = all(translated,n => hasClass(n,'guide-section') && all(n,x => x.tagName === 'h2').length > 0).map(s => ({id:attr(s,'id'),images:all(s,n => n.tagName === 'img').map(n=>attr(n,'src'))}));
      assert.deepEqual(actual,expected,file + ': ' + lang + ' image-to-topic correspondence');
      for (const tag of ['li','tr']) assert.equal(all(translated,n=>n.tagName===tag).length,all(body,n=>n.tagName===tag).length,file + ': ' + lang + ' preserves ' + tag + ' coverage');
    }
    for (const img of all(body,n=>n.tagName==='img')) {
      assert.ok(fs.existsSync(path.join(root,attr(img,'src'))));
      for (const lang of ['ja','en','zh']) assert.ok(attr(img,'data-guide-'+lang),file + ': localized alt text');
      assert.equal(attr(img,'loading'),'lazy');
    }
    const ids = all(doc,n=>Boolean(attr(n,'id'))).map(n=>attr(n,'id'));
    assert.equal(new Set(ids).size,ids.length,file + ': no duplicate anchors');
  }
  assert.equal(topicCount,48);
  assert.equal(imageCount,49);
});

test('real language handlers retain every illustration through EN, ZH and Japanese restore', () => {
  for (const file of fs.readdirSync(path.join(root,'guide')).filter(f => f.endsWith('.html') && f !== 'index.html')) {
    const doc = parse(read('guide/' + file));
    const original = all(doc,n=>Boolean(attr(n,'data-i18n-html')))[0];
    let bodyDOM = parseFragment(serialize(original));
    const key = attr(original,'data-i18n-html');
    const body = { getAttribute: () => key, get innerHTML(){return serialize(bodyDOM);}, set innerHTML(value){bodyDOM=parseFragment(value);} };
    const events = {};
    function visual(n) {
      return {tagName:n.tagName.toUpperCase(),getAttribute:k=>attr(n,k),setAttribute(k,v){
        const a=n.attrs.find(a=>a.name===k); if(a)a.value=v;else n.attrs.push({name:k,value:v});
      },set textContent(v){n.childNodes=[{nodeName:'#text',value:v,parentNode:n}];}};
    }
    const document = {readyState:'complete',documentElement:{lang:'ja'},addEventListener(){},querySelectorAll(s){
      if(s==='[data-i18n-html]')return [body];
      if(s==='[data-guide-ja]')return all(bodyDOM,n=>Boolean(attr(n,'data-guide-ja'))).map(visual);
      return [];
    }};
    const context=vm.createContext({document,URL,URLSearchParams,WeakMap,
      window:{addEventListener:(k,f)=>{events[k]=f;},dispatchEvent:e=>events[e.type]?.()},
      localStorage:{setItem(){}},CustomEvent:function(type){this.type=type;}});
    for(const script of ['i18n.js','guide/i18n-guide-body.js','guide/guide-visuals.js'])vm.runInContext(read(script),context);
    const sources=all(original,n=>n.tagName==='img').map(n=>attr(n,'src'));
    for(const lang of ['en','zh','ja','zh','en','ja']) {
      context.setLanguage(lang);
      assert.deepEqual(all(bodyDOM,n=>n.tagName==='img').map(n=>attr(n,'src')),sources,file+' '+lang+' keeps images');
      for(const n of all(bodyDOM,n=>Boolean(attr(n,'data-guide-ja')))){
        const value=n.tagName==='img'?attr(n,'alt'):n.childNodes.map(c=>c.value||'').join('');
        assert.equal(value,attr(n,'data-guide-'+lang),file+' '+lang+' localizes visual text');
      }
      if(lang==='ja') assert.deepEqual(all(bodyDOM,n=>n.tagName==='h2').map(serialize),all(original,n=>n.tagName==='h2').map(serialize),file+' restores original Japanese headings');
    }
  }
});
