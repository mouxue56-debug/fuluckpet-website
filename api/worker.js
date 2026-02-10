/**
 * 福楽キャッテリー — Cloudflare Workers API
 *
 * このファイルは Cloudflare Workers にデプロイして使います。
 * GitHub Pages の静的サイトと組み合わせて、管理画面のバックエンドとして機能します。
 *
 * 必要な Cloudflare リソース:
 *   - Workers (このスクリプト)
 *   - R2 バケット (画像ストレージ) → バインド名: BUCKET
 *   - KV Namespace (データストア) → バインド名: DATA
 *
 * wrangler.toml で以下のバインドを設定してください:
 *   [[r2_buckets]]
 *   binding = "BUCKET"
 *   bucket_name = "fuluck-images"
 *
 *   [[kv_namespaces]]
 *   binding = "DATA"
 *   id = "<your-kv-namespace-id>"
 *
 * 環境変数:
 *   ADMIN_PASSWORD            = 管理画面パスワード (Workers Settings > Variables で設定)
 *   CORS_ORIGIN               = 許可するオリジン (例: https://fuluckpet.com)
 *   GOOGLE_SA_KEY             = Google Service Account JSON (Encrypted Secret)
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID = Google Drive ルートフォルダ ID (Encrypted Secret)
 */

// ===== Google Drive Integration =====

const DRIVE_LIST_CACHE_TTL = 1800; // 30 minutes
const DRIVE_TOKEN_CACHE_TTL = 3300; // 55 minutes (token valid for 60)
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB — images larger than this get resized
const RESIZE_WIDTHS = [1600, 1200, 800]; // Progressive resize attempts

// Base64url encode for JWT
function base64url(buf) {
  const str = typeof buf === 'string' ? buf : String.fromCharCode(...new Uint8Array(buf));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Get Google access token using Service Account JWT
async function getGoogleAccessToken(env) {
  // Check KV cache first
  const cached = await env.DATA.get('drive:token');
  if (cached) return cached;

  const sa = JSON.parse(env.GOOGLE_SA_KEY);
  const now = Math.floor(Date.now() / 1000);

  // JWT Header + Claims
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  // Sign with RSA private key using Web Crypto API
  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const keyData = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8', keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sigInput = new TextEncoder().encode(`${header}.${claims}`);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, sigInput);
  const jwt = `${header}.${claims}.${base64url(sig)}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google token error: ${tokenRes.status} ${errText}`);
  }

  const { access_token } = await tokenRes.json();

  // Cache token in KV (55 min TTL, token valid for 60 min)
  await env.DATA.put('drive:token', access_token, { expirationTtl: DRIVE_TOKEN_CACHE_TTL });

  return access_token;
}

// List files/folders from Google Drive
async function driveList(env, folderId, mimeFilter) {
  const token = await getGoogleAccessToken(env);

  let q = `'${folderId}' in parents and trashed=false`;
  if (mimeFilter === 'folders') {
    q += ` and mimeType='application/vnd.google-apps.folder'`;
  } else if (mimeFilter === 'images') {
    q += ` and (mimeType contains 'image/')`;
  }

  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType)',
    orderBy: 'name',
    pageSize: '100',
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Drive API error: ${res.status} ${errText}`);
  }

  return (await res.json()).files || [];
}

// Get file metadata from Google Drive (size, mimeType, thumbnailLink)
async function driveGetMeta(env, fileId) {
  const token = await getGoogleAccessToken(env);
  const params = new URLSearchParams({
    fields: 'id,name,size,mimeType,thumbnailLink',
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive meta error: ${res.status}`);
  return res.json();
}

// Download file content from Google Drive
async function driveDownload(env, fileId) {
  const token = await getGoogleAccessToken(env);

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Drive download error: ${res.status}`);
  }

  return {
    body: res.body,
    contentType: res.headers.get('Content-Type') || 'image/jpeg',
    size: parseInt(res.headers.get('Content-Length') || '0', 10),
  };
}

// Download a resized version of a Drive image using Google's thumbnail API
// Google's thumbnailLink supports ?sz=w{WIDTH} format for on-the-fly resizing
async function driveDownloadResized(env, fileId, width) {
  const token = await getGoogleAccessToken(env);

  // Use Google's content download with resize via the thumbnail API
  // Format: https://lh3.googleusercontent.com/d/{fileId}=w{width}
  // This is the public Google image proxy, but we need auth for private files.
  // Instead, use thumbnailLink from metadata and resize it.
  const meta = await driveGetMeta(env, fileId);

  if (meta.thumbnailLink) {
    // thumbnailLink looks like: https://lh3.googleusercontent.com/drive-storage/...=s220
    // Replace the size suffix with our desired width
    const resizedUrl = meta.thumbnailLink.replace(/=s\d+$/, `=w${width}`);
    const res = await fetch(resizedUrl);
    if (res.ok) {
      const contentType = res.headers.get('Content-Type') || 'image/jpeg';
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 0 && buf.byteLength <= MAX_IMAGE_BYTES) {
        return { body: buf, contentType, size: buf.byteLength, resized: true, width };
      }
    }
  }

  return null; // Resize failed, caller should fall back to original
}

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.CORS_ORIGIN || '*';
  if (allowed === '*' || origin === allowed) return origin || '*';
  return allowed;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return json({ error: 'Unauthorized' }, 401);
}

function notFound() {
  return json({ error: 'Not Found' }, 404);
}

// Simple token auth: Authorization: Bearer <password>
// Checks env variable first, falls back to KV stored password, then default
async function checkAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '');
  // Priority: env variable > KV stored > default
  const envPass = env.ADMIN_PASSWORD;
  if (envPass) return token === envPass;
  const kvPass = await env.DATA.get('admin_password');
  return token === (kvPass || 'fuluck2025');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Allow-Origin': corsOrigin(request, env),
        },
      });
    }

    // Add CORS to all responses
    const addCors = (res) => {
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', corsOrigin(request, env));
      for (const [k, v] of Object.entries(CORS_HEADERS)) {
        headers.set(k, v);
      }
      return new Response(res.body, { status: res.status, headers });
    };

    try {
      // ===== PUBLIC ROUTES =====

      // GET /api/kittens — 公開：子猫一覧
      if (path === '/api/kittens' && method === 'GET') {
        const data = await env.DATA.get('kittens', 'json');
        return addCors(json(data || []));
      }

      // GET /api/parents — 公開：親猫一覧
      if (path === '/api/parents' && method === 'GET') {
        const data = await env.DATA.get('parents', 'json');
        return addCors(json(data || []));
      }

      // GET /api/reviews — 公開：レビュー一覧
      if (path === '/api/reviews' && method === 'GET') {
        const data = await env.DATA.get('reviews', 'json');
        return addCors(json(data || []));
      }

      // GET /api/gallery — 公開：ギャラリー一覧
      if (path === '/api/gallery' && method === 'GET') {
        const data = await env.DATA.get('gallery', 'json');
        return addCors(json(data || []));
      }

      // GET /api/settings — 公開：サイト設定（SNSリンク等）
      if (path === '/api/settings' && method === 'GET') {
        const data = await env.DATA.get('settings', 'json');
        return addCors(json(data || {}));
      }

      // ===== GOOGLE DRIVE PUBLIC ROUTES =====

      // GET /api/drive/folders/:parentFolderId — 子フォルダ一覧
      if (path.match(/^\/api\/drive\/folders\/[^/]+$/) && method === 'GET') {
        const parentId = path.split('/').pop();
        const cacheKey = `drive:folders:${parentId}`;
        const cached = await env.DATA.get(cacheKey, 'json');
        if (cached) return addCors(json(cached));

        const folders = await driveList(env, parentId, 'folders');
        const result = folders.map(f => ({ id: f.id, name: f.name }));
        await env.DATA.put(cacheKey, JSON.stringify(result), { expirationTtl: DRIVE_LIST_CACHE_TTL });
        return addCors(json(result));
      }

      // GET /api/drive/images/:folderId — フォルダ内の画像一覧
      if (path.match(/^\/api\/drive\/images\/[^/]+$/) && method === 'GET') {
        const folderId = path.split('/').pop();
        const cacheKey = `drive:images:${folderId}`;
        const cached = await env.DATA.get(cacheKey, 'json');
        if (cached) return addCors(json(cached));

        const files = await driveList(env, folderId, 'images');
        const result = files.map(f => ({
          id: f.id,
          name: f.name,
          url: `/api/drive/img/${f.id}`,
        }));
        await env.DATA.put(cacheKey, JSON.stringify(result), { expirationTtl: DRIVE_LIST_CACHE_TTL });
        return addCors(json(result));
      }

      // GET /api/drive/img/:fileId — 画像配信（R2キャッシュ + 自動圧縮付き）
      if (path.match(/^\/api\/drive\/img\/[^/]+$/) && method === 'GET') {
        const fileId = path.split('/').pop();
        const r2Key = `drive/${fileId}`;

        // Check R2 cache first
        const r2Obj = await env.BUCKET.get(r2Key);
        if (r2Obj) {
          return addCors(new Response(r2Obj.body, {
            headers: {
              'Content-Type': r2Obj.httpMetadata?.contentType || 'image/jpeg',
              'Cache-Control': 'public, max-age=604800',
              'X-Cache': 'HIT',
              'X-Original-Size': r2Obj.customMetadata?.originalSize || 'unknown',
            },
          }));
        }

        // Download original from Drive
        const downloaded = await driveDownload(env, fileId);
        const originalBuf = await new Response(downloaded.body).arrayBuffer();
        const originalSize = originalBuf.byteLength;

        let finalBuf = originalBuf;
        let finalContentType = downloaded.contentType;
        let wasResized = false;

        // Auto-compress: if image > 2MB, try Google's thumbnail resize API
        if (originalSize > MAX_IMAGE_BYTES) {
          for (const width of RESIZE_WIDTHS) {
            const resized = await driveDownloadResized(env, fileId, width);
            if (resized) {
              finalBuf = resized.body;
              finalContentType = resized.contentType;
              wasResized = true;
              break; // Got a version under 2MB
            }
          }
          // If all resize attempts failed, use original anyway
        }

        // Store in R2 (non-blocking)
        ctx.waitUntil(
          env.BUCKET.put(r2Key, finalBuf, {
            httpMetadata: { contentType: finalContentType },
            customMetadata: {
              originalSize: String(originalSize),
              resized: String(wasResized),
            },
          })
        );

        return addCors(new Response(finalBuf, {
          headers: {
            'Content-Type': finalContentType,
            'Cache-Control': 'public, max-age=604800',
            'X-Cache': 'MISS',
            'X-Original-Size': String(originalSize),
            'X-Resized': String(wasResized),
          },
        }));
      }

      // ===== AUTH CHECK =====
      // POST /api/auth — ログイン確認
      if (path === '/api/auth' && method === 'POST') {
        const body = await request.json();
        const envPass = env.ADMIN_PASSWORD;
        let correctPass;
        if (envPass) {
          correctPass = envPass;
        } else {
          const kvPass = await env.DATA.get('admin_password');
          correctPass = kvPass || 'fuluck2025';
        }
        const ok = body.password === correctPass;
        return addCors(json({ success: ok }));
      }

      // All routes below require auth
      if (!(await checkAuth(request, env))) {
        return addCors(unauthorized());
      }

      // ===== ADMIN ROUTES =====

      // --- Kittens CRUD ---
      if (path === '/api/admin/kittens' && method === 'GET') {
        const data = await env.DATA.get('kittens', 'json');
        return addCors(json(data || []));
      }

      if (path === '/api/admin/kittens' && method === 'POST') {
        const body = await request.json();
        const kittens = (await env.DATA.get('kittens', 'json')) || [];
        body.id = crypto.randomUUID();
        body.createdAt = new Date().toISOString();
        kittens.push(body);
        await env.DATA.put('kittens', JSON.stringify(kittens));
        return addCors(json(body, 201));
      }

      if (path.startsWith('/api/admin/kittens/') && method === 'PUT') {
        const id = path.split('/').pop();
        const body = await request.json();
        let kittens = (await env.DATA.get('kittens', 'json')) || [];
        const idx = kittens.findIndex(k => k.id === id);
        if (idx === -1) return addCors(notFound());
        kittens[idx] = { ...kittens[idx], ...body, id, updatedAt: new Date().toISOString() };
        await env.DATA.put('kittens', JSON.stringify(kittens));
        return addCors(json(kittens[idx]));
      }

      if (path.startsWith('/api/admin/kittens/') && method === 'DELETE') {
        const id = path.split('/').pop();
        let kittens = (await env.DATA.get('kittens', 'json')) || [];
        kittens = kittens.filter(k => k.id !== id);
        await env.DATA.put('kittens', JSON.stringify(kittens));
        return addCors(json({ success: true }));
      }

      // --- Parents CRUD ---
      if (path === '/api/admin/parents' && method === 'POST') {
        const body = await request.json();
        const parents = (await env.DATA.get('parents', 'json')) || [];
        body.id = crypto.randomUUID();
        body.createdAt = new Date().toISOString();
        parents.push(body);
        await env.DATA.put('parents', JSON.stringify(parents));
        return addCors(json(body, 201));
      }

      if (path.startsWith('/api/admin/parents/') && method === 'PUT') {
        const id = path.split('/').pop();
        const body = await request.json();
        let parents = (await env.DATA.get('parents', 'json')) || [];
        const idx = parents.findIndex(p => p.id === id);
        if (idx === -1) return addCors(notFound());
        parents[idx] = { ...parents[idx], ...body, id, updatedAt: new Date().toISOString() };
        await env.DATA.put('parents', JSON.stringify(parents));
        return addCors(json(parents[idx]));
      }

      if (path.startsWith('/api/admin/parents/') && method === 'DELETE') {
        const id = path.split('/').pop();
        let parents = (await env.DATA.get('parents', 'json')) || [];
        parents = parents.filter(p => p.id !== id);
        await env.DATA.put('parents', JSON.stringify(parents));
        return addCors(json({ success: true }));
      }

      // --- Reviews CRUD ---
      if (path === '/api/admin/reviews' && method === 'POST') {
        const body = await request.json();
        const reviews = (await env.DATA.get('reviews', 'json')) || [];
        body.id = crypto.randomUUID();
        body.createdAt = new Date().toISOString();
        reviews.push(body);
        await env.DATA.put('reviews', JSON.stringify(reviews));
        return addCors(json(body, 201));
      }

      if (path.startsWith('/api/admin/reviews/') && method === 'DELETE') {
        const id = path.split('/').pop();
        let reviews = (await env.DATA.get('reviews', 'json')) || [];
        reviews = reviews.filter(r => r.id !== id);
        await env.DATA.put('reviews', JSON.stringify(reviews));
        return addCors(json({ success: true }));
      }

      // --- Gallery CRUD ---
      if (path === '/api/admin/gallery' && method === 'POST') {
        const body = await request.json();
        const gallery = (await env.DATA.get('gallery', 'json')) || [];
        body.id = crypto.randomUUID();
        body.createdAt = new Date().toISOString();
        gallery.push(body);
        await env.DATA.put('gallery', JSON.stringify(gallery));
        return addCors(json(body, 201));
      }

      if (path.startsWith('/api/admin/gallery/') && method === 'DELETE') {
        const id = path.split('/').pop();
        let gallery = (await env.DATA.get('gallery', 'json')) || [];
        gallery = gallery.filter(g => g.id !== id);
        await env.DATA.put('gallery', JSON.stringify(gallery));
        return addCors(json({ success: true }));
      }

      // --- Settings ---
      if (path === '/api/admin/settings' && method === 'PUT') {
        const body = await request.json();
        await env.DATA.put('settings', JSON.stringify(body));
        return addCors(json({ success: true }));
      }

      // --- Image Upload (R2) ---
      if (path === '/api/admin/upload' && method === 'POST') {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) return addCors(json({ error: 'No file provided' }, 400));

        const ext = file.name.split('.').pop().toLowerCase();
        const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4'];
        if (!allowed.includes(ext)) {
          return addCors(json({ error: 'File type not allowed' }, 400));
        }

        // Max 10MB
        if (file.size > 10 * 1024 * 1024) {
          return addCors(json({ error: 'File too large (max 10MB)' }, 400));
        }

        const key = `uploads/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        await env.BUCKET.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        // R2 public URL — カスタムドメインまたは r2.dev を設定後に使用
        const publicUrl = `https://${url.hostname}/${key}`;

        return addCors(json({ url: publicUrl, key }));
      }

      // --- Image Delete (R2) ---
      if (path === '/api/admin/upload' && method === 'DELETE') {
        const body = await request.json();
        if (!body.key) return addCors(json({ error: 'No key provided' }, 400));
        await env.BUCKET.delete(body.key);
        return addCors(json({ success: true }));
      }

      // --- Drive Cache Management ---
      if (path === '/api/admin/drive/refresh' && method === 'POST') {
        // Clear all drive-related KV cache entries
        // KV list API to find all drive: prefixed keys
        const listResult = await env.DATA.list({ prefix: 'drive:' });
        const deletes = listResult.keys.map(k => env.DATA.delete(k.name));
        await Promise.all(deletes);
        return addCors(json({ success: true, cleared: listResult.keys.length }));
      }

      if (path.match(/^\/api\/admin\/drive\/refresh\/[^/]+$/) && method === 'POST') {
        // Clear cache for a specific folder
        const folderId = path.split('/').pop();
        // Clear both the image list and folder list caches for this folder
        await Promise.all([
          env.DATA.delete(`drive:images:${folderId}`),
          env.DATA.delete(`drive:folders:${folderId}`),
        ]);
        return addCors(json({ success: true, folderId }));
      }

      // --- Password Change ---
      if (path === '/api/admin/password' && method === 'PUT') {
        const body = await request.json();
        if (!body.newPassword || body.newPassword.length < 6) {
          return addCors(json({ error: 'Password must be at least 6 characters' }, 400));
        }
        // KV に保存 — checkAuth は KV のパスワードも参照する
        // env.ADMIN_PASSWORD が設定されている場合はそちらが優先される
        await env.DATA.put('admin_password', body.newPassword);
        return addCors(json({ success: true }));
      }

      return addCors(notFound());

    } catch (err) {
      return addCors(json({ error: err.message }, 500));
    }
  },
};
