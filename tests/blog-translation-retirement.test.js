'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

test('translation injection preserves reviewed Japanese when prior translations are disabled', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fuluck-retired-translation-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'tools/blog-translations'),{recursive:true});
  fs.mkdirSync(path.join(root,'blog'));
  for (const name of ['translate-blog-articles.js','safe-json-for-html.js'])
    fs.copyFileSync(path.join(__dirname,'../tools',name),path.join(root,'tools',name));
  const html='<h1>Reviewed Japanese</h1><p>Current safety guidance.</p><script src="/blog/blog-i18n.js?v=20260710b"></script>';
  for (const [slug,disabled] of [['reviewed',true],['ready',false]]) {
    fs.writeFileSync(path.join(root,'blog',slug+'.html'),html);
    fs.writeFileSync(path.join(root,'tools/blog-translations',slug+'.json'),JSON.stringify({slug,disabled,en:{title:'English',content:'Previous translation'},zh:{title:'Chinese',content:'Previous translation'}}));
  }
  execFileSync(process.execPath,[path.join(root,'tools/translate-blog-articles.js'),'--inject'],{encoding:'utf8'});
  assert.equal(fs.readFileSync(path.join(root,'blog/reviewed.html'),'utf8'),html);
  assert.match(fs.readFileSync(path.join(root,'blog/ready.html'),'utf8'),/window\._blogArticleI18n/);
});
