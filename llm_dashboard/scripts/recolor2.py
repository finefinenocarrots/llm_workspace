# -*- coding: utf-8 -*-
"""第二轮：替换 rgba 旧色值与残留内联色"""
import io, os

MAP = {
    # rgba 中的旧 RGB 分量 → 新色板
    '79,110,247': '51,96,140',    # 蓝 → 墨蓝
    '20,184,166': '63,143,125',   # 青 → 青绿
    '139,92,246': '138,122,168',  # 紫 → 灰紫
    '245,158,11': '217,154,61',   # 橙 → 赭黄
    '30,41,59':   '38,43,51',     # 阴影墨色
    '#9ca3af': '#a3a8ae',
}

FILES = [
    r'D:\workspace\llm_dashboard\dashboard\assets\ads.js',
    r'D:\workspace\llm_dashboard\dashboard\assets\target.js',
    r'D:\workspace\llm_dashboard\dashboard\assets\common.js',
    r'D:\workspace\llm_dashboard\dashboard\index.html',
    r'D:\workspace\llm_dashboard\dashboard\target.html',
]

for f in FILES:
    s = io.open(f, encoding='utf-8').read()
    n = 0
    for old, new in MAP.items():
        n += s.count(old)
        s = s.replace(old, new)
    io.open(f, 'w', encoding='utf-8', newline='\n').write(s)
    print(os.path.basename(f), 'replaced:', n)
