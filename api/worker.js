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
 *   GEMINI_API_KEY             = Google Gemini API Key (Story Card AI generation)
 *   QIANWEN_API_KEY            = Alibaba Qianwen API Key (Story Card AI generation)
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

// ===== AI Story Generation Helpers =====

function buildJaPrompt(data) {
  return `あなたはペットの温かい文章を書くライターです。
以下の情報をもとに、SNSでシェアするための猫ちゃんお迎え記念の文章を作成してください。

猫ちゃんの情報：
- 名前：${data.name}
- 性別：${data.gender || '不明'}
- 猫種：サイベリアン
- 毛色：${data.color || '不明'}
- お迎え日：${data.date || '最近'}
- 性格・第一印象：${data.personality || '（未記入）'}
- 名前の由来：${data.nameReason || '（未記入）'}
- 一番嬉しかった瞬間：${data.happyMoment || '（未記入）'}
- 他のペット：${data.otherPets || 'いない'}
- 猫ちゃんへのメッセージ：${data.message || '（未記入）'}

以下の2つのバージョンを、必ずJSON形式で出力してください（他のテキストは不要）：
{
  "instagram": "（Instagram投稿用、100〜200文字。温かく親しみやすい口調。「サイベリアン」と「大阪・福楽キャッテリー」を自然に入れてください。最後に関連ハッシュタグを3〜5個追加。例：#サイベリアン #シベリア猫 #猫のいる暮らし #福楽キャッテリー #猫好きさんと繋がりたい）",
  "short": "（短い一言、50文字以内。シンプルで心温まるフレーズ）"
}

注意：
- 飼い主本人が書いたような自然な文章にしてください
- キャッテリーの情報はさりげなく、宣伝っぽくならないように
- 読んだ人が「いいな、私も飼いたい」と思う文章を目指してください
- 必ず上記のJSON形式のみ出力してください`;
}

function buildZhPrompt(data) {
  return `你是一位温暖有文采的宠物内容写手。
请根据以下信息，生成一段适合在社交媒体分享的猫咪迎接纪念文案。

猫咪信息：
- 名字：${data.name}
- 性别：${data.gender || '未知'}
- 猫种：西伯利亚猫（サイベリアン）
- 毛色：${data.color || '未知'}
- 迎接日期：${data.date || '最近'}
- 性格/第一印象：${data.personality || '（未填写）'}
- 起名理由：${data.nameReason || '（未填写）'}
- 最开心的瞬间：${data.happyMoment || '（未填写）'}
- 家里其他宠物：${data.otherPets || '没有'}
- 想说的话：${data.message || '（未填写）'}

请生成以下2个版本，必须以JSON格式输出（不要输出其他文字）：
{
  "xiaohongshu": "（小红书/朋友圈用，100-200字。温暖亲切的语气。自然地提到'西伯利亚猫'和'大阪福楽猫舍'。末尾加3-5个相关话题标签，如 #西伯利亚猫 #日本猫舍 #新猫到家 #福楽猫舍）",
  "short": "（朋友圈短文案，50字以内。简短甜蜜，适合配图发送）"
}

注意：
- 语气要自然真实，像猫主人自己写的，不要有广告感
- 猫舍信息要自然融入，不要刻意推销
- 文案要让读者觉得"好羡慕，我也想养一只"
- 必须只输出上述JSON格式`;
}

// Extract JSON from AI response that may contain markdown code blocks
function extractJson(text) {
  // Try direct parse first
  try { return JSON.parse(text); } catch(e) {}
  // Try extracting from ```json ... ``` blocks
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch(e) {}
  }
  // Try finding first { ... } block
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch(e) {}
  }
  return null;
}

async function callGemini(env, prompt) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');

  const parsed = extractJson(text);
  if (!parsed) throw new Error('Failed to parse Gemini JSON response');
  return parsed;
}

async function callQianwen(env, prompt) {
  const key = env.QIANWEN_API_KEY;
  if (!key) throw new Error('QIANWEN_API_KEY not configured');

  const res = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        messages: [
          { role: 'system', content: '你是一位温暖有文采的宠物内容写手。请严格按JSON格式输出。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 1024,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Qianwen API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Qianwen returned empty response');

  const parsed = extractJson(text);
  if (!parsed) throw new Error('Failed to parse Qianwen JSON response');
  return parsed;
}

// Shared prompt for photo analysis (used by both Gemini & Qianwen Vision)
const PHOTO_ANALYSIS_PROMPT = `この猫の写真を分析して、以下のJSON形式で出力してください（他のテキストは不要）：
{
  "color": "（毛色を日本語で1つ。例：シルバータビー、ブラウンタビー、ホワイト、ブルー、ゴールデンタビー、クリーム、レッド、ブラック、ネヴァマスカレード）",
  "traits": ["（猫の表情や雰囲気から感じる性格を3つ。例：甘えん坊、好奇心旺盛、おっとり、やんちゃ、人懐っこい、マイペース、元気いっぱい、穏やか）"],
  "pose": "（猫の姿勢を簡潔に。例：くつろいでいる、こちらを見つめている、遊んでいる、眠そう）"
}
注意：必ず上記のJSON形式のみ出力してください。`;

// Gemini Vision — analyze cat photo for color / traits / pose
async function callGeminiVision(env, base64Data, mimeType) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PHOTO_ANALYSIS_PROMPT },
            { inlineData: { mimeType, data: base64Data } },
          ],
        }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Vision API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini Vision returned empty response');

  const parsed = extractJson(text);
  if (!parsed) throw new Error('Failed to parse Gemini Vision JSON response');
  return parsed;
}

// Qianwen Vision fallback — uses qwen-vl-plus via OpenAI-compatible endpoint
async function callQianwenVision(env, base64Data, mimeType) {
  const key = env.QIANWEN_API_KEY;
  if (!key) throw new Error('QIANWEN_API_KEY not configured');

  const dataUri = `data:${mimeType};base64,${base64Data}`;
  const res = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'qwen-vl-plus',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUri } },
            { type: 'text', text: PHOTO_ANALYSIS_PROMPT },
          ],
        }],
        temperature: 0.4,
        max_tokens: 512,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Qianwen Vision API error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Qianwen Vision returned empty response');

  const parsed = extractJson(text);
  if (!parsed) throw new Error('Failed to parse Qianwen Vision JSON response');
  return parsed;
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

function json(data, status = 200, cacheControl) {
  const headers = { 'Content-Type': 'application/json' };
  if (cacheControl) headers['Cache-Control'] = cacheControl;
  return new Response(JSON.stringify(data), { status, headers });
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
        return addCors(json(data || [], 200, 'no-store'));
      }

      // GET /api/parents — 公開：親猫一覧
      if (path === '/api/parents' && method === 'GET') {
        const data = await env.DATA.get('parents', 'json');
        return addCors(json(data || [], 200, 'no-store'));
      }

      // GET /api/reviews — 公開：レビュー一覧
      if (path === '/api/reviews' && method === 'GET') {
        const data = await env.DATA.get('reviews', 'json');
        return addCors(json(data || [], 200, 'no-store'));
      }

      // GET /api/gallery — 公開：ギャラリー一覧
      if (path === '/api/gallery' && method === 'GET') {
        const data = await env.DATA.get('gallery', 'json');
        return addCors(json(data || [], 200, 'public, max-age=3600'));
      }

      // GET /api/settings — 公開：サイト設定（SNSリンク等）
      if (path === '/api/settings' && method === 'GET') {
        const data = await env.DATA.get('settings', 'json');
        return addCors(json(data || {}, 200, 'public, max-age=300'));
      }

      // GET /api/articles — 公開：記事一覧（published only, publishedAt DESC）
      if (path === '/api/articles' && method === 'GET') {
        const all = (await env.DATA.get('articles', 'json')) || [];
        const published = all.filter(a => a.published).sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
        return addCors(json(published, 200, 'public, max-age=3600'));
      }

      // GET /api/articles/:slug — 公開：記事詳細（slug検索）
      if (path.match(/^\/api\/articles\/[^/]+$/) && method === 'GET') {
        const slug = path.split('/').pop();
        const all = (await env.DATA.get('articles', 'json')) || [];
        const article = all.find(a => a.slug === slug && a.published);
        if (!article) return addCors(notFound());
        return addCors(json(article, 200, 'public, max-age=3600'));
      }

      // GET /api/faq — 公開：FAQ一覧（order ASC, published only）
      if (path === '/api/faq' && method === 'GET') {
        const all = (await env.DATA.get('faq', 'json')) || [];
        const published = all.filter(f => f.published).sort((a, b) => (a.order || 0) - (b.order || 0));
        return addCors(json(published, 200, 'public, max-age=3600'));
      }

      // ===== STORY CARD AI GENERATION (PUBLIC) =====

      // POST /api/story/analyze-photo — Gemini Vision で猫写真を分析
      if (path === '/api/story/analyze-photo' && method === 'POST') {
        const body = await request.json();
        const dataUri = body.image;
        if (!dataUri || typeof dataUri !== 'string') {
          return addCors(json({ error: 'image (base64 data URI) is required' }, 400));
        }
        // Extract mime type and base64 data from data URI
        const match = dataUri.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (!match) {
          return addCors(json({ error: 'Invalid image data URI format' }, 400));
        }
        const mimeType = match[1];
        const base64Data = match[2];
        // Reject if base64 is too large (~4MB decoded)
        if (base64Data.length > 5_500_000) {
          return addCors(json({ error: 'Image too large. Please use a smaller photo.' }, 400));
        }
        // Try Gemini first, fallback to Qianwen Vision
        try {
          const result = await callGeminiVision(env, base64Data, mimeType);
          return addCors(json(result, 200, 'no-store'));
        } catch (geminiErr) {
          try {
            const result = await callQianwenVision(env, base64Data, mimeType);
            return addCors(json(result, 200, 'no-store'));
          } catch (qwErr) {
            return addCors(json({ error: 'Photo analysis failed', detail: geminiErr.message + ' | Fallback: ' + qwErr.message }, 500));
          }
        }
      }

      // POST /api/story/generate — AI文案生成（Gemini JA + Qianwen ZH 並列）
      if (path === '/api/story/generate' && method === 'POST') {
        const body = await request.json();
        if (!body.name) return addCors(json({ error: 'name is required' }, 400));

        const jaPrompt = buildJaPrompt(body);
        const zhPrompt = buildZhPrompt(body);

        // Call both APIs in parallel
        const [jaResult, zhResult] = await Promise.allSettled([
          callGemini(env, jaPrompt),
          callQianwen(env, zhPrompt),
        ]);

        const result = { ja: null, zh: null };

        // Process JA (Gemini)
        if (jaResult.status === 'fulfilled') {
          result.ja = jaResult.value;
        }

        // Process ZH (Qianwen)
        if (zhResult.status === 'fulfilled') {
          result.zh = zhResult.value;
        }

        // Fallback: if one failed, try the other API for the missing language
        if (!result.ja && result.zh) {
          // Use Qianwen to also generate JA
          try {
            const fallbackJa = await callQianwen(env, jaPrompt);
            result.ja = fallbackJa;
          } catch(e) { /* both failed for JA */ }
        }
        if (!result.zh && result.ja) {
          // Use Gemini to also generate ZH
          try {
            const fallbackZh = await callGemini(env, zhPrompt);
            result.zh = fallbackZh;
          } catch(e) { /* both failed for ZH */ }
        }

        // If both completely failed
        if (!result.ja && !result.zh) {
          const jaErr = jaResult.status === 'rejected' ? jaResult.reason.message : '';
          const zhErr = zhResult.status === 'rejected' ? zhResult.reason.message : '';
          return addCors(json({ error: 'AI generation failed', detail: { ja: jaErr, zh: zhErr } }, 500));
        }

        return addCors(json(result, 200, 'no-store'));
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

      // ===== R2 PUBLIC IMAGE SERVING =====

      // GET /r2/* — serve images from R2 bucket
      if (path.startsWith('/r2/') && method === 'GET') {
        const key = path.slice(4); // remove '/r2/'
        const obj = await env.BUCKET.get(key);
        if (!obj) return addCors(notFound());
        return addCors(new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
            'Cache-Control': 'public, max-age=2592000', // 30 days
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

      // --- Bulk Import (for localStorage → KV migration) ---
      const bulkMatch = path.match(/^\/api\/admin\/(kittens|parents|reviews)\/bulk$/);
      if (bulkMatch && method === 'POST') {
        const type = bulkMatch[1];
        const items = await request.json();
        if (!Array.isArray(items)) return addCors(json({ error: 'Expected array' }, 400));
        await env.DATA.put(type, JSON.stringify(items));
        return addCors(json({ success: true, count: items.length }));
      }

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

      // --- Articles CRUD ---
      const articlesBulk = path === '/api/admin/articles/bulk' && method === 'POST';
      if (articlesBulk) {
        const items = await request.json();
        if (!Array.isArray(items)) return addCors(json({ error: 'Expected array' }, 400));
        await env.DATA.put('articles', JSON.stringify(items));
        return addCors(json({ success: true, count: items.length }));
      }

      if (path === '/api/admin/articles' && method === 'GET') {
        const data = await env.DATA.get('articles', 'json');
        return addCors(json(data || []));
      }

      if (path === '/api/admin/articles' && method === 'POST') {
        const body = await request.json();
        const articles = (await env.DATA.get('articles', 'json')) || [];
        body.id = crypto.randomUUID();
        body.createdAt = new Date().toISOString();
        if (body.published && !body.publishedAt) body.publishedAt = body.createdAt;
        articles.push(body);
        await env.DATA.put('articles', JSON.stringify(articles));
        return addCors(json(body, 201));
      }

      if (path.match(/^\/api\/admin\/articles\/[^/]+$/) && method === 'PUT') {
        const id = path.split('/').pop();
        const body = await request.json();
        let articles = (await env.DATA.get('articles', 'json')) || [];
        const idx = articles.findIndex(a => a.id === id);
        if (idx === -1) return addCors(notFound());
        if (body.published && !articles[idx].publishedAt && !body.publishedAt) body.publishedAt = new Date().toISOString();
        articles[idx] = { ...articles[idx], ...body, id, updatedAt: new Date().toISOString() };
        await env.DATA.put('articles', JSON.stringify(articles));
        return addCors(json(articles[idx]));
      }

      if (path.match(/^\/api\/admin\/articles\/[^/]+$/) && method === 'DELETE') {
        const id = path.split('/').pop();
        let articles = (await env.DATA.get('articles', 'json')) || [];
        articles = articles.filter(a => a.id !== id);
        await env.DATA.put('articles', JSON.stringify(articles));
        return addCors(json({ success: true }));
      }

      // --- FAQ CRUD ---
      const faqBulk = path === '/api/admin/faq/bulk' && method === 'POST';
      if (faqBulk) {
        const items = await request.json();
        if (!Array.isArray(items)) return addCors(json({ error: 'Expected array' }, 400));
        await env.DATA.put('faq', JSON.stringify(items));
        return addCors(json({ success: true, count: items.length }));
      }

      if (path === '/api/admin/faq' && method === 'GET') {
        const data = await env.DATA.get('faq', 'json');
        return addCors(json(data || []));
      }

      if (path === '/api/admin/faq' && method === 'POST') {
        const body = await request.json();
        const faq = (await env.DATA.get('faq', 'json')) || [];
        body.id = crypto.randomUUID();
        body.createdAt = new Date().toISOString();
        faq.push(body);
        await env.DATA.put('faq', JSON.stringify(faq));
        return addCors(json(body, 201));
      }

      if (path.match(/^\/api\/admin\/faq\/[^/]+$/) && method === 'PUT') {
        const id = path.split('/').pop();
        const body = await request.json();
        let faq = (await env.DATA.get('faq', 'json')) || [];
        const idx = faq.findIndex(f => f.id === id);
        if (idx === -1) return addCors(notFound());
        faq[idx] = { ...faq[idx], ...body, id, updatedAt: new Date().toISOString() };
        await env.DATA.put('faq', JSON.stringify(faq));
        return addCors(json(faq[idx]));
      }

      if (path.match(/^\/api\/admin\/faq\/[^/]+$/) && method === 'DELETE') {
        const id = path.split('/').pop();
        let faq = (await env.DATA.get('faq', 'json')) || [];
        faq = faq.filter(f => f.id !== id);
        await env.DATA.put('faq', JSON.stringify(faq));
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

      // --- Drive Status (shows all folders and their images for admin review) ---
      if (path === '/api/admin/drive/status' && method === 'GET') {
        const rootId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
        if (!rootId) return addCors(json({ error: 'GOOGLE_DRIVE_ROOT_FOLDER_ID not set' }, 500));

        // List top-level folders (kittens, parents, gallery)
        const topFolders = await driveList(env, rootId, 'folders');
        const result = {};

        for (const folder of topFolders) {
          const subfolders = await driveList(env, folder.id, 'folders');
          const subs = [];
          for (const sub of subfolders) {
            const images = await driveList(env, sub.id, 'images');
            subs.push({
              name: sub.name,
              id: sub.id,
              imageCount: images.length,
              images: images.map(img => ({ name: img.name, id: img.id })),
            });
          }
          result[folder.name] = { id: folder.id, subfolders: subs };
        }

        return addCors(json(result));
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

      // --- Publish: trigger GitHub Actions to regenerate static pages ---
      if (path === '/api/admin/publish' && method === 'POST') {
        const ghToken = env.GITHUB_TOKEN;
        if (!ghToken) return addCors(json({ error: 'GITHUB_TOKEN not configured' }, 500));
        const ghRes = await fetch('https://api.github.com/repos/mouxue56-debug/fuluckpet-website/dispatches', {
          method: 'POST',
          headers: {
            'Authorization': 'token ' + ghToken,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'fuluck-api-worker',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event_type: 'regenerate-site' }),
        });
        if (ghRes.status === 204) return addCors(json({ success: true }));
        const errBody = await ghRes.text().catch(() => '');
        return addCors(json({ error: 'GitHub API error', status: ghRes.status, detail: errBody }, 500));
      }

      return addCors(notFound());

    } catch (err) {
      return addCors(json({ error: err.message }, 500));
    }
  },
};
