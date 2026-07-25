# -*- coding: utf-8 -*-
"""批量替换看板 JS 中的旧配色为编辑风新色板"""
import io, os

MAP = {
    '#4f6ef7': '#33608c', '#6d8bfa': '#4f7099', '#8b5cf6': '#8a7aa8',
    '#14b8a6': '#3f8f7d', '#f59e0b': '#d99a3d', '#ef4444': '#c0453e',
    '#10b981': '#3a8f6c', '#06b6d4': '#5f8ba3', '#f97316': '#c67b52',
    '#ec4899': '#a86f7c', '#84cc16': '#8f9d3f',
    '#eef1fe': '#e9eef4', '#e6faf6': '#e3efeb', '#fef4e6': '#f6ecd4',
    '#f3eefe': '#ece8f1', '#fff1f2': '#f4e3e1', '#ecfdf5': '#e2efe6',
    '#e0f2fe': '#e2eaf3', '#fce7f3': '#f0e4e8', '#fee2e2': '#f4e3e1',
    '#fef3c7': '#f6ecd4', '#d1fae5': '#e2efe6', '#c7d2fe': '#b9c9d9',
    '#eef0f7': '#edeae3', '#9ca3af': '#a3a8ae', '#6b7280': '#7a8089',
    '#4b5563': '#4a5058', '#374151': '#3d434b', '#1f2937': '#262b33',
    '#c7cbd6': '#cfccc2', '#e5e9f2': '#e7e4dc', '#f0f2f8': '#efede6',
    '#4ade80': '#d99a3d',
}

FILES = [
    r'D:\workspace\llm_dashboard\dashboard\assets\ads.js',
    r'D:\workspace\llm_dashboard\dashboard\assets\target.js',
    r'D:\workspace\llm_dashboard\dashboard\assets\common.js',
]

for f in FILES:
    s = io.open(f, encoding='utf-8').read()
    n = 0
    for old, new in MAP.items():
        n += s.count(old)
        s = s.replace(old, new)
    io.open(f, 'w', encoding='utf-8', newline='\n').write(s)
    print(os.path.basename(f), 'replaced:', n)
