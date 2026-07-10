'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'admin/index.html'), 'utf8');
const MODULE_PATH = path.join(ROOT, 'admin/js/admin-small-animals.js');

function element(tagName, id) {
  const listeners = Object.create(null);
  const node = {
    id: id || '',
    tagName: String(tagName || 'div').toUpperCase(),
    children: [],
    parentNode: null,
    style: {},
    className: '',
    type: '',
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    hidden: false,
    dataset: {},
    attributes: {},
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
      this.children = [];
      children.forEach((child) => this.appendChild(child));
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    addEventListener(type, listener) {
      (listeners[type] ||= []).push(listener);
    },
    click() {
      (listeners.click || []).forEach((listener) => listener({ currentTarget: this, target: this }));
    },
    querySelectorAll(selector) {
      if (selector === 'button, input, select, textarea') {
        return descendants(this).filter((child) => ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(child.tagName));
      }
      return [];
    },
    _listeners: listeners,
  };
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
  let output = root.textContent || '';
  root.children.forEach(function(child) { output += visibleText(child); });
  return output;
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

function harness(apiItems, behavior = {}) {
  assert.ok(fs.existsSync(MODULE_PATH), 'admin/js/admin-small-animals.js must exist');
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const elements = new Map();
  const calls = { get: [], post: [], put: [], del: [], upload: [], toasts: [], logs: [], opened: [], closed: [] };
  const ids = [
    'smallAnimalsTableBody', 'smallAnimalLoadStatus', 'smallAnimalRetryBtn', 'smallAnimalAddBtn',
    'smallAnimalFormModal', 'smallAnimalFormTitle', 'smallAnimalEditId', 'smallAnimalSaveBtn',
    'sa_breederId', 'sa_species', 'sa_breed', 'sa_color', 'sa_gender', 'sa_price', 'sa_status',
    'sa_birthday', 'sa_photos', 'sa_coverIndex', 'sa_video', 'sa_note', 'sa_isNew',
    'photoModal', 'photo_type', 'photo_id', 'galleryGrid', 'drivePhotoSection', 'newPhotoUrl',
    'photoUploadInput', 'uploadPhotoBtn', 'addNewBtn', 'pageTitle',
  ];
  ids.forEach((id) => elements.set(id, element(id.endsWith('TableBody') ? 'tbody' : 'input', id)));
  elements.get('photoUploadInput').files = [];
  elements.get('uploadPhotoBtn').innerHTML = 'upload';

  const nav = element('button', 'smallAnimalNav');
  nav.dataset.page = 'small-animals';
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element('input', id));
      return elements.get(id);
    },
    createElement(tagName) {
      return element(tagName);
    },
    querySelector(selector) {
      if (selector === '[data-page="small-animals"]') return nav;
      if (selector === '.nav-item.active') return nav;
      return null;
    },
    querySelectorAll() { return []; },
  };

  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    document,
    FuluckAPI: {
      get(pathname) {
        calls.get.push(pathname);
        return behavior.get ? behavior.get(pathname) : Promise.resolve(json(apiItems));
      },
      post(pathname, body) {
        calls.post.push({ pathname, body: json(body) });
        return behavior.post ? behavior.post(pathname, body) : Promise.resolve(json(body));
      },
      put(pathname, body) {
        calls.put.push({ pathname, body: json(body) });
        return behavior.put ? behavior.put(pathname, body) : Promise.resolve(json(body));
      },
      del(pathname) {
        calls.del.push(pathname);
        return behavior.del ? behavior.del(pathname) : Promise.resolve({ success: true });
      },
      uploadFile(file) {
        calls.upload.push(file);
        return behavior.uploadFile ? behavior.uploadFile(file) : Promise.resolve({ url: 'https://example.test/upload.jpg', key: 'uploads/upload.jpg' });
      },
    },
    t(ja) { return ja; },
    openModal(id) { calls.opened.push(id); },
    closeModal(id) { calls.closed.push(id); },
    showToast(message, type) { calls.toasts.push({ message, type }); },
    addLog(message) { calls.logs.push(message); },
    confirm() { return behavior.confirm !== undefined ? behavior.confirm : true; },
    pageTitles: {},
    pageTitlesZh: {},
    setTimeout,
    clearTimeout,
    Promise,
    encodeURIComponent,
  });
  vm.runInContext(source, context, { filename: 'admin-small-animals.js' });
  return { context, elements, calls, nav };
}

function setForm(elements, values) {
  const fields = Object.assign({
    smallAnimalEditId: '',
    sa_breederId: 'RB-001',
    sa_species: 'rabbit',
    sa_breed: 'ネザーランドドワーフ',
    sa_color: 'ブルー',
    sa_gender: '♂',
    sa_price: '120000',
    sa_status: 'available',
    sa_birthday: '2026-05-12',
    sa_photos: 'https://example.test/one.jpg\nhttps://example.test/two.jpg',
    sa_coverIndex: '1',
    sa_video: 'https://youtu.be/example',
    sa_note: '健康診断済み',
    sa_isNew: 'true',
  }, values || {});
  Object.entries(fields).forEach(([id, value]) => { elements.get(id).value = value; });
}

test('admin page wires one small-animal tab, safe table, complete form, and no parent fields', () => {
  assert.match(HTML, /data-page="small-animals"/);
  assert.match(HTML, /id="page-small-animals"/);
  assert.match(HTML, /id="smallAnimalsTableBody"/);
  assert.match(HTML, /id="smallAnimalFormModal"/);
  [
    'sa_breederId', 'sa_species', 'sa_breed', 'sa_color', 'sa_gender', 'sa_price', 'sa_status',
    'sa_birthday', 'sa_photos', 'sa_coverIndex', 'sa_video', 'sa_note', 'sa_isNew',
  ].forEach((id) => assert.match(HTML, new RegExp('id="' + id + '"')));
  assert.doesNotMatch(HTML, /id="sa_(?:papa|mama)"/);
  assert.match(HTML, /<option value="rabbit">/);
  assert.match(HTML, /type="month" id="sa_birthday"/);
  assert.match(HTML, /<script src="js\/admin-small-animals\.js\?v=20260710a"><\/script>/);
});

test('authenticated full collection read is fail-closed and renders hostile values as literal text', async () => {
  const hostileId = "RB-');globalThis.__smallAnimalPwned=true;//";
  const hostile = {
    breederId: hostileId,
    species: 'rabbit',
    breed: '<img src=x onerror="globalThis.__smallAnimalPwned=true">',
    color: '<svg onload="globalThis.__smallAnimalPwned=true">',
    gender: '♂',
    price: 99000,
    status: 'available',
    birthday: '2026-05-12',
    photos: ['javascript:globalThis.__smallAnimalPwned=true'],
    coverIndex: 0,
  };
  const { context, calls, elements } = harness([hostile]);

  assert.equal(await context.loadSmallAnimals(), true);
  assert.deepEqual(calls.get, ['/api/admin/small-animals']);
  assert.equal(context.smallAnimalsRemoteReady, true);
  assert.deepEqual(json(context.smallAnimals), [hostile]);

  const tbody = elements.get('smallAnimalsTableBody');
  assert.equal(tbody.innerHTML, '', 'remote values must never be interpolated into innerHTML');
  assert.match(visibleText(tbody), /<img src=x onerror=/);
  assert.match(visibleText(tbody), /<svg onload=/);
  assert.equal(descendants(tbody).filter((node) => node.tagName === 'IMG').length, 0, 'unsafe photo protocols are not rendered');
  assert.equal(context.__smallAnimalPwned, undefined);

  const buttons = descendants(tbody).filter((node) => node.tagName === 'BUTTON');
  assert.equal(buttons.length, 3);
  let edited = null;
  context.editSmallAnimal = function(id) { edited = id; };
  buttons[1].click();
  assert.equal(edited, hostileId, 'listener preserves the exact breederId without inline JavaScript');
});

test('failed or invalid reads preserve previous state and lock every write path', async () => {
  const previous = [{ breederId: 'KEEP', species: 'rabbit', photos: [] }];
  const { context, calls, elements } = harness(null, {
    get() { return Promise.resolve({ success: false, items: [] }); },
  });
  context.smallAnimals = json(previous);
  setForm(elements, { sa_breederId: 'MUST-NOT-WRITE' });
  elements.get('photo_type').value = 'small-animal';
  elements.get('photo_id').value = 'KEEP';
  elements.get('newPhotoUrl').value = 'https://example.test/new.jpg';

  assert.equal(await context.loadSmallAnimals(), false);
  assert.equal(context.smallAnimalsRemoteReady, false);
  assert.deepEqual(json(context.smallAnimals), previous);
  assert.equal(await context.saveSmallAnimal(), false);
  assert.equal(await context.deleteSmallAnimal('KEEP'), false);
  assert.equal(await context.smallAnimalAddGalleryPhoto(), false);
  assert.deepEqual(calls.post, []);
  assert.deepEqual(calls.put, []);
  assert.deepEqual(calls.del, []);
  assert.deepEqual(json(context.smallAnimals), previous);
});

test('create sends the complete schema without papa or mama and blocks duplicate in-flight POSTs', async () => {
  let resolveCreate;
  const { context, calls, elements } = harness([], {
    post(pathname, body) {
      return new Promise((resolve) => { resolveCreate = () => resolve(json(body)); });
    },
  });
  await context.loadSmallAnimals();
  setForm(elements);

  const first = context.saveSmallAnimal();
  const duplicate = context.saveSmallAnimal();
  assert.equal(await duplicate, false);
  assert.equal(calls.post.length, 1);
  assert.equal(calls.post[0].pathname, '/api/admin/small-animals');
  assert.deepEqual(Object.keys(calls.post[0].body).sort(), [
    'birthday', 'breed', 'breederId', 'color', 'coverIndex', 'gender', 'isNew', 'note',
    'photos', 'price', 'species', 'status', 'video',
  ]);
  assert.equal('papa' in calls.post[0].body, false);
  assert.equal('mama' in calls.post[0].body, false);
  assert.equal(context.smallAnimals.length, 0, 'local state stays unchanged while POST is pending');

  resolveCreate();
  assert.equal(await first, true);
  assert.equal(context.smallAnimals.length, 1);
  assert.equal(context.smallAnimals[0].coverIndex, 0, 'owner-facing photo number 1 maps to zero-based coverIndex');
});

test('successful writes HTML-escape breeder ids before they enter the legacy innerHTML change log', async () => {
  const hostileId = '<img src=x onerror="globalThis.__logPwned=true">';
  const { context, calls, elements } = harness([]);
  await context.loadSmallAnimals();
  setForm(elements, { sa_breederId: hostileId });

  assert.equal(await context.saveSmallAnimal(), true);
  assert.equal(calls.logs.length, 1);
  assert.doesNotMatch(calls.logs[0], /<img/i);
  assert.match(calls.logs[0], /&lt;img/);
  assert.equal(context.__logPwned, undefined);
});

test('client rejects the reserved bulk id and unknown status before any write', async () => {
  const first = harness([]);
  await first.context.loadSmallAnimals();
  setForm(first.elements, { sa_breederId: 'bulk' });
  assert.equal(await first.context.saveSmallAnimal(), false);
  assert.equal(first.calls.post.length, 0);

  const second = harness([]);
  await second.context.loadSmallAnimals();
  setForm(second.elements, { sa_status: 'hidden' });
  assert.equal(await second.context.saveSmallAnimal(), false);
  assert.equal(second.calls.post.length, 0);
});

test('small-animal navigation does not leave the shared add button disabled for cat pages', async () => {
  const { nav, elements } = harness([], { get() { return Promise.reject(new Error('offline')); } });
  nav.click();
  await new Promise(setImmediate);
  assert.equal(elements.get('addNewBtn').style.display, 'inline-flex');
  assert.equal(elements.get('addNewBtn').disabled, false, 'shared button state remains owned by admin-core navigation');
});

test('failed edit and delete preserve the full local collection; success uses encoded item routes', async () => {
  const id = 'RB / 001';
  const initial = [{ breederId: id, species: 'rabbit', breed: '旧品種', color: '旧色', photos: [], coverIndex: 0 }];
  let rejectWrites = true;
  const { context, calls, elements } = harness(initial, {
    put(pathname, body) {
      return rejectWrites ? Promise.reject(new Error('edit failed')) : Promise.resolve(Object.assign({}, body, { note: 'server' }));
    },
    del() {
      return rejectWrites ? Promise.reject(new Error('delete failed')) : Promise.resolve({ success: true });
    },
  });
  await context.loadSmallAnimals();
  setForm(elements, { smallAnimalEditId: id, sa_breederId: id, sa_breed: '新品種', sa_photos: '', sa_coverIndex: '0' });

  assert.equal(await context.saveSmallAnimal(), false);
  assert.deepEqual(json(context.smallAnimals), initial);
  assert.equal(context.smallAnimalsRemoteReady, false, 'uncertain failed write locks the stale collection');
  assert.equal(await context.loadSmallAnimals(), true);
  assert.equal(await context.deleteSmallAnimal(id), false);
  assert.deepEqual(json(context.smallAnimals), initial);
  assert.equal(context.smallAnimalsRemoteReady, false);

  rejectWrites = false;
  assert.equal(await context.loadSmallAnimals(), true);
  assert.equal(await context.saveSmallAnimal(), true);
  assert.equal(calls.put[1].pathname, '/api/admin/small-animals/' + encodeURIComponent(id));
  assert.equal(context.smallAnimals[0].breed, '新品種');
  assert.equal(context.smallAnimals[0].note, 'server');

  assert.equal(await context.deleteSmallAnimal(id), true);
  assert.deepEqual(calls.del, [
    '/api/admin/small-animals/' + encodeURIComponent(id),
    '/api/admin/small-animals/' + encodeURIComponent(id),
  ]);
  assert.deepEqual(json(context.smallAnimals), []);
});

test('photo edits and uploads use the existing uploader but update local photos only after item PUT succeeds', async () => {
  const initial = [{ breederId: 'RB-PHOTO', species: 'rabbit', photos: ['https://example.test/old.jpg'], coverIndex: 0 }];
  let failPut = true;
  const { context, calls, elements } = harness(initial, {
    put(pathname, body) {
      return failPut ? Promise.reject(new Error('photo save failed')) : Promise.resolve(json(body));
    },
    uploadFile(file) {
      return Promise.resolve({ url: 'https://example.test/' + file.name, key: 'uploads/' + file.name });
    },
  });
  await context.loadSmallAnimals();
  context.openSmallAnimalPhotoModal('RB-PHOTO');
  elements.get('newPhotoUrl').value = 'https://example.test/new.jpg';

  assert.equal(await context.smallAnimalAddGalleryPhoto(), false);
  assert.deepEqual(json(context.smallAnimals), initial);
  assert.equal(context.smallAnimalsRemoteReady, false, 'failed photo PUT requires a fresh full read');

  failPut = false;
  assert.equal(await context.loadSmallAnimals(), true);
  context.openSmallAnimalPhotoModal('RB-PHOTO');
  elements.get('newPhotoUrl').value = 'https://example.test/new.jpg';
  assert.equal(await context.smallAnimalAddGalleryPhoto(), true);
  assert.deepEqual(json(context.smallAnimals[0].photos), ['https://example.test/old.jpg', 'https://example.test/new.jpg']);
  assert.equal(calls.put.at(-1).pathname, '/api/admin/small-animals/RB-PHOTO');

  elements.get('photoUploadInput').files = [{ name: 'rabbit.webp' }];
  assert.equal(await context.smallAnimalUploadPhotosFromDevice(), true);
  assert.equal(calls.upload.length, 1);
  assert.deepEqual(json(context.smallAnimals[0].photos), [
    'https://example.test/old.jpg',
    'https://example.test/new.jpg',
    'https://example.test/rabbit.webp',
  ]);
});

test('photo modal integration delegates only the small-animal branch and leaves cat code paths intact', () => {
  const photosSource = fs.readFileSync(path.join(ROOT, 'admin/js/admin-photos.js'), 'utf8');
  assert.match(photosSource, /type === 'small-animal'/);
  assert.match(photosSource, /smallAnimalAddGalleryPhoto/);
  assert.match(photosSource, /smallAnimalDeleteGalleryPhoto/);
  assert.match(photosSource, /smallAnimalSetGalleryCover/);
  assert.match(photosSource, /smallAnimalUploadPhotosFromDevice/);
  assert.match(photosSource, /if \(type === 'kitten'\) item = data\.kittens/);
});
