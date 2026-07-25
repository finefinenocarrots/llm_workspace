# -*- coding: utf-8 -*-
"""探索两个 Excel 数据源的结构"""
import pandas as pd
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

RES = r"D:\workspace\llm_dashboard\resource"

print("=" * 60)
print("文件1: 关键词报告-每日明细.xlsx")
xl1 = pd.ExcelFile(RES + r"\关键词报告-每日明细.xlsx")
print("sheets:", xl1.sheet_names)
df1 = xl1.parse(xl1.sheet_names[0], nrows=5)
print("shape(前5行):", df1.shape)
print("columns:", list(df1.columns))
print(df1.head(3).to_string())

print("=" * 60)
print("文件2: 广告目标达成进度.xlsx")
xl2 = pd.ExcelFile(RES + r"\广告目标达成进度.xlsx")
print("sheets:", xl2.sheet_names)
for s in xl2.sheet_names:
    df = xl2.parse(s, nrows=5)
    print("-" * 50)
    print(f"sheet: {s}  cols({len(df.columns)}):")
    print(list(df.columns))
    print(df.head(2).to_string()[:1500])
