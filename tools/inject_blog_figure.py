#!/usr/bin/env python3
"""Inject one high-density figure into a static blog article page.

Usage: inject_blog_figure.py <slug> <webp_basename> <figcaption_ja>
  - <webp_basename> lives in images/blog-edu/  (e.g. siberian-color-types_1200.webp)
Edits blog/<slug>.html in place:
  - og:image + JSON-LD "image"  -> the new webp
  - inserts <figure class="blog-figure"> right before the FIRST <h2> inside <article>
    (i.e. as the lead illustration after the intro paragraphs)
Idempotent: if the webp is already referenced in a <figure>, it does nothing.
KV content.{ja,en,zh} is updated separately by the deploy step.
"""
import sys, re, pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
slug, webp, cap = sys.argv[1], sys.argv[2], sys.argv[3]
page = REPO / "blog" / f"{slug}.html"
html = page.read_text(encoding="utf-8")
url = f"https://fuluckpet.com/images/blog-edu/{webp}"

if f'blog-edu/{webp}"' in html and "blog-figure" in html:
    print(f"  skip {slug} (figure already present)"); sys.exit(0)

# 1) og:image
html = re.sub(r'(<meta property="og:image" content=")[^"]*(">)', rf'\g<1>{url}\g<2>', html, count=1)
# 2) JSON-LD image (first occurrence)
html = re.sub(r'("image"\s*:\s*")[^"]*(")', rf'\g<1>{url}\g<2>', html, count=1)

# 3) figure before the first <h2> inside the article
fig = (
    f'    <figure class="blog-figure">\n'
    f'      <img src="/images/blog-edu/{webp}" alt="{cap}" width="1200" height="1200" loading="lazy">\n'
    f'      <figcaption>{cap}</figcaption>\n'
    f'    </figure>\n\n'
)
# anchor: first <h2 ...> that appears after <article
art_idx = html.find("<article")
h2 = re.search(r'\n(\s*)<h2[ >]', html[art_idx:])
if not h2:
    print(f"  WARN {slug}: no <h2> in article, inserting after </h1>")
    html = re.sub(r'(</h1>\s*\n)', rf'\g<1>\n{fig}', html, count=1)
else:
    pos = art_idx + h2.start() + 1  # keep the leading newline
    html = html[:pos] + fig + html[pos:]

page.write_text(html, encoding="utf-8")
print(f"  OK {slug}: og+jsonld+figure -> {webp}")
