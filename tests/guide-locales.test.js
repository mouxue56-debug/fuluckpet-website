'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {parse}=require('parse5');
function nodes(html){const out=[];function visit(n){out.push(n);(n.childNodes||[]).forEach(visit)}visit(parse(html));return out;}
function attr(n,k){return(n?.attrs||[]).find(a=>a.name===k)?.value;}
function text(n){return n.value||(n.childNodes||[]).map(text).join('');}
test('all guides have distinct crawlable JA/EN/ZH bodies, reciprocal alternates and matching schemas',()=>{
 const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
 for(const name of fs.readdirSync(path.join(root,'guide')).filter(f=>f.endsWith('.html'))){
  const relative='/guide/'+(name==='index.html'?'':name);
  for(const lang of ['ja','en','zh']){
   const prefix=lang==='ja'?'':'/'+lang;
   const file=path.join(root,prefix,'guide',name);
   assert.ok(fs.existsSync(file),file+' must exist without JavaScript');
   const html=fs.readFileSync(file,'utf8'),all=nodes(html),self='https://fuluckpet.com'+prefix+relative;
   assert.equal(attr(all.find(n=>n.tagName==='html'),'lang'),lang);
   assert.equal(attr(all.find(n=>attr(n,'rel')==='canonical'),'href'),self);
   for(const alternate of ['ja','en','zh','x-default'])assert.equal(attr(all.find(n=>attr(n,'hreflang')===alternate),'href'),'https://fuluckpet.com'+(['ja','x-default'].includes(alternate)?'':'/'+alternate)+relative);
   assert.ok(sitemap.includes('<loc>'+self+'</loc>'));
   const schemas=all.filter(n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json').map(n=>JSON.parse(text(n)));
   const article=schemas.find(s=>['Article','CollectionPage'].includes(s['@type']));
   assert.equal(article.inLanguage,lang);
   if(lang!=='ja'){
    assert.ok(!/[ぁ-んァ-ヶ]/.test(text(all.find(n=>n.tagName==='h1'))));
    const main=all.find(n=>n.tagName==='main'||attr(n,'id')==='main');
    assert.ok(!/[ぁ-んァ-ヶ]/.test(text(main)),file+' has untranslated Japanese guide copy');
    const mainImages=all.filter(n=>n.tagName==='img'&&(attr(n,'src')||'').includes('/guide-scenes/'));
    assert.ok(mainImages.length>0);
    for(const img of mainImages)assert.ok(!/[ぁ-んァ-ヶ]/.test(attr(img,'alt')||''));
    for(const link of all.filter(n=>n.tagName==='a'&&/^\/guide\//.test(attr(n,'href')||'')))assert.fail('localized guide link fell back to Japanese: '+attr(link,'href'));
   }
  }
 }
});
test('guide locale generation is deterministic and does not rewrite the Japanese article body',()=>{
 const {buildGuideLocales}=require('../tools/generate-guide-locales.js');
 const before=fs.readFileSync(path.join(root,'guide/week1.html'),'utf8');
 const a=buildGuideLocales(root),b=buildGuideLocales(root);
 assert.deepEqual([...a.entries()],[...b.entries()]);
 assert.equal(fs.readFileSync(path.join(root,'guide/week1.html'),'utf8'),before);
 for(const [relative,html] of a)assert.equal(fs.readFileSync(path.join(root,relative),'utf8'),html,relative+' is stale');
});
