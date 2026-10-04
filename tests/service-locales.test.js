'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parse}=require('parse5');
const {buildServiceLocales}=require('../tools/generate-service-locales.js');
const root=path.resolve(__dirname,'..');
function nodes(html){const out=[];function walk(n){out.push(n);(n.childNodes||[]).forEach(walk)}walk(parse(html));return out;}
function attr(n,k){return(n.attrs||[]).find(x=>x.name===k)?.value;}
function text(n){return n.value||(n.childNodes||[]).map(text).join('');}
function prices(html){return nodes(html).filter(n=>n.tagName==='td'||(attr(n,'class')||'').split(' ').includes('service-price')).flatMap(n=>[...text(n).matchAll(/¥[\d,]+/g)].map(m=>m[0]));}
test('service translations keep prices, language return links and crawlable metadata consistent',()=>{
 const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
 for(const service of ['boarding','grooming']){
  const ja=fs.readFileSync(path.join(root,service,'index.html'),'utf8');
  for(const lang of ['en','zh']){
   const html=fs.readFileSync(path.join(root,lang,service,'index.html'),'utf8'),all=nodes(html);
   assert.deepEqual(prices(html),prices(ja),service+' price parity');
   const url=`https://fuluckpet.com/${lang}/${service}/`;
   assert.equal(attr(all.find(n=>attr(n,'rel')==='canonical'),'href'),url);
   assert.ok(sitemap.includes('<loc>'+url+'</loc>'));
   for(const target of ['ja','en','zh']){
    const expected='/'+(target==='ja'?'':target+'/')+service+'/';
    assert.equal(attr(all.find(n=>n.tagName==='a'&&attr(n,'lang')===target),'href'),expected);
    assert.equal(attr(all.find(n=>attr(n,'hreflang')===target),'href'),'https://fuluckpet.com'+expected);
   }
   const main=all.find(n=>n.tagName==='main');
   assert.ok(!/[ぁ-んァ-ヶ]/.test(text(main)),service+' has untranslated Japanese body copy');
  }
 }
});
test('service locale generation is deterministic and all checked-in outputs are fresh',()=>{
 const before=fs.readFileSync(path.join(root,'boarding/index.html'),'utf8');
 const a=buildServiceLocales(root),b=buildServiceLocales(root);
 assert.deepEqual([...a],[...b]);
 assert.equal(fs.readFileSync(path.join(root,'boarding/index.html'),'utf8'),before);
 for(const [relative,html] of a)assert.equal(fs.readFileSync(path.join(root,relative),'utf8'),html,relative+' is stale');
});
