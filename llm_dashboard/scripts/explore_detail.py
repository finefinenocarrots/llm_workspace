# -*- coding: utf-8 -*-
"""探查数据量、日期范围、维度取值"""
import pandas as pd
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

RES = r"D:\workspace\llm_dashboard\resource"

print("### 文件1 sheet1")
df1 = pd.read_excel(RES + r"\关键词报告-每日明细.xlsx", sheet_name="sheet1")
print("rows:", len(df1))
print("日期范围:", df1['日期'].min(), "~", df1['日期'].max())
for c in ['运营负责人', '店铺名称', '国家', '类目', '类型', '匹配方式']:
    print(c, ":", sorted(df1[c].dropna().astype(str).unique().tolist()))
print("广告组合 unique:", df1['广告组合'].nunique())
print("关键词 unique:", df1['关键词'].nunique())
print("广告活动 unique:", df1['广告活动'].nunique())
print("花费>0 rows:", (pd.to_numeric(df1['花费-本币'], errors='coerce').fillna(0) > 0).sum())
print("dtypes:\n", df1.dtypes)

print("\n### 文件2 产品表现数据源")
df2 = pd.read_excel(RES + r"\广告目标达成进度.xlsx", sheet_name="产品表现数据源",
                    usecols=['日期', '国家', '负责人', '店铺', '类目', '销售额', '广告花费', '广告销售额', '点击', '展示', '广告订单量', '月份', '年份'])
print("rows:", len(df2))
print("日期范围:", df2['日期'].min(), "~", df2['日期'].max())
for c in ['国家', '负责人', '店铺', '类目']:
    print(c, ":", df2[c].nunique(), sorted(df2[c].dropna().astype(str).unique().tolist())[:30])

print("\n### 每月广告目标")
g = pd.read_excel(RES + r"\广告目标达成进度.xlsx", sheet_name="每月广告目标")
print("rows:", len(g))
print("年月组合:", g.groupby(['年', '月份']).size().to_dict())
print("目标花费总和 by 年月:", g.groupby(['年', '月份'])['本月目标花费'].sum().to_dict())
print("国家:", sorted(g['国家'].dropna().astype(str).unique()))
print("运营:", sorted(g['运营'].dropna().astype(str).unique()))

print("\n### 每月销售目标")
s = pd.read_excel(RES + r"\广告目标达成进度.xlsx", sheet_name="每月销售目标")
print("rows:", len(s))
print("年月组合:", s.groupby(['年', '月份']).size().to_dict())
print("cols sums by 年月 (销售额目标):", s.groupby(['年', '月份'])['本月销售额目标'].sum().to_dict())
print("目标月花费 by 年月:", s.groupby(['年', '月份'])['本月目标月花费'].sum().to_dict())
print("实际花费 by 年月:", s.groupby(['年', '月份'])['实际花费'].sum().to_dict())
print("运营负责人:", sorted(s['运营负责人'].dropna().astype(str).unique()))
print("运营:", sorted(s['运营'].dropna().astype(str).unique()))
