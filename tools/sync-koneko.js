#!/usr/bin/env node
/**
 * koneko-breeder → fuluckpet 子猫目録の同期
 *
 * 真実の源は koneko（日本の掲載プラットフォーム）。本ツールは koneko のスナップショットを
 * 正として、サイト側 KV の子猫目録を突き合わせる。
 *
 *   node tools/sync-koneko.js                     # 差分だけ表示（デフォルト・安全）
 *   node tools/sync-koneko.js --apply             # 実際に書き込む
 *   node tools/sync-koneko.js --apply --refresh-photos   # 人手で編集済みの photos も上書き
 *   node tools/sync-koneko.js --apply --force     # available→sold 大量発生ガードを外す
 *
 * 必要な環境変数: FULUCK_ADMIN_PASS（~/.secrets/yuki/fuluck-admin.env）
 *
 * 書き込みは 1 頭ずつの POST / PUT / DELETE のみ。/bulk は絶対に使わない
 * （runbooks/fuluckpet-admin新浏览器覆盖线上数据-P0.md：一括 REPLACE の事故）。
 *
 * 同期しないもの（意図的）:
 *   - note / アピールポイント … note に翻訳層が無く、日本語が中文・英語ページに素通りする
 *     （generate-site.js は breed/color だけ *Label() を通し、note は escapeHtml のみ）
 *   - 既存レコードの breed / color … サイト側の現値は翻訳表に載っているものが多く、
 *     koneko の表記ゆれ（「（トリプルコート）」付き等）で上書きすると翻訳が外れる。新規のみ書く
 *   - Drive フォルダを持つ breederId の photos … generate-site.js:3035 が構築時に丸ごと差し替える
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

const WORKER = 'https://fuluck-api.mouxue56.workers.dev';
const ORIGIN = 'https://fuluckpet.com';   // private エンドポイントは Origin 必須（無いと認証前に 403）
const PASS = process.env.FULUCK_ADMIN_PASS || '';
const APPLY = process.argv.includes('--apply');
const REFRESH_PHOTOS = process.argv.includes('--refresh-photos');
const FORCE = process.argv.includes('--force');
const SOLD_GUARD = 8;

const SNAP = JSON.parse(readFileSync(resolve(import.meta.dirname, 'koneko-snapshot.json'), 'utf-8'));
const H = { Origin: ORIGIN, Authorization: `Bearer ${PASS}`, 'Content-Type': 'application/json' };

const die = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

/** 生成器も実行時も最終的に embed 形へ正規化するので、保存も embed 形に統一する。 */
function normalizeVideo(v) {
  if (!v) return '';
  const m = String(v).match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? `https://www.youtube.com/embed/${m[1]}` : '';
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
  if (!PASS) die('FULUCK_ADMIN_PASS 未設定。~/.secrets/yuki/fuluck-admin.env を source すること。');

  // ---- スナップショット健全性（不完全な取得で全頭 sold 化するのを防ぐ）----
  const K = SNAP.kittens || [];
  if (!K.length) die('スナップショットが空。');
  if (!Array.isArray(SNAP.reservedIds)) die('reservedIds 欠落。空なら明示的に [] を書くこと。');
  const covered = new Set(K.map(k => k.group));
  for (const acc of Object.keys(SNAP.accounts || {})) {
    if (!covered.has(acc)) die(`スナップショットに ${acc} の掲載が1件も無い。取得漏れの疑い。`);
  }

  const res = await fetch(`${WORKER}/api/admin/kittens`, { headers: H }).catch(e => ({ ok: false, e }));
  if (!res.ok) die(`目録の取得に失敗: ${res.status || res.e?.message}`);
  const live = await res.json();
  if (!live.length) die('線上目録が空で返った。取得異常の疑いがあるため中止。');

  const byBid = new Map();
  for (const k of live) {
    if (!byBid.has(k.breederId)) byBid.set(k.breederId, []);
    byBid.get(k.breederId).push(k);
  }
  const liveById = new Map(live.map(k => [k.id, k]));
  const snapByBid = new Map(K.map(k => [k.breederId, k]));

  // ---- 削除対象（重複登録の掃除）。id ではなく「その id が本当にその猫か」まで検証する ----
  const deletes = (SNAP.deleteRecordIds || []).filter(d => liveById.has(d.id));
  for (const d of deletes) {
    const actual = liveById.get(d.id).breederId;
    if (actual !== d.breederId) die(`削除中止: ${d.id} は ${d.breederId} のはずが実際は ${actual}`);
  }
  const doomed = new Set(deletes.map(d => d.id));

  // ---- 追加 ----
  const adds = K.filter(k => k.status !== 'sold' && !byBid.has(k.breederId));

  // ---- 更新 ----
  const updates = [];
  const notes = [];
  for (const rec of live) {
    if (doomed.has(rec.id)) continue;
    const s = snapByBid.get(rec.breederId);
    const patch = {};

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

  console.log(`\n【重複削除】${deletes.length} 件`);
  for (const d of deletes) console.log(`   - ${d.breederId} (${d.id})  ${d.reason}`);

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
    if (recs.length > 1 && !recs.some(r => doomed.has(r.id))) {
      console.warn(`\n   ! 未登記の重複: ${bid} → ${recs.map(r => r.id).join(', ')}`);
    }
  }

  // --emit <path>: 同期後の目録を書き出す（本番に触れずに generate-site を通す検証用）。
  // 差分計算と同じコードパスから出すので、テストと本番がズレない。
  const emitIdx = process.argv.indexOf('--emit');
  if (emitIdx > -1 && process.argv[emitIdx + 1]) {
    const patched = live
      .filter(r => !doomed.has(r.id))
      .map(r => {
        const u = updates.find(x => x.rec.id === r.id);
        return u ? { ...r, ...u.patch } : r;
      })
      .concat(adds.map(a => ({
        id: `sim-${a.breederId}`, breederId: a.breederId, breed: a.breed, color: a.color,
        gender: a.gender, price: a.price, status: a.status, birthday: a.birthday,
        photos: a.photos, coverIndex: 0, video: normalizeVideo(a.video),
        papa: a.papa || '', mama: a.mama || '',
        note: (a.notes && a.notes.ja) || '',
        noteZh: (a.notes && a.notes.zh) || '',
        noteEn: (a.notes && a.notes.en) || '',
        isNew: true,
      })));
    writeFileSync(process.argv[emitIdx + 1], JSON.stringify(patched, null, 1));
    console.log(`\n同期後の目録を書き出し: ${process.argv[emitIdx + 1]}（${patched.length} 件）`);
  }

  if (!APPLY) { console.log(`\n(ドライラン。実行するには --apply)\n`); return; }

  // ---- バックアップ（削除・上書きの前に必ず）----
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const bpath = resolve(import.meta.dirname, `../_backups/kittens-${stamp}-同期前.json`);
  mkdirSync(dirname(bpath), { recursive: true });
  writeFileSync(bpath, JSON.stringify(live, null, 2));
  console.log(`\nバックアップ: ${bpath}`);

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
    const r = await req('POST', '/api/admin/kittens', {
      breederId: a.breederId, breed: a.breed, color: a.color, gender: a.gender,
      price: a.price, status: a.status, birthday: a.birthday,
      photos: a.photos, coverIndex: 0,
      video: normalizeVideo(a.video), papa: a.papa || '', mama: a.mama || '',
      note: (a.notes && a.notes.ja) || '',
      noteZh: (a.notes && a.notes.zh) || '',
      noteEn: (a.notes && a.notes.en) || '',
      isNew: true,
    });
    if (r.ok) { console.log(`   ✓ 追加 ${a.breederId}`); ok++; }
    else { console.error(`   ✗ 追加失敗 ${a.breederId}: ${r.why}`); fail++; }
  }

  // 削除は最後。追加・更新に失敗が出た回では消さない
  if (deletes.length) {
    if (fail) console.error(`\n   ! 失敗があるため重複削除をスキップ（データを消す前に止める）`);
    else for (const d of deletes) {
      const r = await req('DELETE', `/api/admin/kittens/${encodeURIComponent(d.id)}`);
      if (r.ok) { console.log(`   ✓ 削除 ${d.breederId} (${d.id})`); ok++; }
      else { console.error(`   ✗ 削除失敗 ${d.id}: ${r.why}`); fail++; }
    }
  }

  console.log(`\n完了: 成功 ${ok} / 失敗 ${fail}`);
  console.log(`静的ページは自動更新されない。即時反映するなら regenerate-site workflow を手動実行。`);
  if (fail) process.exit(1);
}

main().catch(e => die(e.stack || e.message));
