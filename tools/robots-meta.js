'use strict';

function metaAttribute(tag, name) {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = String(tag || '').match(pattern);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function hasNoindexMeta(html) {
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  return tags.some((tag) => {
    const name = metaAttribute(tag, 'name');
    const content = metaAttribute(tag, 'content');
    if (!name || name.trim().toLowerCase() !== 'robots' || !content) return false;
    const directives = content.toLowerCase().split(/[\s,]+/).filter(Boolean);
    return directives.includes('noindex') || directives.includes('none');
  });
}

module.exports = { hasNoindexMeta, metaAttribute };
