#!/usr/bin/env node
/**
 * koneko-breeder → fuluckpet 子猫目録の同期
 *
 * 真実の源は koneko（日本の掲載プラットフォーム）。本ツールは koneko のスナップショットを
 * 正として、サイト側 KV の子猫目録を突き合わせる。
 *
 *   node tools/sync-koneko.js --snapshot <private-path>  # 差分だけ表示（デフォルト・安全）
 *   node tools/sync-koneko.js --snapshot <private-path> --apply
 *   node tools/sync-koneko.js --snapshot <private-path> --apply --refresh-photos
 *   node tools/sync-koneko.js --snapshot <private-path> --apply --force
 *   node tools/sync-koneko.js --snapshot <private-path> --mirror-active
 *
 * 必要な環境変数:
 *   FULUCK_ADMIN_PASS（~/.secrets/yuki/fuluck-admin.env）
 *   FULUCK_KONEKO_BACKUP_DIR（--apply 時。公開リポジトリ外に事前作成した 0700 専用ディレクトリ）
 *
 * 書き込みは 1 頭ずつの POST / PUT のみ。DELETE と /bulk はこの同期ツールでは禁止
 * （runbooks/fuluckpet-admin新浏览器覆盖线上数据-P0.md：一括 REPLACE の事故）。
 *
 * 同期しないもの（意図的）:
 *   - note / アピールポイント … note に翻訳層が無く、日本語が中文・英語ページに素通りする
 *     （generate-site.js は breed/color だけ *Label() を通し、note は escapeHtml のみ）
 *   - 既存レコードの breed / color … サイト側の現値は翻訳表に載っているものが多く、
 *     koneko の表記ゆれ（「（トリプルコート）」付き等）で上書きすると翻訳が外れる。新規のみ書く
 *   - Drive フォルダを持つ breederId の photos … generate-site.js:3035 が構築時に丸ごと差し替える
 */

import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  writeSync,
} from 'fs';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';

import { assertFreshKonekoSnapshot } from './lib/koneko-snapshot-freshness.js';
import {
  assertCompleteActiveSource,
  buildActiveMirrorPatch,
  buildActiveMirrorRecord,
} from './lib/koneko-active-mirror.js';

const WORKER = 'https://fuluck-api.mouxue56.workers.dev';
const ORIGIN = 'https://fuluckpet.com';   // private エンドポイントは Origin 必須（無いと認証前に 403）
const PASS = process.env.FULUCK_ADMIN_PASS || '';
const APPLY = process.argv.includes('--apply');
const REFRESH_PHOTOS = process.argv.includes('--refresh-photos');
const FORCE = process.argv.includes('--force');
const MIRROR_ACTIVE = process.argv.includes('--mirror-active');
const SOLD_GUARD = 8;
const REPO_ROOT = resolve(import.meta.dirname, '..');
const die = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

const SNAPSHOT_ARG_INDEX = process.argv.indexOf('--snapshot');
const SNAPSHOT_ARG_VALUE = process.argv[SNAPSHOT_ARG_INDEX + 1];
if (SNAPSHOT_ARG_INDEX === -1) {
  die('--snapshot は必須です。リポジトリ外の新しい Koneko スナップショットを明示してください。');
}
if (SNAPSHOT_ARG_INDEX > -1 && (!SNAPSHOT_ARG_VALUE || SNAPSHOT_ARG_VALUE.startsWith('--'))) {
  die('--snapshot の後に JSON ファイルを指定してください。');
}
if (!isAbsolute(SNAPSHOT_ARG_VALUE)) {
  die('--snapshot にはリポジトリ外の絶対パスを指定してください。');
}

function pathIsInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function readPrivateSnapshot(snapshotPath) {
  const lexicalPath = resolve(snapshotPath);
  if (pathIsInside(REPO_ROOT, lexicalPath)) {
    throw new Error('--snapshot にはリポジトリ外の絶対パスを指定してください。');
  }

  let initial;
  try {
    initial = lstatSync(lexicalPath);
  } catch {
    throw new Error('--snapshot に読み取り可能な JSON ファイルを指定してください。');
  }
  if (initial.isSymbolicLink()) {
    throw new Error('--snapshot にシンボリックリンクは使用できません。');
  }
  if (!initial.isFile()) {
    throw new Error('--snapshot には通常の JSON ファイルを指定してください。');
  }

  let fd;
  try {
    fd = openSync(lexicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedBefore = fstatSync(fd);
    if (!openedBefore.isFile() || !sameFileIdentity(initial, openedBefore)) {
      throw new Error('--snapshot が検証中に置き換えられました。取得し直してください。');
    }
    if ((openedBefore.mode & 0o777) !== 0o600) {
      throw new Error('--snapshot の権限を 0600（所有者だけが読み書き可能）にしてください。');
    }
    if (typeof process.getuid === 'function' && openedBefore.uid !== process.getuid()) {
      throw new Error('--snapshot は実行中のユーザーが所有するファイルを指定してください。');
    }

    const canonicalPath = realpathSync(lexicalPath);
    const pathAfterOpen = lstatSync(lexicalPath);
    if (pathAfterOpen.isSymbolicLink() || !sameFileIdentity(openedBefore, pathAfterOpen)) {
      throw new Error('--snapshot が検証中に置き換えられました。取得し直してください。');
    }
    const canonicalRepo = realpathSync(REPO_ROOT);
    if (pathIsInside(canonicalRepo, canonicalPath)) {
      throw new Error('--snapshot の実体はリポジトリ外でなければなりません。');
    }

    const raw = readFileSync(fd, 'utf8');
    const openedAfter = fstatSync(fd);
    if (!sameFileIdentity(openedBefore, openedAfter)
      || openedBefore.size !== openedAfter.size
      || openedBefore.mtimeMs !== openedAfter.mtimeMs
      || openedBefore.ctimeMs !== openedAfter.ctimeMs) {
      throw new Error('--snapshot が読み取り中に変更されました。取得し直してください。');
    }
    return raw;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

let SNAP;
try {
  SNAP = JSON.parse(readPrivateSnapshot(SNAPSHOT_ARG_VALUE));
} catch (error) {
  if (error && String(error.message || '').startsWith('--snapshot')) die(error.message);
  die('--snapshot の JSON を読み取れません。新しく取得し直してください。');
}
const H = { Origin: ORIGIN, Authorization: `Bearer ${PASS}`, 'Content-Type': 'application/json' };

function assertSafeBackupDirectory() {
  const configured = process.env.FULUCK_KONEKO_BACKUP_DIR || '';
  if (!configured) {
    die('--apply にはリポジトリ外の FULUCK_KONEKO_BACKUP_DIR が必要です。');
  }
  if (!isAbsolute(configured)) {
    die('FULUCK_KONEKO_BACKUP_DIR にはリポジトリ外の絶対パスを指定してください。');
  }

  const lexicalPath = resolve(configured);
  if (pathIsInside(REPO_ROOT, lexicalPath)) {
    die('FULUCK_KONEKO_BACKUP_DIR にはリポジトリ外の専用ディレクトリを指定してください。');
  }

  let lexicalState;
  try {
    lexicalState = lstatSync(lexicalPath);
  } catch {
    die('FULUCK_KONEKO_BACKUP_DIR は既存の 0700 ディレクトリを指定してください。');
  }
  if (lexicalState.isSymbolicLink()) {
    die('FULUCK_KONEKO_BACKUP_DIR にシンボリックリンクは使用できません。');
  }

  const ownerUid = typeof process.getuid === 'function' ? process.getuid() : null;
  let ancestor = lexicalPath;
  while (true) {
    const state = lstatSync(ancestor);
    const trustedOwner = ownerUid === null || state.uid === ownerUid || state.uid === 0;
    if (!state.isDirectory() || state.isSymbolicLink() || !trustedOwner) {
      die('FULUCK_KONEKO_BACKUP_DIR の経路に安全でないシンボリックリンクまたは所有者があります。');
    }
    if (ancestor === lexicalPath) {
      if ((state.mode & 0o777) !== 0o700 || (ownerUid !== null && state.uid !== ownerUid)) {
        die('FULUCK_KONEKO_BACKUP_DIR は実行中のユーザーが所有する 0700 の専用ディレクトリにしてください。');
      }
    } else if (ancestor === dirname(lexicalPath)) {
      if ((state.mode & 0o777) !== 0o700 || (ownerUid !== null && state.uid !== ownerUid)) {
        die('FULUCK_KONEKO_BACKUP_DIR の直接の親も、実行中のユーザーが所有する 0700 の専用ディレクトリにしてください。');
      }
    } else if ((state.mode & 0o022) !== 0) {
      die('FULUCK_KONEKO_BACKUP_DIR の上位経路に他ユーザーが書き込めるディレクトリは使用できません。');
    }
    const next = dirname(ancestor);
    if (next === ancestor) break;
    ancestor = next;
  }

  let canonicalPath;
  try {
    canonicalPath = realpathSync(lexicalPath);
  } catch {
    die('FULUCK_KONEKO_BACKUP_DIR は既存の 0700 ディレクトリを指定してください。');
  }
  const canonicalRepo = realpathSync(REPO_ROOT);
  if (pathIsInside(canonicalRepo, canonicalPath)) {
    die('FULUCK_KONEKO_BACKUP_DIR の実体はリポジトリ外でなければなりません。');
  }

  let fd;
  try {
    fd = openSync(canonicalPath, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (!opened.isDirectory() || !sameFileIdentity(lexicalState, opened)) {
      throw new Error('バックアップディレクトリの同一性を確認できません。');
    }
    if ((opened.mode & 0o777) !== 0o700 || (ownerUid !== null && opened.uid !== ownerUid)) {
      throw new Error('バックアップディレクトリは実行中のユーザーが所有する 0700 の専用ディレクトリにしてください。');
    }
    return { path: canonicalPath, fd, dev: opened.dev, ino: opened.ino };
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    die(error && error.message ? error.message : 'バックアップディレクトリを安全に開けません。');
  }
}

function assertBackupDirectoryIdentity(backupDirectory) {
  let pathState;
  try {
    pathState = lstatSync(backupDirectory.path);
  } catch {
    throw new Error('バックアップディレクトリが検証後に置き換えられました。遠端への書き込みを中止します。');
  }
  const opened = fstatSync(backupDirectory.fd);
  if (pathState.isSymbolicLink()
    || !pathState.isDirectory()
    || !sameFileIdentity(pathState, opened)
    || opened.dev !== backupDirectory.dev
    || opened.ino !== backupDirectory.ino) {
    throw new Error('バックアップディレクトリの同一性が変わりました。遠端への書き込みを中止します。');
  }
}

function writeDurableBackup(backupDirectory, live) {
  assertBackupDirectoryIdentity(backupDirectory);
  const stamp = new Date().toISOString().slice(0, 23).replace(/[:T.]/g, '-');
  const payload = Buffer.from(JSON.stringify(live, null, 2), 'utf8');
  let backupPath;
  let backupFd;

  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      backupPath = resolve(
        backupDirectory.path,
        `kittens-${stamp}-${randomBytes(8).toString('hex')}-同期前.json`,
      );
      try {
        backupFd = openSync(
          backupPath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        break;
      } catch (error) {
        if (error && error.code === 'EEXIST') continue;
        throw error;
      }
    }
    if (backupFd === undefined) {
      throw new Error('重複しないバックアップファイル名を確保できません。');
    }

    fchmodSync(backupFd, 0o600);
    const opened = fstatSync(backupFd);
    if (!opened.isFile() || (opened.mode & 0o777) !== 0o600) {
      throw new Error('バックアップファイルを 0600 の通常ファイルとして作成できません。');
    }
    assertBackupDirectoryIdentity(backupDirectory);

    let offset = 0;
    while (offset < payload.length) {
      const written = writeSync(backupFd, payload, offset, payload.length - offset, null);
      if (written <= 0) throw new Error('バックアップファイルを完全に書き込めません。');
      offset += written;
    }
    fsyncSync(backupFd);
    closeSync(backupFd);
    backupFd = undefined;
    fsyncSync(backupDirectory.fd);
    assertBackupDirectoryIdentity(backupDirectory);
    return backupPath;
  } finally {
    if (backupFd !== undefined) closeSync(backupFd);
    closeSync(backupDirectory.fd);
  }
}

/** 生成器も実行時も最終的に embed 形へ正規化するので、保存も embed 形に統一する。 */
function normalizeVideo(v) {
  if (!v) return '';
  const m = String(v).match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? `https://www.youtube.com/embed/${m[1]}` : '';
}

function buildNewKittenRecord(source) {
  if (MIRROR_ACTIVE) return buildActiveMirrorRecord(source);
  return {
    breederId: source.breederId,
    breed: source.breed,
    color: source.color,
    gender: source.gender,
    price: source.price,
    status: source.status,
    birthday: source.birthday,
    photos: source.photos,
    coverIndex: 0,
    video: normalizeVideo(source.video),
    papa: source.papa || '',
    mama: source.mama || '',
    note: (source.notes && source.notes.ja) || '',
    noteZh: (source.notes && source.notes.zh) || '',
    noteEn: (source.notes && source.notes.en) || '',
    description: (source.descriptions && source.descriptions.ja) || '',
    descriptionZh: (source.descriptions && source.descriptions.zh) || '',
    descriptionEn: (source.descriptions && source.descriptions.en) || '',
    isNew: true,
  };
}

/** koneko の縮小版 URL。原寸は _thumb_pc / _thumb_mob を外したもの。 */
const isThumb = (u) => /_thumb_(pc|mob)/.test(u);

async function req(method, path, body) {
  try {
    const r = await fetch(`${WORKER}${path}`, {
      method, headers: H, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) return { ok: false, why: `HTTP ${r.status} ${(await r.text()).slice(0, 160)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, why: `network: ${e.message}` };   // 例外を握って fail に計上する
  }
}

async function main() {
  assertFreshKonekoSnapshot(SNAP);

  // ---- スナップショット健全性（不完全な取得で全頭 sold 化するのを防ぐ）----
  const K = SNAP.kittens || [];
  if (!K.length) die('スナップショットが空。');
  if (!Array.isArray(SNAP.reservedIds)) die('reservedIds 欠落。空なら明示的に [] を書くこと。');
  const requestedDeletes = SNAP.deleteRecordIds || [];
  if (!Array.isArray(requestedDeletes)) die('deleteRecordIds は配列で指定してください。');
  if (requestedDeletes.length) {
    die('deleteRecordIds による物理削除は禁止です。重複整理は別の人工承認手順で実施してください。');
  }
  const covered = new Set(K.map(k => k.group));
  for (const acc of Object.keys(SNAP.accounts || {})) {
    if (!covered.has(acc)) die(`スナップショットに ${acc} の掲載が1件も無い。取得漏れの疑い。`);
  }
  if (MIRROR_ACTIVE) {
    const activeSources = K.filter(k => k.status === 'available' || k.status === 'reserved');
    const activeCovered = new Set(activeSources.map(k => k.group));
    for (const acc of Object.keys(SNAP.accounts || {})) {
      if (!activeCovered.has(acc)) {
        die(`--mirror-active のスナップショットに ${acc} の販売中または商談中掲載が無い。取得漏れの疑い。`);
      }
    }
    for (const source of activeSources) {
      try {
        assertCompleteActiveSource(source);
      } catch (error) {
        die(`--mirror-active の source 検証に失敗 (${source.breederId || 'breederId 不明'}): ${error.message}`);
      }
    }
  }

  const backupDirectory = APPLY ? assertSafeBackupDirectory() : null;

  if (!PASS) die('FULUCK_ADMIN_PASS 未設定。~/.secrets/yuki/fuluck-admin.env を source すること。');

  const res = await fetch(`${WORKER}/api/admin/kittens`, { headers: H }).catch(e => ({ ok: false, e }));
  if (!res.ok) die(`目録の取得に失敗: ${res.status || res.e?.message}`);
  const live = await res.json();
  if (!live.length) die('線上目録が空で返った。取得異常の疑いがあるため中止。');

  const byBid = new Map();
  for (const k of live) {
    if (!byBid.has(k.breederId)) byBid.set(k.breederId, []);
    byBid.get(k.breederId).push(k);
  }
  const snapByBid = new Map(K.map(k => [k.breederId, k]));

  // ---- 追加 ----
  const adds = K.filter(k => k.status !== 'sold' && !byBid.has(k.breederId));

  // ---- 更新 ----
  const updates = [];
  const notes = [];
  for (const rec of live) {
    const s = snapByBid.get(rec.breederId);
    let patch;

    if (MIRROR_ACTIVE && s && (s.status === 'available' || s.status === 'reserved')) {
      // The source was fully validated before credentials or network access. Strict mode
      // owns all public active-listing fields, but never Fuluck IDs or operator metadata.
      patch = buildActiveMirrorPatch(rec, s);
    } else {
      patch = {};

      // status: koneko が絶対。スナップショットに無い個体は掲載終了とみなす
      const want = s ? s.status : 'sold';
      if (rec.status !== want) patch.status = want;

      if (s) {
        if (s.price && rec.price !== s.price) patch.price = s.price;
        if (s.birthday && rec.birthday !== s.birthday) patch.birthday = s.birthday;

        // 動画 ID が同じなら書かない。つまり既存レコードの URL 形式
        // （youtu.be/xxx?si=… の旧表記）は正規化されずそのまま残る。
        // 生成器も実行時レンダラも描画時に embed 形へ揃えるので出力は
        // 同一 —— 表記の不揃いは KV の中だけの話で、実害は無い。
        const v = normalizeVideo(s.video);
        if (v && normalizeVideo(rec.video) !== v) patch.video = v;

        // papa/mama: 空欄のときだけ補う。人手で張った関連は壊さない
        if (s.papa && !rec.papa) patch.papa = s.papa;
        if (s.mama && !rec.mama) patch.mama = s.mama;

        // note は掲載中の個体だけ。売却済みの子に売り文句は要らないし、
        // 既存の日本語 note も消さない（ja 面では今も正しい）。
        if (s.status !== 'sold' && s.notes) {
          for (const [field, key] of [['note', 'ja'], ['noteZh', 'zh'], ['noteEn', 'en']]) {
            const v = s.notes[key];
            if (typeof v === 'string' && v && rec[field] !== v) patch[field] = v;
          }
        }

        // photos: Drive 管理下は触らない。空 or 全部サムネのときだけ差し替え
        const cur = rec.photos || [];
        const allThumb = cur.length > 0 && cur.every(isThumb);
        if (s.driveManaged) {
          if (cur.length && cur.some(u => u.includes('koneko-breeder'))) {
            notes.push(`   · ${rec.breederId} は Drive 管理のため photos 据え置き`);
          }
        } else if (s.photos.length && (cur.length === 0 || allThumb || REFRESH_PHOTOS)) {
          patch.photos = s.photos;
          patch.coverIndex = 0;   // 配列を差し替えたら必ず添え直す（旧 index の範囲外を防ぐ）
        }
      }
    }

    if (Object.keys(patch).length) updates.push({ rec, patch });
  }

  // ---- 安全ガード ----
  const toSold = updates.filter(u => u.rec.status === 'available' && u.patch.status === 'sold');
  if (toSold.length > SOLD_GUARD && !FORCE) {
    die(`available→sold が ${toSold.length} 件（上限 ${SOLD_GUARD}）。取得漏れの疑いで中止。--force で強行。`);
  }
  const noPhoto = adds.filter(a => !a.photos.length);

  // ---- 表示 ----
  const cnt = (s) => K.filter(k => k.status === s).length;
  console.log(`\n■ koneko 正: ${K.length} 頭（販売中 ${cnt('available')} / 商談中 ${cnt('reserved')} / 終了 ${cnt('sold')}）`);
  console.log(`■ サイト現状: ${live.length} 件（available ${live.filter(k => k.status === 'available').length}）\n`);

  console.log(`【新規追加】${adds.length} 頭`);
  for (const a of adds) {
    console.log(`   + ${a.breederId} ${a.breed} ${a.color} ${a.gender} ¥${(a.price || 0).toLocaleString()} 写真${a.photos.length} 動画${a.video ? '有' : '無'}`);
  }

  console.log(`\n【更新】${updates.length} 件`);
  for (const { rec, patch } of updates) {
    const bits = Object.entries(patch).map(([k, v]) => {
      if (k === 'photos') return `photos ${(rec.photos || []).length}→${v.length}枚`;
      if (k === 'coverIndex') return null;
      const old = rec[k] === undefined || rec[k] === '' ? '空' : String(rec[k]).slice(0, 34);
      return `${k}: ${old} → ${String(v).slice(0, 34)}`;
    }).filter(Boolean);
    console.log(`   ~ ${rec.breederId}  ${bits.join(' | ')}`);
  }

  console.log(`\n【物理削除】0 件（自動同期では禁止）`);

  // 親猫。papa/mama は parents の name と厳密一致でしか繋がらない（script.js:537）。
  // koneko 側にいるのにサイトに未登録の親は、先に作らないと子の血統欄が空のままになる。
  const pRes = await fetch(`${WORKER}/api/parents`, { headers: H }).catch(() => null);
  const liveParents = pRes && pRes.ok ? await pRes.json() : [];
  const pNames = new Set(liveParents.map(p => p.name));
  const newParents = (SNAP.parentsToCreate || []).filter(p => !pNames.has(p.name));
  console.log(`\n【親猫追加】${newParents.length} 件`);
  for (const p of newParents) console.log(`   + ${p.name} ${p.breed} ${p.color} ${p.gender} (${p.group})`);

  if (notes.length) console.log(`\n【据え置き】\n${notes.join('\n')}`);
  if (noPhoto.length) {
    console.log(`\n【警告】写真0枚 → サイトに表示されない（詳細ページも生成されない）:`);
    for (const a of noPhoto) console.log(`   ! ${a.breederId}`);
  }
  for (const [bid, recs] of byBid) {
    if (recs.length > 1) {
      console.warn(`\n   ! 未登記の重複: ${bid} → ${recs.map(r => r.id).join(', ')}`);
    }
  }

  // --emit <path>: 同期後の目録を書き出す（本番に触れずに generate-site を通す検証用）。
  // 差分計算と同じコードパスから出すので、テストと本番がズレない。
  const emitIdx = process.argv.indexOf('--emit');
  if (emitIdx > -1 && process.argv[emitIdx + 1]) {
    const patched = live
      .map(r => {
        const u = updates.find(x => x.rec.id === r.id);
        return u ? { ...r, ...u.patch } : r;
      })
      .concat(adds.map(a => ({ ...buildNewKittenRecord(a), id: `sim-${a.breederId}` })));
    writeFileSync(process.argv[emitIdx + 1], JSON.stringify(patched, null, 1));
    console.log(`\n同期後の目録を書き出し: ${process.argv[emitIdx + 1]}（${patched.length} 件）`);
  }

  if (!APPLY) { console.log(`\n(ドライラン。実行するには --apply)\n`); return; }

  // ---- バックアップ（最初の POST / PUT より前に必ず耐久化）----
  const backupPath = writeDurableBackup(backupDirectory, live);
  console.log(`\nバックアップ: ${backupPath}`);

  console.log(`--- 書き込み開始 ---`);
  let ok = 0, fail = 0;

  // 親猫を最初に。子より後だと papa/mama を書いた瞬間は繋がらない
  for (const p of newParents) {
    const body = { ...p };
    for (const k of Object.keys(body)) if (k.startsWith('_')) delete body[k];
    const r = await req('POST', '/api/admin/parents', body);
    if (r.ok) { console.log(`   ✓ 親猫追加 ${p.name}`); ok++; }
    else { console.error(`   ✗ 親猫追加失敗 ${p.name}: ${r.why}`); fail++; }
  }

  // 更新を先に。途中で落ちても「売れた子が販売中のまま」にはならない
  for (const { rec, patch } of updates) {
    const r = await req('PUT', `/api/admin/kittens/${encodeURIComponent(rec.id)}`, patch);
    if (r.ok) { console.log(`   ✓ 更新 ${rec.breederId}`); ok++; }
    else { console.error(`   ✗ 更新失敗 ${rec.breederId}: ${r.why}`); fail++; }
  }

  for (const a of adds) {
    const r = await req('POST', '/api/admin/kittens', buildNewKittenRecord(a));
    if (r.ok) { console.log(`   ✓ 追加 ${a.breederId}`); ok++; }
    else { console.error(`   ✗ 追加失敗 ${a.breederId}: ${r.why}`); fail++; }
  }

  console.log(`\n完了: 成功 ${ok} / 失敗 ${fail}`);
  console.log(`静的ページは自動更新されない。即時反映するなら regenerate-site workflow を手動実行。`);
  if (fail) process.exit(1);
}

main().catch(e => die(e && e.message ? e.message : String(e)));
