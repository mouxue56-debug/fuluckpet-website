// admin-core.js — Default data, constants, data management, auth, navigation, modal/toast
// Depends on: admin-images.js (admLang, t())

var DEFAULT_KITTENS = [
  { id:'k1', breederId:'2602-00625', breed:'サイベリアン', gender:'♂', color:'ブルーリンクスポイント ネヴァマスカレード', birthday:'2025-12', price:200000, status:'available', papa:'しろくん', mama:'大蓝ちゃん', isNew:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724780473-b1cd27ac.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k2', breederId:'2601-01855', breed:'サイベリアン', gender:'♂', color:'シルバータビー トリプルコート', birthday:'2025-12', price:250000, status:'available', papa:'しろくん', mama:'小郭ちゃん', isNew:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724768508-19a4ab1e.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k3', breederId:'2601-00909', breed:'サイベリアン', gender:'♀', color:'ブルーリンクスポイント ネヴァマスカレード', birthday:'2025-12', price:280000, status:'available', papa:'しろくん', mama:'大蓝ちゃん', isNew:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724781684-5154c156.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k4', breederId:'2509-01171', breed:'サイベリアン', gender:'♂', color:'レッドリンクスポイント', birthday:'2025-05', price:250000, status:'available', papa:'しろくん', mama:'咬咬ちゃん', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724765546-deb1b3e1.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k5', breederId:'2511-02287', breed:'サイベリアン', gender:'♂', color:'ブラウンタビー トリプルコート', birthday:'2025-10', price:220000, status:'available', papa:'しろくん', mama:'圆圆ちゃん', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724766657-4486a4c8.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k6', breederId:'2509-02086', breed:'サイベリアン', gender:'♀', color:'シルバータビー', birthday:'2025-06', price:190000, status:'available', papa:'しろくん', mama:'dodoちゃん', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724774443-2110d506.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k7', breederId:'2511-01887', breed:'サイベリアン', gender:'♂', color:'ホワイト トリプルコート', birthday:'2025-09', price:250000, status:'available', papa:'しろくん', mama:'小蓝ちゃん', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724767099-daf4c384.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k8', breederId:'2601-00912', breed:'サイベリアン', gender:'♀', color:'ブルーリンクスポイント ネヴァマスカレード', birthday:'2025-12', price:200000, status:'available', papa:'しろくん', mama:'大蓝ちゃん', isNew:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724769894-834a62aa.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k9', breederId:'2508-00310', breed:'サイベリアン', gender:'♂', color:'シルバーシェーデッド', birthday:'2025-06', price:220000, status:'available', papa:'しろくん', mama:'Paopaoちゃん', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724782119-53354ad6.jpg'], coverIndex:0, note:'去勢済み', group:'c995680' },
  { id:'k10', breederId:'2512-01681', breed:'サイベリアン', gender:'♂', color:'ブルーパッチドタビー＆ホワイト', birthday:'2025-10', price:220000, status:'available', papa:'', mama:'', isNew:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724770339-8e9c46b2.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k11', breederId:'2510-01286', breed:'サイベリアン', gender:'♀', color:'ブラウンタビー トリプルコート', birthday:'2025-07', price:200000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724777494-1f944081.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k12', breederId:'2511-00142', breed:'サイベリアン', gender:'♂', color:'ホワイト', birthday:'2025-07', price:200000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724767492-9b7274a7.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k13', breederId:'2511-00143', breed:'サイベリアン', gender:'♀', color:'ホワイト', birthday:'2025-07', price:180000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724762077-cb44f2ab.jpg'], coverIndex:0, note:'', group:'c995680' },
  { id:'k14', breederId:'2508-02468', breed:'サイベリアン', gender:'♂', color:'シルバー＆ホワイト トリプルコート', birthday:'2025-06', price:190000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724778894-fa2e1ab5.jpg'], coverIndex:0, note:'去勢済み', group:'c995680' },
  { id:'k15', breederId:'2509-01027', breed:'サイベリアン', gender:'♂', color:'レッドリンクスポイント トリプルコート', birthday:'2025-05', price:220000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724777102-302d0e18.jpg'], coverIndex:0, note:'去勢済み', group:'c995680' },
  { id:'k16', breederId:'2508-03366', breed:'ブリティッシュショートヘア', gender:'♀', color:'ゴールデンシェーデッド', birthday:'2025-05', price:280000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724790937-cf36f2d3.jpg'], coverIndex:0, note:'', group:'d696506' },
  { id:'k17', breederId:'2508-03312', breed:'ブリティッシュショートヘア', gender:'♀', color:'チンチラゴールデン ロングヘア', birthday:'2025-05', price:280000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724794331-f982177a.jpg'], coverIndex:0, note:'', group:'d696506' },
  { id:'k18', breederId:'2508-03355', breed:'ブリティッシュショートヘア', gender:'♂', color:'ゴールデンシェーデッド', birthday:'2025-05', price:240000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724797827-261810d4.jpg'], coverIndex:0, note:'', group:'d696506' },
  { id:'k19', breederId:'2509-00562', breed:'ブリティッシュショートヘア', gender:'♀', color:'ゴールデンシェーデッド＆ホワイト', birthday:'2025-05', price:160000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724797066-d278551c.jpg'], coverIndex:0, note:'', group:'d696506' },
  { id:'k20', breederId:'2512-00115', breed:'サイベリアン×ブリティッシュ', gender:'♀', color:'ブラウンタビー＆ホワイト', birthday:'2025-09', price:140000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724793095-84d370a3.jpg'], coverIndex:0, note:'', group:'d696506' },
  { id:'k21', breederId:'2509-02907', breed:'ブリティッシュショートヘア', gender:'♀', color:'ブラウンタビー＆ホワイト', birthday:'2025-08', price:160000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724791404-3dc807cf.jpg'], coverIndex:0, note:'', group:'d696506' },
  { id:'k22', breederId:'2510-01844', breed:'ブリティッシュショートヘア', gender:'♂', color:'ホワイト', birthday:'2025-08', price:160000, status:'available', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724793677-ae246e25.jpg'], coverIndex:0, note:'', group:'d696506' },
  { id:'k23', breederId:'2408-03054', breed:'ブリティッシュロングヘア', gender:'♂', color:'チョコレートゴールデン ロングヘア', birthday:'2024-02', price:290000, status:'reserved', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724792086-05d4652e.jpg'], coverIndex:0, note:'', group:'d696506' },
  { id:'k24', breederId:'2512-00112', breed:'サイベリアン×ブリティッシュ', gender:'♂', color:'ホワイト', birthday:'2025-09', price:150000, status:'reserved', papa:'', mama:'', isNew:false, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724795680-33003d85.jpg'], coverIndex:0, note:'', group:'d696506' },
];

var DEFAULT_PARENTS = [
  { id:'p1', name:'しろくん', breed:'サイベリアン', gender:'♂', role:'パパ猫', age:'3歳', color:'ホワイト', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724757360-8754519e.jpg'], coverIndex:0, group:'c995680' },
  { id:'p2', name:'大蓝ちゃん', breed:'サイベリアン', gender:'♀', role:'ママ猫', age:'1歳', color:'ホワイト', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724758769-1575b2eb.jpg'], coverIndex:0, group:'c995680' },
  { id:'p3', name:'Paopaoちゃん', breed:'サイベリアン', gender:'♀', role:'ママ猫', age:'2歳', color:'シルバー', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724758030-703ef2d7.jpg'], coverIndex:0, group:'c995680' },
  { id:'p4', name:'小郭ちゃん', breed:'サイベリアン', gender:'♀', role:'ママ猫', age:'2歳', color:'ダイリュートキャリコ', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724756212-b0c6526f.jpg'], coverIndex:0, group:'c995680' },
  { id:'p5', name:'咬咬ちゃん', breed:'サイベリアン', gender:'♀', role:'ママ猫', age:'2歳', color:'シルバータビー＆ホワイト', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724756790-874c52a3.jpg'], coverIndex:0, group:'c995680' },
  { id:'p6', name:'dodoちゃん', breed:'サイベリアン', gender:'♀', role:'ママ猫', age:'2歳', color:'シルバー＆ホワイト', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724759631-0726a94c.jpg'], coverIndex:0, group:'c995680' },
  { id:'p7', name:'小蓝ちゃん', breed:'サイベリアン', gender:'♀', role:'ママ猫', age:'2歳', color:'ホワイト', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724759229-8ff4207f.jpg'], coverIndex:0, group:'c995680' },
  { id:'p8', name:'圆圆ちゃん', breed:'サイベリアン', gender:'♀', role:'ママ猫', age:'3歳', color:'ホワイト', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724755582-e0f3687b.jpg'], coverIndex:0, group:'c995680' },
  { id:'p9', name:'李白くん', breed:'ブリティッシュロングヘア', gender:'♂', role:'パパ猫', age:'2歳', color:'ゴールデンポイント', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724787836-be43939e.jpg'], coverIndex:0, group:'d696506' },
  { id:'p10', name:'Chouちゃん', breed:'ブリティッシュショートヘア', gender:'♀', role:'ママ猫', age:'2歳', color:'チョコレートゴールデン', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724787346-3b1d68c8.jpg'], coverIndex:0, group:'d696506' },
  { id:'p11', name:'チョコちゃん', breed:'ラグドール', gender:'♀', role:'ママ猫', age:'2歳', color:'シールポイントバイカラー', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724786768-6174bc94.jpg'], coverIndex:0, group:'d696506' },
  { id:'p12', name:'Jiaくん', breed:'ラグドール', gender:'♂', role:'パパ猫', age:'3歳', color:'シールリンクスポイント', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724786019-a821aa18.jpg'], coverIndex:0, group:'d696506' },
  { id:'p13', name:'王子くん', breed:'ブリティッシュロングヘア', gender:'♂', role:'パパ猫', age:'3歳', color:'チョコレートゴールデン', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724789070-d8fd874f.jpg'], coverIndex:0, group:'d696506' },
  { id:'p14', name:'パンちゃん', breed:'ブリティッシュショートヘア', gender:'♀', role:'ママ猫', age:'4歳', color:'チョコレートゴールデン', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724784960-2c3e8238.jpg'], coverIndex:0, group:'d696506' },
  { id:'p15', name:'壮くん', breed:'ブリティッシュロングヘア', gender:'♂', role:'パパ猫', age:'4歳', color:'チョコレートゴールデン', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724784550-0fe3809c.jpg'], coverIndex:0, group:'d696506' },
  { id:'p16', name:'Shoちゃん', breed:'ブリティッシュショートヘア', gender:'♀', role:'ママ猫', age:'4歳', color:'チョコレートゴールデン', tested:true, photos:['https://fuluck-api.mouxue56.workers.dev/r2/uploads/1770724788261-ecb82654.jpg'], coverIndex:0, group:'d696506' },
];

var DEFAULT_REVIEWS = [
  { id:'r1', author:'L.A様', region:'大阪府', date:'2026年1月', body:'質問にも丁寧に答えてくださり、引き渡し前には爪切りやシャンプーまで準備してくださいました。とても安心してお迎えすることができました。アフターフォローも手厚く、感謝しています。' },
  { id:'r2', author:'Kei様', region:'滋賀県', date:'2026年1月', body:'説明がとても分かりやすく、素晴らしいブリーダーさんです。可愛い子猫をお迎えでき、食事やケアについても丁寧にアドバイスいただきました。これからの成長が楽しみです。' },
  { id:'r3', author:'H.U様', region:'大阪府', date:'2026年1月', body:'初めて猫を飼いましたが、とても丁寧にサポートしていただけました。子猫はすぐにご飯を食べてくれて、人懐こくてとても可愛いです。LINEでの相談にも迅速に対応してくださり助かっています。' },
  { id:'r4', author:'D.S様', region:'和歌山県', date:'2026年1月', body:'予定変更にも柔軟に対応してくださり、子猫の成長動画も送ってくださいました。ブリーダーさんの猫への愛情がとても伝わります。お迎えした子猫はとても元気で幸せです。' },
  { id:'r5', author:'ドラム様', region:'大阪府', date:'2025年12月', body:'動物への愛情が本物だと感じられるブリーダーさんです。お迎え初日からすぐに馴染んでくれました。環境が素晴らしく、子猫の社会化もしっかりされています。' },
  { id:'r6', author:'T様', region:'東京都', date:'2025年12月', body:'遠方からでしたが、LINEビデオ通話で事前に子猫を見せていただきました。実物はさらに可愛く、性格もとても穏やかで大満足です。健康診断書や遺伝子検査結果もしっかりいただけました。' },
];

// Constants
var STORAGE_KEY = 'fuluck-admin-data';
var PASS_KEY = 'fuluck-admin-pass';
var LOG_KEY = 'fuluck-admin-log';
var IMAGE_KEY = 'fuluck-admin-images';
var DEFAULT_PASS = 'fuluck5632';
var DRIVE_API = 'https://fuluck-api.mouxue56.workers.dev';

// Pagination state
var kittenPage = 1;
var parentPage = 1;
var PAGE_SIZE = 10;

// Data helpers
function getCoverPhoto(item) {
  if (!item.photos || item.photos.length === 0) return '';
  var idx = item.coverIndex || 0;
  return item.photos[Math.min(idx, item.photos.length - 1)] || '';
}

function migrateData(d) {
  if (d.kittens) d.kittens.forEach(function(k) {
    if (k.coverPhoto !== undefined && k.photos === undefined) {
      k.photos = k.coverPhoto ? [k.coverPhoto] : [];
      k.coverIndex = 0;
      delete k.coverPhoto;
    }
    if (!k.photos) { k.photos = []; k.coverIndex = 0; }
  });
  if (d.parents) d.parents.forEach(function(p) {
    if (p.coverPhoto !== undefined && p.photos === undefined) {
      p.photos = p.coverPhoto ? [p.coverPhoto] : [];
      p.coverIndex = 0;
      delete p.coverPhoto;
    }
    if (!p.photos) { p.photos = []; p.coverIndex = 0; }
  });
  return d;
}

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}

function saveData(d) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  if (typeof FuluckAPI === 'undefined') return;

  // Show sync status to user
  var syncIndicator = document.getElementById('syncStatus');
  if (syncIndicator) {
    syncIndicator.textContent = t('☁️ 同期中...','☁️ 同步中...');
    syncIndicator.className = 'sync-status syncing';
  }

  var types = ['kittens', 'parents', 'reviews'];
  var promises = types.map(function(type) {
    if (!d[type]) return Promise.resolve();
    return FuluckAPI.bulkImport(type, d[type]);
  });

  Promise.all(promises)
    .then(function() {
      if (syncIndicator) {
        syncIndicator.textContent = t('☁️ 同期済み','☁️ 已同步');
        syncIndicator.className = 'sync-status synced';
        setTimeout(function() { syncIndicator.className = 'sync-status'; }, 3000);
      }
    })
    .catch(function(err) {
      console.error('API sync failed:', err);
      if (syncIndicator) {
        syncIndicator.textContent = t('⚠️ 同期失敗（ローカル保存済み）','⚠️ 同步失败（已本地保存）');
        syncIndicator.className = 'sync-status sync-error';
      }
      showToast(t('クラウド同期に失敗しました。データはローカルに保存されています。','云端同步失败，数据已保存到本地。'), 'error');
    });
}

function getData() {
  var d = loadData();
  if (!d) {
    d = { kittens: JSON.parse(JSON.stringify(DEFAULT_KITTENS)), parents: JSON.parse(JSON.stringify(DEFAULT_PARENTS)), reviews: JSON.parse(JSON.stringify(DEFAULT_REVIEWS)) };
  }
  d = migrateData(d);
  saveData(d);
  return d;
}

function addLog(msg) {
  try {
    var logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    logs.unshift({ time: new Date().toLocaleString('ja-JP'), msg: msg });
    if (logs.length > 30) logs.length = 30;
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch(e) {}
}

var data = getData();

// Auth
function getPass() { return localStorage.getItem(PASS_KEY) || DEFAULT_PASS; }

document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('loginPassword').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });

function doLogin() {
  var pwd = document.getElementById('loginPassword').value;
  var btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = '...';

  fetch(DRIVE_API + '/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.success) {
        loginSuccess(pwd);
      } else if (pwd === getPass()) {
        loginSuccess(pwd);
      } else {
        loginFail();
      }
    })
    .catch(function() {
      if (pwd === getPass()) {
        loginSuccess(pwd);
      } else {
        loginFail();
      }
    })
    .finally(function() {
      btn.disabled = false;
      btn.textContent = admLang === 'zh' ? '登录' : 'ログイン';
    });
}

function loginSuccess(pwd) {
  sessionStorage.setItem('fuluck-admin-auth', '1');
  sessionStorage.setItem('fuluck-admin-pwd', pwd);
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminLayout').classList.add('active');
  renderAll();
  syncFromAPI();
}

function loginFail() {
  document.getElementById('loginError').style.display = 'block';
  document.getElementById('loginPassword').style.borderColor = '#FC8181';
}

function getSessionPass() {
  return sessionStorage.getItem('fuluck-admin-pwd') || getPass();
}

if (sessionStorage.getItem('fuluck-admin-auth') === '1') {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminLayout').classList.add('active');
  renderAll();
  syncFromAPI();
}

document.getElementById('logoutBtn').addEventListener('click', function() {
  sessionStorage.removeItem('fuluck-admin-auth');
  sessionStorage.removeItem('fuluck-admin-pwd');
  location.reload();
});

// Navigation
var pageTitles = {
  dashboard:'ダッシュボード', kittens:'子猫管理', parents:'親猫管理',
  reviews:'お客様の声', faq:'FAQ管理', articles:'知識ライブラリ',
  images:'画像管理', export:'HTML出力', data:'データ管理',
  guide:'操作ガイド', settings:'パスワード変更'
};

document.querySelectorAll('.nav-item').forEach(function(item) {
  item.addEventListener('click', function() {
    var page = item.dataset.page;
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    item.classList.add('active');
    document.querySelectorAll('.panel-page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('page-' + page).classList.add('active');
    document.getElementById('pageTitle').textContent = (admLang === 'zh' ? pageTitlesZh[page] : pageTitles[page]) || '';
    document.getElementById('addNewBtn').style.display = ['kittens','parents','reviews'].indexOf(page) >= 0 ? 'inline-flex' : 'none';
    // Load FAQ/articles data on navigation
    if (page === 'faq' && typeof loadFaqData === 'function') loadFaqData();
    if (page === 'articles' && typeof loadArticlesData === 'function') loadArticlesData();
  });
});

document.getElementById('addNewBtn').addEventListener('click', function() {
  var active = document.querySelector('.nav-item.active');
  var page = active ? active.dataset.page : '';
  if (page === 'kittens') openKittenForm();
  else if (page === 'parents') openParentForm();
  else if (page === 'reviews') openReviewForm();
});

// Modal & Toast
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type||'') + ' show';
  setTimeout(function() { t.classList.remove('show'); }, 3000);
}

// Pagination helper
function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  container.innerHTML =
    '<button class="page-prev" ' + (currentPage <= 1 ? 'disabled' : '') + '>« ' + t('前へ','上一页') + '</button>' +
    '<span class="page-info">' + currentPage + ' / ' + totalPages + ' ' + t('ページ','页') + '</span>' +
    '<button class="page-next" ' + (currentPage >= totalPages ? 'disabled' : '') + '>' + t('次へ','下一页') + ' »</button>';
  var prev = container.querySelector('.page-prev');
  var next = container.querySelector('.page-next');
  if (prev) prev.addEventListener('click', function() { if (currentPage > 1) onPageChange(currentPage - 1); });
  if (next) next.addEventListener('click', function() { if (currentPage < totalPages) onPageChange(currentPage + 1); });
}
