#!/usr/bin/env python3
"""Context-aware emoji -> Lucide mask-icon transform for fuluckpet.com.
- text nodes & <script> innerHTML strings: emoji -> <i class="ico ico-NAME">
- <title>, <style>, comments, tag attributes: emoji stripped (plain text only)
- favicon emoji data-URI: replaced with a clean brand paw SVG
Run:  python3 tools/deemoji.py <file.html> [file2 ...]   (in-place)
      python3 tools/deemoji.py --dry <file.html>          (report only)
"""
import sys, re, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icon_map import MAP

KEEP = set("←→↑↓↗↘↙↖↔↕•·▼▲◀▶")  # typographic glyphs kept as text
_keys = sorted(MAP.keys(), key=len, reverse=True)
EMOJI_RX = re.compile("(" + "|".join(re.escape(k) for k in _keys) + ")️?")
# broad emoji detector to verify leftovers
ALL_EMOJI = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U00002B00-\U00002BFF\U00002300-\U000023FF♀♂✅✔✖✨❌❤⭐]")

def to_icon(m):
    return f'<i class="ico ico-{MAP[m.group(1)]}" aria-hidden="true"></i>'

def strip(s):
    s = EMOJI_RX.sub("", s)
    s = re.sub(r"  +", " ", s)
    return s

# --- favicon: brand mint rounded-square with white paw ---
NEW_FAVICON = ("<link rel=\"icon\" type=\"image/svg+xml\" href=\"data:image/svg+xml,"
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
    "<rect width='32' height='32' rx='8' fill='%235BC4A8'/>"
    "<g fill='%23ffffff'>"
    "<ellipse cx='11' cy='12' rx='2.3' ry='2.7'/><ellipse cx='21' cy='12' rx='2.3' ry='2.7'/>"
    "<ellipse cx='7.5' cy='17.5' rx='2.1' ry='2.4'/><ellipse cx='24.5' cy='17.5' rx='2.1' ry='2.4'/>"
    "<path d='M16 16.5c3.1 0 5.6 2.2 5.6 4.9 0 2.2-1.9 3.1-5.6 3.1s-5.6-.9-5.6-3.1c0-2.7 2.5-4.9 5.6-4.9z'/>"
    "</g></svg>\">")
FAVICON_RX = re.compile(r'<link rel="icon"[^>]*?href="data:image/svg\+xml,<svg.*?</svg>"\s*/?>', re.S)

# master tokenizer (favicon must already be replaced before this runs)
TOKEN = re.compile(
    r'(?P<script><script\b[^>]*>.*?</script>)'
    r'|(?P<style><style\b[^>]*>.*?</style>)'
    r'|(?P<comment><!--.*?-->)'
    r'|(?P<title><title\b[^>]*>.*?</title>)'
    r'|(?P<tag><[^>]+>)'
    r'|(?P<text>[^<]+)', re.S)

SCRIPT_SPLIT = re.compile(r'(<script\b[^>]*>)(.*)(</script>)', re.S)
TITLE_SPLIT = re.compile(r'(<title\b[^>]*>)(.*?)(</title>)', re.S)

def transform(html):
    html = FAVICON_RX.sub(lambda m: NEW_FAVICON, html)
    out = []
    for m in TOKEN.finditer(html):
        kind = m.lastgroup
        tok = m.group()
        if kind == 'text':
            out.append(EMOJI_RX.sub(to_icon, tok))
        elif kind == 'script':
            sm = SCRIPT_SPLIT.match(tok)
            if sm:  # convert emoji inside JS strings (these are innerHTML payloads)
                out.append(sm.group(1) + EMOJI_RX.sub(to_icon, sm.group(2)) + sm.group(3))
            else:
                out.append(tok)
        elif kind == 'title':
            tm = TITLE_SPLIT.match(tok)
            out.append(tm.group(1) + strip(tm.group(2)).strip() + tm.group(3) if tm else strip(tok))
        elif kind in ('tag', 'style', 'comment'):
            out.append(strip(tok))
        else:
            out.append(tok)
    return ''.join(out)

if __name__ == '__main__':
    args = sys.argv[1:]
    dry = '--dry' in args
    files = [a for a in args if a != '--dry']
    for f in files:
        s = open(f, encoding='utf-8', errors='surrogatepass').read()
        out = transform(s)
        leftover = [c for c in ALL_EMOJI.findall(out) if c not in KEEP]
        icons = out.count('class="ico ico-')
        fav = 'OK' if "ico-cat'" not in out and "%235BC4A8" in out else 'CHECK'
        print(f"  {f}: icons+{icons}  leftover-emoji:{len(leftover)} {sorted(set(leftover))[:8]}  favicon:{fav}")
        if not dry:
            open(f, 'w', encoding='utf-8', errors='surrogatepass').write(out)
