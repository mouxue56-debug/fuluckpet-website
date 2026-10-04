'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parse, serialize } = require('parse5');
const languages = ['ja','en','zh'];
const labels = {ja:'日本語',en:'English',zh:'中文'};
const descriptions = {
  boarding:{en:'Cat, rabbit and small animal boarding by appointment at Fuluck Pet in Joto-ku, Osaka. View prices, long-stay discounts and preparation information.',zh:'大阪市城东区福乐宠物，为猫、兔及登记范围内的小动物提供完全预约制寄养。查看费用、长期折扣与准备事项。'},
  grooming:{en:'Cat shampoo and basic care by appointment at Fuluck Pet in Osaka. View short-haired and long-haired cat prices, individual care and transport information.',zh:'大阪福乐宠物的猫咪洗护与基础护理，采用完全预约制。查看短毛与长毛猫套餐、单项护理和接送信息。'}
};
function set(node,name,value){const found=node.attrs?.find(a=>a.name===name);if(found)found.value=value;else(node.attrs ||= []).push({name,value});}
function attr(node,name){return node.attrs?.find(a=>a.name===name)?.value;}
function links(service){return languages.map(lang=>`<link rel="alternate" hreflang="${lang}" href="https://fuluckpet.com/${lang==='ja'?'':lang+'/'}${service}/">`).join('\n')+`\n<link rel="alternate" hreflang="x-default" href="https://fuluckpet.com/${service}/">`;}
function switcher(service,lang){return `<nav class="experience-toolbar" aria-label="Language">`+languages.map(l=>`<a class="experience-button ${l===lang?'':'is-light'}" href="/${l==='ja'?'':l+'/'}${service}/" lang="${l}" hreflang="${l}" ${l===lang?'aria-current="page"':''}>${labels[l]}</a>`).join('')+'</nav>';}

function buildServiceLocales(root) {
const translations = JSON.parse(fs.readFileSync(path.join(root,'tools/service-page-translations.json'),'utf8'));
const outputs = new Map();
for(const service of ['boarding','grooming']){
  const sourcePath=path.join(root,service,'index.html');
  let source=fs.readFileSync(sourcePath,'utf8');
  if(!source.includes('hreflang="en"'))source=source.replace('</head>',links(service)+'\n</head>');
  if(!source.includes('<!-- SERVICE LANGUAGES -->'))source=source.replace('<main class="service-main" id="main">','<main class="service-main" id="main">\n<!-- SERVICE LANGUAGES -->'+switcher(service,'ja')+'<!-- END SERVICE LANGUAGES -->');
  outputs.set(service+'/index.html', source);
  for(const lang of ['en','zh']){
    const doc=parse(source.replace(/<!-- SERVICE LANGUAGES -->[\s\S]*?<!-- END SERVICE LANGUAGES -->/,'<!-- SERVICE LANGUAGES -->'+switcher(service,lang)+'<!-- END SERVICE LANGUAGES -->'));
    const missing=new Set();
    function walk(node,skip=false){
      if(node.tagName==='html')set(node,'lang',lang);
      if(node.tagName==='body')set(node,'data-nav-language',lang);
      const own=attr(node,'data-experience-'+lang);
      if(own && node.tagName==='img')set(node,'alt',own);
      else if(own){node.childNodes=[{nodeName:'#text',value:own,parentNode:node}];return;}
      if(node.tagName==='link'){
        if(attr(node,'rel')==='canonical')set(node,'href',`https://fuluckpet.com/${lang}/${service}/`);
      }
      if(node.tagName==='meta'){
        const name=attr(node,'name')||attr(node,'property');
        if(name==='og:url')set(node,'content',`https://fuluckpet.com/${lang}/${service}/`);
        if(name==='description'||name==='og:description')set(node,'content',descriptions[service][lang]);
        if(name==='og:title')set(node,'content',service==='boarding'?(lang==='en'?'Cat & Small Animal Boarding | Fuluck Cattery':'猫与小动物寄养｜福乐猫舍'):(lang==='en'?'Cat Shampoo & Basic Care | Fuluck Cattery':'猫咪洗护与基础护理｜福乐猫舍'));
      }
      if(attr(node,'aria-label')==='メインナビゲーション')set(node,'aria-label',lang==='en'?'Main navigation':'主导航');
      if(attr(node,'aria-label')==='メニュー')set(node,'aria-label',lang==='en'?'Menu':'菜单');
      if(node.tagName==='a' && !attr(node,'lang')){
        const href=attr(node,'href');
        if(['/boarding/','/grooming/'].includes(href))set(node,'href','/'+lang+href);
        else if(href==='/kittens.html')set(node,'href','/'+lang+href);
        else if(['/booking.html','/about.html','/'].includes(href))set(node,'href',href+'?lang='+lang);
      }
      if(node.tagName==='script' && attr(node,'type')==='application/ld+json'){
        const data=JSON.parse(node.childNodes[0].value);
        data.name=service==='boarding'?(lang==='en'?'Cat & Small Animal Boarding':'猫与小动物寄养'):(lang==='en'?'Cat Shampoo & Basic Care':'猫咪洗护与基础护理');
        data.url=`https://fuluckpet.com/${lang}/${service}/`;data.inLanguage=lang;
        node.childNodes[0].value=JSON.stringify(data,null,2);return;
      }
      skip=skip||['script','style'].includes(node.tagName);
      if(node.nodeName==='#text'&&!skip){
        const key=node.value.trim();
        if(translations[key])node.value=node.value.replace(key,translations[key][lang]);
        else if(/[ぁ-んァ-ン一-龯]/.test(key)&&!['日本語','中文','羅 方遠'].includes(key))missing.add(key);
      }
      for(const child of node.childNodes||[])walk(child,skip);
    }
    walk(doc);
    if(missing.size)throw new Error(`Missing ${service}/${lang} translations: ${[...missing].join(' | ')}`);
    outputs.set(`${lang}/${service}/index.html`, serialize(doc)+'\n');
  }
}

return outputs;
}
function generateServiceLocales(root=path.resolve(__dirname,'..')){
  const outputs=buildServiceLocales(root);
  for(const [relative,content] of outputs){const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
  return outputs;
}
module.exports={buildServiceLocales,generateServiceLocales};
if(require.main===module){console.log(`Updated ${generateServiceLocales().size} service pages.`);}
