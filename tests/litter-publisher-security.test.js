const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', 'admin', 'litter-publisher.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');
const SCRIPT = HTML.match(/<script>([\s\S]*?)<\/script>/)?.[1];

class FakeClassList {
  constructor(node) {
    this.node = node;
    this.values = new Set();
  }

  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) {
    return this.values.has(name) || this.node.className.split(/\s+/).includes(name);
  }
  toggle(name) {
    if (this.contains(name)) {
      this.values.delete(name);
      this.node.className = this.node.className.split(/\s+/).filter((item) => item !== name).join(' ');
      return false;
    }
    this.values.add(name);
    return true;
  }
}

class FakeElement {
  constructor(tagName, htmlWrites) {
    this.tagName = String(tagName).toUpperCase();
    this.htmlWrites = htmlWrites;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.id = '';
    this.value = '';
    this.href = '';
    this.src = '';
    this.target = '';
    this.rel = '';
    this.loading = '';
    this.alt = '';
    this._text = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => {
      if (typeof child === 'string') {
        const text = new FakeElement('#text', this.htmlWrites);
        text.textContent = child;
        this.appendChild(text);
      } else {
        this.appendChild(child);
      }
    });
  }

  replaceChildren(...children) {
    this.children = [];
    this._text = '';
    this.append(...children);
  }

  set textContent(value) {
    this._text = String(value ?? '');
    this.children = [];
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  set innerHTML(value) {
    this.htmlWrites.push(String(value));
    this.children = [];
    this._text = '';
  }

  get innerHTML() { return ''; }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    (this.listeners[type] ||= []).push(handler);
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (selector === '[data-copy]' && Object.hasOwn(node.dataset, 'copy')) return node;
      if (selector === '[data-toggle]' && Object.hasOwn(node.dataset, 'toggle')) return node;
      if (selector === '.kit' && node.classList.contains('kit')) return node;
      if (selector === '.lg-head' && node.classList.contains('lg-head')) return node;
      if (selector === '.step-row' && node.classList.contains('step-row')) return node;
      node = node.parentNode;
    }
    return null;
  }

  scrollIntoView() {}
}

function descendants(root) {
  const result = [];
  for (const child of root.children) {
    result.push(child, ...descendants(child));
  }
  return result;
}

function createHarness() {
  assert.ok(SCRIPT, 'inline script should be extractable');
  const htmlWrites = [];
  const clipboardWrites = [];
  const ids = new Map();
  const allIds = [
    'litterGroups', 'litterTitle', 'litterDate', 'genBtn', 'genPanel',
    'channels', 'pubPanel', 'checklist', 'progBar'
  ];
  allIds.forEach((id) => {
    const node = new FakeElement(id === 'genBtn' ? 'button' : 'div', htmlWrites);
    node.id = id;
    ids.set(id, node);
  });
  const body = new FakeElement('body', htmlWrites);
  const document = {
    body,
    createElement(tagName) { return new FakeElement(tagName, htmlWrites); },
    getElementById(id) {
      const dynamic = [...ids.values()]
        .flatMap((node) => [node, ...descendants(node)])
        .find((node) => node.id === id);
      if (dynamic) return dynamic;
      if (!ids.has(id)) {
        const node = new FakeElement('div', htmlWrites);
        node.id = id;
        ids.set(id, node);
      }
      return ids.get(id);
    },
    querySelectorAll(selector) {
      const nodes = [...ids.values()].flatMap((node) => [node, ...descendants(node)]);
      if (selector === '.step-row') return nodes.filter((node) => node.classList.contains('step-row'));
      if (selector === '.step-row.done') {
        return nodes.filter((node) => node.classList.contains('step-row') && node.classList.contains('done'));
      }
      return [];
    }
  };
  const context = vm.createContext({
    document,
    sessionStorage: { getItem: () => '1' },
    location: { replace() {} },
    fetch: () => new Promise(() => {}),
    navigator: { clipboard: { writeText: async (value) => { clipboardWrites.push(value); } } },
    alert() {},
    setTimeout,
    clearTimeout,
    URL,
    console
  });
  context.window = context;
  vm.runInContext(SCRIPT, context, { filename: 'admin/litter-publisher.html' });
  return { context, document, ids, htmlWrites, clipboardWrites };
}

function dangerousUrl(value) {
  return /^(?:javascript|data):/i.test(String(value || '').trim());
}

test('kitten API fields render as inert DOM and unsafe image URLs are rejected', () => {
  const { context, ids, htmlWrites } = createHarness();
  context.kittens = [
    {
      breederId: 'kid\" autofocus onfocus=\"globalThis.pwned=1',
      papa: '<img src=x onerror=globalThis.pwned=1>',
      mama: 'mother',
      birthday: '2026-07',
      gender: '<svg onload=globalThis.pwned=1>',
      color: 'blue\" onmouseover=\"globalThis.pwned=1',
      price: 123,
      photos: ['javascript:globalThis.pwned=1']
    },
    {
      breederId: 'safe-id',
      papa: '<img src=x onerror=globalThis.pwned=1>',
      mama: 'mother',
      birthday: '2026-07',
      gender: '女の子',
      color: 'blue',
      price: 456,
      photos: ['https://cdn.example.test/cat.jpg']
    },
    {
      breederId: '',
      id: 'fallback\" onclick=\"globalThis.pwned=1',
      papa: '<img src=x onerror=globalThis.pwned=1>',
      mama: 'mother',
      birthday: '2026-07',
      gender: '男の子',
      color: 'white',
      price: 789,
      photos: ['data:image/svg+xml,<svg onload=globalThis.pwned=1>']
    }
  ];

  context.render();

  assert.deepEqual(htmlWrites, [], 'API data must never be reparsed through innerHTML');
  const nodes = [ids.get('litterGroups'), ...descendants(ids.get('litterGroups'))];
  const images = nodes.filter((node) => node.tagName === 'IMG');
  assert.equal(images.length, 1);
  assert.equal(images[0].src, 'https://cdn.example.test/cat.jpg');
  const cards = nodes.filter((node) => node.classList.contains('kit'));
  assert.ok(cards.some((card) => card.dataset.id === 'fallback\" onclick=\"globalThis.pwned=1'));
  assert.ok(nodes.every((node) => !dangerousUrl(node.src) && !dangerousUrl(node.href)));
  assert.ok(nodes.every((node) => !Object.keys(node.attributes).some((name) => /^on/i.test(name))));
  assert.match(ids.get('litterGroups').textContent, /autofocus onfocus/);
  assert.equal(context.pwned, undefined);
});

test('blog draft drops active-content image URLs and escapes image attributes', () => {
  const { context } = createHarness();
  const base = {
    breederId: 'kid-1', papa: 'papa', mama: 'mama', birthday: '2026-07',
    gender: '女の子', price: 123, breed: 'サイベリアン'
  };

  const attributeInjection = context.blogDraft([{
    ...base,
    color: 'blue</figcaption><script>globalThis.pwned=1</script>\" onload=\"globalThis.pwned=1',
    photos: ['https://cdn.example.test/cat.jpg']
  }], 'title', '2026-07');
  const urlInjection = context.blogDraft([{
    ...base,
    color: 'blue',
    photos: ['https://cdn.example.test/cat.jpg\" onerror=\"globalThis.pwned=1']
  }], 'title', '2026-07');
  const dataSvg = context.blogDraft([{
    ...base,
    color: 'blue',
    photos: ['data:image/svg+xml,<svg onload=globalThis.pwned=1>']
  }], 'title', '2026-07');

  const imageTag = attributeInjection.match(/<img\b[^>]*>/i)?.[0] || '';
  assert.match(imageTag, /&quot;/);
  assert.doesNotMatch(imageTag, /\son(?:error|load)\s*=\s*["']/i);
  assert.doesNotMatch(attributeInjection, /<script\b/i);
  assert.doesNotMatch(urlInjection, /<img\b/i);
  assert.doesNotMatch(dataSvg, /data:image/i);
  assert.doesNotMatch(dataSvg, /<img\b/i);
});

test('channel builder preserves copy hooks and opens links without an opener', () => {
  const { context } = createHarness();
  const node = context.chan(
    'cBlog', '📝', '公式ブログ下書き', 'HTML', '<p>safe draft</p>',
    { href: 'blog-editor.html', label: 'ブログ編集を開く ↗' }
  );
  assert.equal(typeof node, 'object', 'channel builder should return a DOM node');
  const nodes = [node, ...descendants(node)];
  const textarea = nodes.find((item) => item.tagName === 'TEXTAREA');
  const copy = nodes.find((item) => item.tagName === 'BUTTON');
  const link = nodes.find((item) => item.tagName === 'A');

  assert.equal(textarea.id, 'cBlog');
  assert.equal(textarea.value, '<p>safe draft</p>');
  assert.equal(copy.dataset.copy, 'cBlog');
  assert.equal(link.href, 'blog-editor.html');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener');
});

test('generate action keeps all six channel drafts and six publication steps', async () => {
  const { context, document, ids, htmlWrites, clipboardWrites } = createHarness();
  const kitten = {
    breederId: 'kid-1', papa: 'papa', mama: 'mama', birthday: '2026-07',
    gender: '女の子', color: 'blue', price: 123, breed: 'サイベリアン',
    photos: ['https://cdn.example.test/cat.jpg']
  };
  context.kittens = [kitten];
  context.selected.add('kid-1');
  ids.get('litterTitle').value = 'papa×mamaの子猫';
  ids.get('litterDate').value = '2026-07';

  ids.get('genBtn').listeners.click[0]();

  const channels = ids.get('channels').children;
  const checklist = ids.get('checklist').children;
  assert.equal(channels.length, 6);
  assert.equal(checklist.length, 6);
  assert.deepEqual(
    channels.map((channel) => descendants(channel).find((item) => item.tagName === 'TEXTAREA')?.id),
    ['cBlog', 'cLine', 'cKoneko', 'cIg', 'cTt', 'cYt']
  );
  assert.ok(channels.every((channel) => {
    const link = descendants(channel).find((item) => item.tagName === 'A');
    return link && link.target === '_blank' && link.rel === 'noopener';
  }));
  const checklistCopyIds = checklist.map((step) => {
    const nodes = descendants(step);
    const copy = nodes.find((item) => item.tagName === 'BUTTON');
    const link = nodes.find((item) => item.tagName === 'A');
    assert.equal(link?.target, '_blank');
    assert.equal(link?.rel, 'noopener');
    return copy?.dataset.copy;
  });
  assert.deepEqual(checklistCopyIds, ['cLine', 'cBlog', 'cKoneko', 'cIg', 'cTt', 'cYt']);

  const firstChannelTextarea = descendants(channels[0]).find((item) => item.tagName === 'TEXTAREA');
  const firstChannelCopy = descendants(channels[0]).find((item) => item.tagName === 'BUTTON');
  document.body.listeners.click[0]({ target: firstChannelCopy });
  await Promise.resolve();
  assert.deepEqual(clipboardWrites, [firstChannelTextarea.value]);
  assert.equal(ids.get('genPanel').style.display, '');
  assert.equal(ids.get('pubPanel').style.display, '');
  assert.deepEqual(htmlWrites, []);
});
