#!/usr/bin/env python3
"""Inject _blogArticleI18n objects from a translation-workflow output file.
Usage: python3 tools/inject_translations.py <task-output.json>"""
import sys, json, re, os
out=sys.argv[1]
top=json.load(open(out))
inner=top.get("result", top)
if isinstance(inner,str): inner=json.loads(inner)
res=inner["results"]
SCRIPT_RX=re.compile(r'(<script src="/blog/blog-i18n\.js[^"]*"></script>)')
done=skip=0; bad=[]
for r in res:
    f=f"blog/{r['slug']}.html"
    if not os.path.exists(f): bad.append((r['slug'],'no-file')); continue
    s=open(f,encoding="utf-8",errors="surrogatepass").read()
    if '_blogArticleI18n' in s: skip+=1; continue
    if not SCRIPT_RX.search(s): bad.append((r['slug'],'no-i18n-script')); continue
    obj={"en":r["en"],"zh":r["zh"]}
    inj='  <script>window._blogArticleI18n = '+json.dumps(obj,ensure_ascii=False)+';</script>\n  '
    s=SCRIPT_RX.sub(lambda m: inj+m.group(1), s, count=1)
    m=re.search(r'window\._blogArticleI18n = (\{.*?\});</script>',s,re.S)
    try: json.loads(m.group(1))
    except Exception as e: bad.append((r['slug'],f'bad-json')); continue
    open(f,"w",encoding="utf-8",errors="surrogatepass").write(s); done+=1
print(f"injected {done}, skipped {skip}, failed {bad}")
print("files:"," ".join(f"blog/{r['slug']}.html" for r in res))
