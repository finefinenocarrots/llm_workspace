# -*- coding: utf-8 -*-
"""
更新看板数据后，给两个 HTML 页面里的所有静态资源引用追加/递增缓存版本号（?v=...），
强制浏览器重新拉取新数据，避免看到旧缓存。

用法:
  python scripts/bump_data_version.py
新版本号格式: YYYYMMDD + 'd' + 当日递增计数  (例: 20260726d1, 20260726d2)
"""
import re, os, datetime

BASE = r"D:\workspace\llm_dashboard"
HTMLS = [
    os.path.join(BASE, "dashboard", "index.html"),
    os.path.join(BASE, "dashboard", "target.html"),
    os.path.join(BASE, "dashboard", "keywords.html"),
]
STATE = os.path.join(BASE, "scripts", ".cachever")

today = datetime.date.today().strftime("%Y%m%d")

cnt = 1
if os.path.exists(STATE):
    try:
        with open(STATE, encoding="utf-8") as f:
            d = f.read().strip()
        if d.startswith(today + ":"):
            cnt = int(d.split(":")[1]) + 1
    except Exception:
        cnt = 1

newver = f"{today}d{cnt}"
with open(STATE, "w", encoding="utf-8") as f:
    f.write(f"{today}:{cnt}")

pat = re.compile(r"\?v=[A-Za-z0-9_]+")
total = 0
for h in HTMLS:
    if not os.path.exists(h):
        print(f"!! 找不到 {h}")
        continue
    s = open(h, encoding="utf-8").read()
    refs = re.findall(pat, s)
    s2 = pat.sub(f"?v={newver}", s)
    open(h, "w", encoding="utf-8").write(s2)
    print(f"{os.path.basename(h)}: 替换 {len(refs)} 处引用 -> ?v={newver}")
    total += len(refs)

print(f"done. new version = ?v={newver} (共 {total} 处)")
