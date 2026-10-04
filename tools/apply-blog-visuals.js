#!/usr/bin/env node
'use strict';
// Add only illustration siblings; keep article text, links and category order intact.
const fs = require('node:fs');
const path = require('node:path');
const { imageMarkup } = require('../blog-visuals.js');
function applyBlogVisuals(html) {
  return html.replace(/(<a href="(\/blog\/[a-z0-9-]+\.html)" class="blog-card"[^>]*>)(?:\s*<span class="blog-card-visual">[\s\S]*?<\/span><\/span>)?/g,
    (_whole, opening, href) => opening + '\n        ' + imageMarkup(href, 'ja'));
}
module.exports = { applyBlogVisuals };
if (require.main === module) {
  const target = path.join(__dirname, '..', 'blog.html');
  const before = fs.readFileSync(target, 'utf8');
  const after = applyBlogVisuals(before);
  if (after !== before) fs.writeFileSync(target, after);
}
