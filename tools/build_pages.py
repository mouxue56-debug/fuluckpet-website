#!/usr/bin/env python3
"""Generate new static marketing pages from the site chrome (siberian.html as template).
Clones head+header+mobilenav and footer+scripts so new pages are byte-consistent with the
site; injects per-page head meta + JSON-LD + body. Content authored = public facts only,
NO fabricated Fel d1 numbers / health data / owner bio (placeholders marked [要オーナー確認]).
"""
import re, os
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = open(os.path.join(REPO, "siberian.html"), encoding="utf-8").read()
TOP = TPL[:TPL.index('<section class="page-hero"')]
BOTTOM = TPL[TPL.index('<footer class="footer"'):]
LINE = "https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true"
KONEKO = "https://www.koneko-breeder.com/breeder_c995680.html"

def build(spec):
    url = f"https://fuluckpet.com/{spec['slug']}"
    h = TOP
    h = re.sub(r'<title>.*?</title>', f"<title>{spec['title']}</title>", h, count=1, flags=re.S)
    h = re.sub(r'(<meta name="description" content=")[^"]*(">)', lambda m: m.group(1)+spec['desc']+m.group(2), h, count=1)
    h = re.sub(r'(<meta name="keywords" content=")[^"]*(">)', lambda m: m.group(1)+spec.get('keywords','')+m.group(2), h, count=1)
    h = re.sub(r'(<meta property="og:title" content=")[^"]*(">)', lambda m: m.group(1)+spec['title']+m.group(2), h, count=1)
    h = re.sub(r'(<meta property="og:description" content=")[^"]*(">)', lambda m: m.group(1)+spec['desc']+m.group(2), h, count=1)
    h = h.replace("https://fuluckpet.com/siberian.html", url)  # canonical + hreflang
    h = re.sub(r'<script type="application/ld\+json">.*?</script>', spec['jsonld'].strip(), h, count=1, flags=re.S)
    page = h + spec['body'] + BOTTOM
    open(os.path.join(REPO, spec['slug']), "w", encoding="utf-8").write(page)
    print(f"  built {spec['slug']} ({len(page)} bytes)")

def hero(h1, sub, btns=True):
    cta = (f'<div class="hero-buttons" style="justify-content:center;margin-top:24px">'
           f'<a href="/booking.html" class="btn btn-primary"><i class="ico ico-calendar-check" aria-hidden="true"></i> 見学を予約する</a>'
           f'<a href="{LINE}" class="btn btn-line" target="_blank" rel="noopener"><i class="ico ico-message-circle" aria-hidden="true"></i> LINEで相談する</a>'
           f'<a href="/kittens.html" class="btn btn-secondary"><i class="ico ico-paw-print" aria-hidden="true"></i> 子猫一覧を見る</a></div>') if btns else ''
    return (f'<section class="page-hero" id="main"><div class="container" style="text-align:center;max-width:820px">'
            f'<h1 class="page-hero-title">{h1}</h1><p class="page-hero-sub" style="font-size:1.05rem;color:var(--text-note);margin-top:14px">{sub}</p>{cta}</div></section>')

def trust_strip():
    return ('<section style="padding:8px 0 0"><div class="container" style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;text-align:center">'
            '<span style="background:#fff;border:1px solid #e8f5f0;border-radius:30px;padding:8px 18px;font-weight:600;color:#5A7A7A"><i class="ico ico-star" aria-hidden="true"></i> 5.00／100件以上</span>'
            '<span style="background:#fff;border:1px solid #e8f5f0;border-radius:30px;padding:8px 18px;font-weight:600;color:#5A7A7A"><i class="ico ico-trophy" aria-hidden="true"></i> みんなの子猫ブリーダー 全国1位（2025上半期）</span>'
            '<span style="background:#fff;border:1px solid #e8f5f0;border-radius:30px;padding:8px 18px;font-weight:600;color:#5A7A7A"><i class="ico ico-paw-print" aria-hidden="true"></i> 200+ 卒業猫</span></div></section>')

def cta_section(title="子猫のお迎えをご検討の方へ"):
    return (f'<section style="padding:48px 0"><div class="container" style="max-width:720px;text-align:center;'
            f'background:linear-gradient(135deg,#f0faf7,#fef6f0);border:1px solid #e8f5f0;border-radius:24px;padding:40px 28px">'
            f'<h2 style="border:none">{title}</h2>'
            f'<p style="color:var(--text-note);margin:12px 0 24px">LINEビデオ通話は事前相談・オンライン見学として利用できますが、契約前には登録事業所で子猫の現物確認と対面説明が必要です。</p>'
            f'<div class="hero-buttons" style="justify-content:center">'
            f'<a href="/booking.html" class="btn btn-primary"><i class="ico ico-calendar-check" aria-hidden="true"></i> 見学を予約する</a>'
            f'<a href="{LINE}" class="btn btn-line" target="_blank" rel="noopener"><i class="ico ico-message-circle" aria-hidden="true"></i> LINEで相談する</a></div>'
            f'<p style="margin-top:18px;font-size:0.88rem"><a href="{KONEKO}" target="_blank" rel="noopener" style="color:#5BC4A8;font-weight:600"><i class="ico ico-trophy" aria-hidden="true"></i> みんなの子猫ブリーダーで最新の子猫を見る</a></p></div></section>')

def jsonld_breadcrumb(name, slug, extra=""):
    e = "," + extra if extra else ""
    return ('<script type="application/ld+json">\n{ "@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[\n'
            '  {"@type":"ListItem","position":1,"name":"ホーム","item":"https://fuluckpet.com/"},\n'
            f'  {{"@type":"ListItem","position":2,"name":"{name}","item":"https://fuluckpet.com/{slug}"}}\n]}}\n</script>' + (f'\n  <script type="application/ld+json">\n{extra}\n  </script>' if extra else ''))

def faq_jsonld(qa):
    items = ",".join('{"@type":"Question","name":"%s","acceptedAnswer":{"@type":"Answer","text":"%s"}}' % (q, a) for q, a in qa)
    return '{ "@context":"https://schema.org","@type":"FAQPage","mainEntity":[%s]}' % items

# ============ PAGE 1: commercial landing (geo + breed) ============
LANDING_FAQ = [
 ("大阪・関西でサイベリアンの子猫を迎えるには？", "予約ページまたはLINEからご相談ください。LINEビデオ通話は事前相談・オンライン見学として利用できますが、契約前には登録事業所で子猫の現物確認と対面説明が必要です。現地見学は完全予約制です。"),
 ("子猫の最新の料金はどこで確認できますか？", "料金は子猫ごとに異なります。各子猫ページの最新情報をご確認いただくか、LINEでお問い合わせください。"),
 ("猫アレルギーですが大丈夫ですか？", "サイベリアンはアレルゲン（Fel d1）が他の猫種より少ないとされますが個人差があります。見学時にアレルギーの相性チェックのお時間を長めにお取りすることが可能です。"),
]
LANDING_BODY = (hero(
    "サイベリアン ブリーダー 大阪・関西",
    "低アレルゲンで穏やかな性格のサイベリアンを、大阪から関西全域・全国へ。健康管理と社会化を大切に育てた子猫をお届けする専門キャッテリーです。"
  ) + trust_strip() +
  '<section style="padding:40px 0"><div class="container" style="max-width:860px">'
  '<h2>なぜ大阪で福楽キャッテリーが選ばれるのか</h2>'
  '<ul style="line-height:2.1;font-size:1.02rem">'
  '<li><b>みんなの子猫ブリーダー 全国第1位</b>（2025年上半期）・口コミ <b>5.00★×100件以上</b>・<b>200頭以上</b>の卒業実績。</li>'
  '<li><b>低アレルゲン（Fel d1）に特化</b>したサイベリアン専門。猫アレルギーのご家庭からのご相談を多数いただいています。</li>'
  '<li><b>遺伝子検査（PKD・HCM）</b>を実施し、結果を確認できる親猫から繁殖。マイクロチップ・ワクチン・健康診断済みでお渡し。</li>'
  '<li>見学時に<b>アレルギーの相性チェック</b>のお時間を確保。実際に会って納得してからお迎えいただけます。</li>'
  '</ul></div></section>'
  '<section style="padding:8px 0 40px"><div class="container" style="max-width:860px">'
  '<h2>対応エリア</h2>'
  '<p>大阪府を拠点に、<b>兵庫・京都・奈良・和歌山・滋賀</b>など関西全域へ。空輸・陸送による<b>全国へのお届け</b>、直接のお迎えにも対応しています。完全予約制です。</p>'
  '<h2 style="margin-top:28px">子猫ごとの最新情報</h2>'
  '<p>料金は子猫ごとに異なります。各子猫ページの最新情報をご確認いただくか、LINEでお問い合わせください。<a href="/kittens.html">子猫一覧</a>から現在の子猫をご覧いただけます。'
  '<span style="color:var(--text-note)">総額や内訳について確認したい点は、<a href="https://page.line.me/915hnnlk?oat__id=5765672&openQrModal=true" target="_blank" rel="noopener" style="color:#5BC4A8;font-weight:600">LINE</a>でお気軽にご相談いただけます。</span></p>'
  '<h2 style="margin-top:28px">お迎えまでの流れ</h2>'
  '<p>① <a href="/booking.html">予約ページ</a>／LINEでご相談（ビデオ通話は事前相談・オンライン見学） → ② 登録事業所で現物確認・対面説明（約30分〜1時間）＋相性チェック → ③ ご契約 → ④ お迎え。'
  '詳しくは<a href="/guide/">お迎えガイド</a>、子猫は<a href="/kittens.html">子猫一覧</a>をご覧ください。</p>'
  '</div></section>' + cta_section())

# ============ PAGE 2: honest allergy authority page (NO fabricated numbers) ============
ALLERGY_FAQ = [
 ("サイベリアンは猫アレルギーでも飼えますか？", "サイベリアンはアレルゲンであるFel d1の分泌量が他の猫種より少ない傾向があるとされますが、個人差があり「絶対大丈夫」ではありません。お迎え前のアレルギー検査と、見学時の相性チェックを強くおすすめします。"),
 ("Fel d1とは何ですか？", "Fel d1は猫の唾液や皮脂に含まれる主要なアレルゲンたんぱく質です。猫が毛づくろいをすることで被毛や環境に広がります。サイベリアンはこのFel d1が比較的少ない個体が多いと報告されています。"),
 ("お迎え前にできることは？", "①病院でのアレルギー検査、②見学時にサイベリアンと長めに接触して反応を確認、③段階的な接触で体を慣らす、④医師に相談。福楽キャッテリーでは見学時の相性チェックのお時間を長めにお取りできます。"),
]
ALLERGY_BODY = (hero(
    "猫アレルギーでも飼えるサイベリアン",
    "低アレルゲン（Fel d1）と言われるサイベリアン。大阪の専門ブリーダーが、科学的な背景と、お迎え前に必ず確認したいことを正直に解説します。"
  ) + trust_strip() +
  '<section style="padding:40px 0"><div class="container" style="max-width:820px">'
  '<h2>サイベリアンと低アレルゲンの関係</h2>'
  '<p>猫アレルギーの主な原因は、猫の唾液・皮脂に含まれる<b>Fel d1</b>というたんぱく質です。サイベリアンはこのFel d1の分泌量が他の猫種より少ない個体が多いと報告されており、「猫を諦めていた」アレルギーのご家庭から多くご相談をいただきます。</p>'
  '<div style="background:#fff7ec;border-left:4px solid #E8B84B;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0">'
  '<b>大切な正直なお願い</b><br>Fel d1の量には<b>個体差</b>があり、性別・去勢の有無・毛色などでも変わると言われます。「サイベリアンなら絶対アレルギーが出ない」ということはありません。'
  '必ず<b>お迎え前のアレルギー検査</b>と、<b>実際に会っての相性チェック</b>を行ってください。</div>'
  '<h2 style="margin-top:8px">福楽キャッテリーの取り組み</h2>'
  '<ul style="line-height:2.1">'
  '<li><b>低アレルゲン</b>を重視したサイベリアン専門のブリーディング。</li>'
  '<li>現地見学時に<b>アレルギーの相性チェック</b>のお時間を長めに確保。LINEビデオ通話は事前相談・オンライン見学に限り、契約前には登録事業所での現物確認と対面説明が必要です。</li>'
  '<li>遺伝子検査（PKD・HCM）実施、健康管理・社会化を徹底。</li>'
  '<li><span style="color:var(--text-note)">自家猫のFel d1実測データは、準備が整い次第こちらに掲載します。現時点では、見学時に実際にサイベリアンと触れ合い、ご自身の反応をご確認いただくことを最もおすすめしています。</span></li>'
  '</ul>'
  '<h2 style="margin-top:8px">お迎え前の4ステップ</h2>'
  '<p>① 病院でアレルギー検査 → ② 見学でサイベリアンと長めに接触し反応を確認 → ③ 段階的に接触して慣らす → ④ 不安があれば医師に相談。'
  '段階を踏むことで、安心してお迎えいただけます。</p>'
  '<h2 style="margin-top:24px">もっと詳しく</h2>'
  '<p>関連する記事もご覧ください：'
  '<a href="/blog/cat-allergy-guide.html">猫アレルギー対策ガイド</a>｜'
  '<a href="/blog/siberian-allergy-solution.html">サイベリアンとアレルギー</a>｜'
  '<a href="/blog/allergy-test-method.html">アレルギー検査の方法</a>｜'
  '<a href="/blog/allergy-living-tips.html">アレルギーと暮らす工夫</a></p>'
  '</div></section>' + cta_section("猫アレルギーのご相談・見学のご予約"))

# ============ PAGE 3: upcoming-litters / waitlist ============
WAITLIST_BODY = (hero(
    "次回出産・お迎え予約（ウェイトリスト）",
    "ご希望の毛色やお迎え時期がお決まりの方へ。次の子猫が生まれた際に、ウェイトリストの方へ優先的にご案内します。"
  ) + trust_strip() +
  '<section style="padding:40px 0"><div class="container" style="max-width:760px">'
  '<h2>ウェイトリストの流れ</h2>'
  '<p>① LINEで「ウェイトリスト希望」とご連絡（ご希望の毛色・性別・お迎え時期をお知らせください） → ② 次回の出産・空き状況が決まり次第、リストの方へ<b>優先的にご案内</b> → ③ 見学・ご予約。</p>'
  '<div style="background:#f8fdfb;border:1px solid #e8f5f0;border-radius:16px;padding:24px;margin:24px 0;text-align:center">'
  '<p style="margin-bottom:16px;color:var(--text-note)">いま在籍中の子猫は<a href="/kittens.html">子猫一覧</a>と'
  '<a href="' + KONEKO + '" target="_blank" rel="noopener">みんなの子猫ブリーダー</a>でご覧いただけます。</p>'
  '<a href="' + LINE + '" class="btn btn-line" target="_blank" rel="noopener" style="margin:0 auto"><i class="ico ico-message-circle" aria-hidden="true"></i> LINEでウェイトリストに登録</a></div>'
  '<p style="color:var(--text-note);font-size:0.95rem">次回の出産・お迎え予定が決まり次第、このページとLINEでお知らせします。ウェイトリストにご登録いただいた方には、一般公開前に優先してご案内いたします。</p>'
  '</div></section>' + cta_section())

PAGES = [
 {"slug":"siberian-breeder-osaka.html","title":"サイベリアン ブリーダー 大阪・関西｜低アレルゲン専門｜福楽キャッテリー",
  "desc":"大阪のサイベリアン専門ブリーダー・福楽キャッテリー。低アレルゲンで穏やかな子猫を関西全域・全国へ。口コミ5.00★×100件以上、みんなの子猫ブリーダー全国1位。見学予約受付中。",
  "keywords":"サイベリアン,ブリーダー,大阪,関西,子猫,低アレルゲン,福楽キャッテリー,見学,価格,猫アレルギー",
  "jsonld":jsonld_breadcrumb("サイベリアン ブリーダー 大阪・関西","siberian-breeder-osaka.html", faq_jsonld(LANDING_FAQ)),
  "body":LANDING_BODY},
 {"slug":"siberian-allergy.html","title":"猫アレルギーでも飼えるサイベリアン【ブリーダー解説】｜福楽キャッテリー",
  "desc":"猫アレルギーの原因Fel d1とサイベリアンの低アレルゲン性を、大阪の専門ブリーダーが正直に解説。個体差・お迎え前の検査・見学時の相性チェックまで。",
  "keywords":"サイベリアン,猫アレルギー,低アレルゲン,Fel d1,アレルギー検査,相性チェック,大阪,ブリーダー",
  "jsonld":jsonld_breadcrumb("猫アレルギーでも飼えるサイベリアン","siberian-allergy.html", faq_jsonld(ALLERGY_FAQ)),
  "body":ALLERGY_BODY},
 {"slug":"waitlist.html","title":"次回出産・お迎え予約（ウェイトリスト）｜福楽キャッテリー",
  "desc":"サイベリアンの次回出産・お迎えのウェイトリスト受付中。ご希望の毛色・時期をLINEでお知らせいただくと、次の子猫を優先的にご案内します。大阪・福楽キャッテリー。",
  "keywords":"サイベリアン,ウェイトリスト,予約,次回出産,子猫,大阪,福楽キャッテリー",
  "jsonld":jsonld_breadcrumb("お迎え予約（ウェイトリスト）","waitlist.html"),
  "body":WAITLIST_BODY},
]

if __name__ == "__main__":
    import sys
    # GUARD: these pages have been hand-edited AFTER generation and a blind
    # regenerate would DESTROY that work. As of 2026-06-23 the live pages carry:
    #   - siberian-allergy.html: an interactive self-check quiz (id=acqForm) NOT in ALLERGY_BODY
    #   - all 3 pages: the site-wide emoji->SVG icon conversion (<i class="ico ...">)
    #   - honest no-data copy that replaced the [要オーナー確認] placeholders
    # Re-run only with --force AND after porting the quiz + re-running tools/deemoji.py.
    if "--force" not in sys.argv:
        print("REFUSING to regenerate: live pages have a hand-added quiz, SVG icons, and "
              "edited copy that this generator would overwrite. Re-run with --force only "
              "after porting those into the *_BODY blocks, then run tools/deemoji.py.")
        sys.exit(1)
    for p in PAGES:
        build(p)
    print("done — REMEMBER to re-run tools/deemoji.py and re-add the allergy quiz.")
