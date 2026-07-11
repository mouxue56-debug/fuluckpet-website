'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const IMAGES_SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-images.js'), 'utf8');
const RENDER_SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-render.js'), 'utf8');
const PHOTOS_SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-photos.js'), 'utf8');
const DRIVE_SOURCE = fs.readFileSync(path.join(ROOT, 'admin/js/admin-drive.js'), 'utf8');

function element(tagName, id) {
  const listeners = Object.create(null);
  const attributes = Object.create(null);
  const classes = new Set();
  let ownText = '';
  let html = '';
  const node = {
    id: id || '',
    tagName: String(tagName || 'div').toUpperCase(),
    children: [],
    parentNode: null,
    style: {},
    dataset: {},
    className: '',
    value: '',
    type: '',
    disabled: false,
    checked: false,
    src: '',
    alt: '',
    htmlWrites: [],
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((candidate) => candidate !== child);
      child.parentNode = null;
      return child;
    },
    replaceChildren(...children) {
      this.children.forEach((child) => { child.parentNode = null; });
      this.children = [];
      children.forEach((child) => this.appendChild(child));
    },
    insertBefore(child, reference) {
      child.parentNode = this;
      const index = reference ? this.children.indexOf(reference) : -1;
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
      if (name === 'class') this.className = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    addEventListener(type, listener) {
      (listeners[type] ||= []).push(listener);
    },
    click() {
      (listeners.click || []).forEach((listener) => listener({ currentTarget: this, target: this }));
    },
    change() {
      (listeners.change || []).forEach((listener) => listener({ currentTarget: this, target: this }));
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const all = descendants(this);
      if (selector.startsWith('.')) {
        const wanted = selector.slice(1);
        return all.filter((child) => child.className.split(/\s+/).includes(wanted));
      }
      const attribute = selector.match(/^\[([^\]]+)\]$/);
      if (attribute) return all.filter((child) => child.getAttribute(attribute[1]) !== null);
      return all.filter((child) => child.tagName === selector.toUpperCase());
    },
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
    },
    _listeners: listeners,
    _attributes: attributes,
  };
  Object.defineProperty(node, 'textContent', {
    get() { return ownText; },
    set(value) {
      ownText = String(value == null ? '' : value);
      node.children.forEach((child) => { child.parentNode = null; });
      node.children = [];
      html = '';
    },
  });
  Object.defineProperty(node, 'innerHTML', {
    get() { return html; },
    set(value) {
      html = String(value == null ? '' : value);
      node.htmlWrites.push(html);
      node.children.forEach((child) => { child.parentNode = null; });
      node.children = [];
      ownText = '';
    },
  });
  Object.defineProperty(node, 'nextSibling', {
    get() {
      if (!node.parentNode) return null;
      const index = node.parentNode.children.indexOf(node);
      return node.parentNode.children[index + 1] || null;
    },
  });
  return node;
}

function descendants(root) {
  const found = [];
  (function visit(node) {
    node.children.forEach(function(child) {
      found.push(child);
      visit(child);
    });
  }(root));
  return found;
}

function visibleText(root) {
  return (root.textContent || '') + root.children.map(visibleText).join('');
}

function createDocument(ids) {
  const elements = new Map();
  Object.entries(ids || {}).forEach(([id, tag]) => elements.set(id, element(tag, id)));
  return {
    elements,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element('div', id));
        return elements.get(id);
      },
      createElement(tagName) { return element(tagName); },
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      querySelectorAll(selector) {
        const all = [];
        elements.forEach((root) => all.push(...root.querySelectorAll(selector)));
        return all;
      },
      addEventListener() {},
    },
  };
}

function renderHarness() {
  const { document, elements } = createDocument({
    kittenFilterStatus: 'select', parentFilterBreed: 'select', kittensTableBody: 'tbody',
    parentsTableBody: 'tbody', reviewsTableBody: 'tbody', changeLog: 'div', dashboardSummary: 'div',
    kf_papa: 'select', kf_mama: 'select', kittenPagination: 'div', parentPagination: 'div',
  });
  elements.get('kittenFilterStatus').value = 'all';
  elements.get('parentFilterBreed').value = 'all';
  const marker = 'globalThis.__adminRenderPwned=true';
  const hostileId = "');" + marker + '//';
  const data = {
    kittens: [{
      id: hostileId,
      breederId: '<img src=x onerror="' + marker + '">KIT',
      breed: '<svg onload="' + marker + '">Breed',
      gender: '♂',
      color: 'blue <b onclick="' + marker + '">point</b>',
      birthday: '2026-01',
      price: 123000,
      status: 'available',
      isNew: true,
      promotionTag: 'campaign',
      promotionPriority: 999,
      papa: '<iframe srcdoc="<script>' + marker + '</script>">Papa',
      mama: 'Mama & Co',
      photos: ['javascript:' + marker],
      coverIndex: 0,
    }],
    parents: [{
      id: hostileId,
      name: '<img src=x onerror="' + marker + '">Parent',
      breed: '<svg onload="' + marker + '">Breed',
      gender: '♂',
      color: 'gold & white',
      age: '2歳',
      role: 'パパ猫',
      tested: true,
      photos: ['https://images.example.test/parent.jpg'],
      coverIndex: 0,
    }],
    reviews: [{
      id: hostileId,
      author: '<img onerror="' + marker + '">A様',
      region: '<svg onload="' + marker + '">大阪',
      date: '2026年1月',
      body: '<script>' + marker + '</script> 丁寧でした',
    }],
  };
  const storage = new Map([
    ['fuluck-admin-log', JSON.stringify([{ time: '<img onerror="' + marker + '">now', msg: '<svg onload="' + marker + '">changed' }])],
  ]);
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    data,
    localStorage: { getItem(key) { return storage.get(key) || null; }, setItem() {} },
    LOG_KEY: 'fuluck-admin-log',
    PAGE_SIZE: 10,
    kittenPage: 1,
    parentPage: 1,
    getCoverPhoto(item) { return item.photos && item.photos[item.coverIndex || 0] || ''; },
    renderPagination() {},
    t(ja) { return ja; },
    openModal() {},
    showToast() {},
    addLog() {},
    saveAndPublishFromUI() {},
    confirm() { return true; },
    prompt() { return null; },
    getData() { return data; },
    pageTitles: { dashboard: 'ダッシュボード' },
    loadImageConfig() {},
    applyAdminLang() {},
  });
  vm.runInContext(IMAGES_SOURCE, context, { filename: 'admin-images.js' });
  vm.runInContext(RENDER_SOURCE, context, { filename: 'admin-render.js' });
  return { context, elements, data, marker, hostileId };
}

test('catalogue rows, reviews, parent options, and change logs render hostile fields as inert text', () => {
  const { context, elements, marker, hostileId } = renderHarness();

  context.renderDashboard();
  context.renderKittens('all');
  context.renderParents('all');
  context.renderReviews();
  context.openKittenForm(context.data.kittens[0]);

  ['changeLog', 'kittensTableBody', 'parentsTableBody', 'reviewsTableBody', 'kf_papa', 'kf_mama'].forEach((id) => {
    assert.deepEqual(elements.get(id).htmlWrites, [], id + ' must not assemble remote/user fields through innerHTML');
  });
  const combinedText = ['changeLog', 'kittensTableBody', 'parentsTableBody', 'reviewsTableBody', 'kf_papa']
    .map((id) => visibleText(elements.get(id))).join('\n');
  assert.match(combinedText, /<img src=x onerror=/, 'hostile-looking values remain visible as literal text');
  assert.match(combinedText, /<svg onload=/);
  assert.match(combinedText, /<script>/);
  assert.match(visibleText(elements.get('kittensTableBody')), /キャンペーン #999/);
  assert.equal(context.__adminRenderPwned, undefined);

  const tableImages = ['kittensTableBody', 'parentsTableBody']
    .flatMap((id) => descendants(elements.get(id)).filter((node) => node.tagName === 'IMG'));
  assert.equal(tableImages.length, 1, 'unsafe javascript photo is replaced while the safe HTTPS photo renders');
  assert.equal(tableImages[0].src, 'https://images.example.test/parent.jpg');

  const kittenButtons = descendants(elements.get('kittensTableBody')).filter((node) => node.tagName === 'BUTTON');
  assert.ok(kittenButtons.length >= 5);
  assert.ok(kittenButtons.every((button) => !button.getAttribute('onclick')));
  let edited = null;
  context.editKitten = function(id) { edited = id; };
  kittenButtons.find((button) => button.textContent === '編集').click();
  assert.equal(edited, hostileId, 'listener closes over the exact id without source-code interpolation');
  assert.equal(context.__adminRenderPwned, undefined);
});

test('promotion badge carries both translations and switches with applyAdminLang without HTML writes', () => {
  const { context, elements } = renderHarness();
  context.renderKittens('all');
  const badge = descendants(elements.get('kittensTableBody')).find((node) => (
    node.getAttribute('data-adm-ja') === 'キャンペーン #999'
  ));

  assert.ok(badge, 'promotion badge must expose its Japanese translation');
  assert.equal(badge.getAttribute('data-adm-zh'), '活动 #999');
  assert.equal(badge.textContent, 'キャンペーン #999');

  context.admLang = 'zh';
  context.applyAdminLang();

  assert.equal(badge.textContent, '活动 #999');
  assert.deepEqual(badge.htmlWrites, []);
});

function photosHarness() {
  const { document, elements } = createDocument({
    galleryGrid: 'div', photo_type: 'input', photo_id: 'input', newPhotoUrl: 'input',
    photoUploadInput: 'input', uploadPhotoBtn: 'button',
  });
  elements.get('photo_type').value = 'kitten';
  elements.get('photo_id').value = 'k1';
  elements.get('uploadPhotoBtn').innerHTML = '<span>Upload</span>';
  elements.get('uploadPhotoBtn').htmlWrites = [];
  const calls = { toasts: [], deleted: null, cover: null };
  const data = { kittens: [{ id: 'k1', breederId: 'K1', photos: [], coverIndex: 0 }], parents: [] };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    data,
    t(ja) { return ja; },
    showToast(message, type) { calls.toasts.push({ message, type }); },
    saveAndPublishFromUI() {},
    renderAll() {},
    addLog() {},
    confirm() { return true; },
    openModal() {},
    loadDrivePhotosForItem() {},
  });
  vm.runInContext(PHOTOS_SOURCE, context, { filename: 'admin-photos.js' });
  return { context, elements, data, calls };
}

test('photo gallery renders only safe image URLs and binds controls without inline handlers', () => {
  const { context, elements } = photosHarness();
  const marker = 'globalThis.__adminPhotoPwned=true';
  const item = {
    photos: [
      'javascript:' + marker,
      'https://images.example.test/a.jpg',
      '/images/local.webp',
      'data:image/svg+xml,<svg onload="' + marker + '">',
    ],
    coverIndex: 1,
  };
  let deleted = null;
  context.deleteGalleryPhoto = function(index) { deleted = index; };

  context.renderGalleryGrid(item);

  const grid = elements.get('galleryGrid');
  assert.deepEqual(grid.htmlWrites, [], 'photo URLs must not enter innerHTML');
  const images = descendants(grid).filter((node) => node.tagName === 'IMG');
  assert.deepEqual(images.map((img) => img.src), ['https://images.example.test/a.jpg', '/images/local.webp']);
  const buttons = descendants(grid).filter((node) => node.tagName === 'BUTTON');
  assert.ok(buttons.every((button) => !button.getAttribute('onclick')));
  buttons.find((button) => button.textContent === '✕').click();
  assert.equal(deleted, 0);
  assert.equal(context.__adminPhotoPwned, undefined);
});

test('manual photo entry rejects dangerous protocols before mutating catalogue data', () => {
  const { context, elements, data, calls } = photosHarness();
  elements.get('newPhotoUrl').value = 'javascript:globalThis.__adminPhotoPwned=true';

  context.addGalleryPhoto();

  assert.deepEqual(data.kittens[0].photos, []);
  assert.equal(calls.toasts.at(-1).type, 'error');
  assert.equal(context.__adminPhotoPwned, undefined);
});

function driveHarness(fetchImpl) {
  const { document, elements } = createDocument({
    drivePhotoSection: 'section', drivePhotoGrid: 'div', drivePhotoStatus: 'span',
    driveStatusArea: 'div', driveRefreshBtn: 'button', drivePhotoImportBtn: 'button',
    photo_type: 'input', photo_id: 'input',
  });
  const photoParent = element('div', 'drivePhotoParent');
  photoParent.appendChild(elements.get('drivePhotoGrid'));
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    fetch: fetchImpl,
    DRIVE_API: 'https://fuluck-api.example.test',
    admLang: 'ja',
    data: { kittens: [], parents: [] },
    getSessionPass() { return 'test-pass'; },
    showToast() {},
    saveAndPublishFromUI() {},
    renderGalleryGrid() {},
    renderAll() {},
    addLog() {},
    t(ja) { return ja; },
    confirm() { return true; },
  });
  vm.runInContext(DRIVE_SOURCE, context, { filename: 'admin-drive.js' });
  return { context, elements, photoParent };
}

test('Drive folder/photo metadata is encoded for requests and rendered only through DOM text and listeners', async () => {
  const marker = 'globalThis.__adminDrivePwned=true';
  const folderName = '<img onerror="' + marker + '">folder';
  const folderId = 'folder/../?x=<svg>';
  const imageId = 'image/../?x=<script>';
  const calls = [];
  const { context, elements, photoParent } = driveHarness((url) => {
    calls.push(url);
    if (url.includes('/folders/')) return Promise.resolve({ json: () => Promise.resolve([{ id: folderId, name: folderName }]) });
    return Promise.resolve({ json: () => Promise.resolve([{ id: imageId, name: '<svg onload="' + marker + '">01.jpg' }]) });
  });

  await context.loadDrivePhotosForItem('kitten', { breederId: folderName, photos: [] });

  assert.equal(calls[1], 'https://fuluck-api.example.test/api/drive/images/' + encodeURIComponent(folderId));
  const grid = elements.get('drivePhotoGrid');
  assert.deepEqual(grid.htmlWrites, [], 'Drive metadata must not enter innerHTML');
  assert.match(visibleText(grid), /<svg onload=/);
  const image = descendants(grid).find((node) => node.tagName === 'IMG');
  assert.equal(image.src, 'https://fuluck-api.example.test/api/drive/img/' + encodeURIComponent(imageId));
  const checkbox = descendants(grid).find((node) => node.tagName === 'INPUT');
  assert.ok(checkbox._listeners.change && checkbox._listeners.change.length === 1);
  assert.equal(checkbox.getAttribute('onchange'), null);
  const importButton = descendants(photoParent).find((node) => node.id === 'drivePhotoImportBtn');
  assert.ok(importButton._listeners.click && importButton._listeners.click.length === 1);
  assert.equal(importButton.getAttribute('onclick'), null);
  assert.equal(context.__adminDrivePwned, undefined);
});

test('Drive status fields and API errors remain inert visible text', async () => {
  const marker = 'globalThis.__adminDrivePwned=true';
  let reject = false;
  const { context, elements } = driveHarness(() => {
    if (reject) return Promise.reject(new Error('<img onerror="' + marker + '">offline'));
    return Promise.resolve({
      json: () => Promise.resolve({
        ['<svg onload="' + marker + '">category']: {
          subfolders: [{
            name: '<img onerror="' + marker + '">folder',
            imageCount: 1,
            images: [{ name: '<script>' + marker + '</script>01.jpg' }],
          }],
        },
      }),
    });
  });

  await context.loadDriveStatus();
  const area = elements.get('driveStatusArea');
  assert.deepEqual(area.htmlWrites, [], 'Drive status data must not enter innerHTML');
  assert.match(visibleText(area), /<svg onload=/);
  assert.match(visibleText(area), /<img onerror=/);
  assert.match(visibleText(area), /<script>/);

  reject = true;
  await context.loadDriveStatus();
  assert.deepEqual(area.htmlWrites, []);
  assert.match(visibleText(area), /<img onerror=.*offline/);
  assert.equal(context.__adminDrivePwned, undefined);
});
