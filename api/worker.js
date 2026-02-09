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
 *   ADMIN_PASSWORD = 管理画面パスワード (Workers Settings > Variables で設定)
 *   CORS_ORIGIN    = 許可するオリジン (例: https://fuluck.com)
 */

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
  async fetch(request, env) {
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
