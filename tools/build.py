#!/usr/bin/env python3
"""index.html をつくる: src/page.html に src/style.css と src/js/*.js（名前順）をはめこむ。
src/ の中を直したら、かならず `python3 tools/build.py` を実行してから公開すること。"""
import glob, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, "src")
page = open(os.path.join(src, "page.html"), encoding="utf-8").read()
css = open(os.path.join(src, "style.css"), encoding="utf-8").read()
js = "".join(open(p, encoding="utf-8").read() for p in sorted(glob.glob(os.path.join(src, "js", "*.js"))))
assert page.count("{{STYLE}}") == 1 and page.count("{{SCRIPT}}") == 1
out = page.replace("{{STYLE}}", css).replace("{{SCRIPT}}", js)
path = os.path.join(root, "index.html")
if "--check" in sys.argv:
    same = open(path, encoding="utf-8").read() == out
    print("index.html は src と一致しています" if same else "index.html が src と一致しません（build.py を実行してね）")
    sys.exit(0 if same else 1)
open(path, "w", encoding="utf-8").write(out)
print("index.html を作りました（%d 行）" % out.count("\n"))
