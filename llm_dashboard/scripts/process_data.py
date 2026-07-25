# -*- coding: utf-8 -*-
"""
跨境电商广告看板数据处理脚本
输入:
  resource/关键词报告-每日明细.xlsx (sheet1)      -> 广告数据看板
  resource/广告目标达成进度.xlsx (多sheet综合)     -> 广告目标达成看板
输出:
  dashboard/data/kw_data.js     window.KW_DATA
  dashboard/data/tg_data.js     window.TG_DATA
"""
import pandas as pd
import numpy as np
import json
import os
import sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE = r"D:\workspace\llm_dashboard"
RES = os.path.join(BASE, "resource")
OUT = os.path.join(BASE, "dashboard", "data")
os.makedirs(OUT, exist_ok=True)

COUNTRY_MAP = {
    '美国': 'US', '英国': 'UK', '德国': 'DE', '法国': 'FR', '西班牙': 'ES',
    '意大利': 'IT', '加拿大': 'CA', '墨西哥': 'MX', '荷兰': 'NL',
    '波兰': 'PL', '瑞典': 'SE', '爱尔兰': 'IE',
}

def r2(x):
    try:
        v = float(x)
        if np.isnan(v) or np.isinf(v):
            return 0
        return round(v, 2)
    except Exception:
        return 0

def dump_js(path, varname, obj):
    js = "window.%s = %s;" % (varname, json.dumps(obj, ensure_ascii=False, separators=(',', ':')))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(js)
    print(f"written {path}  size={os.path.getsize(path)/1024:.0f} KB")

# ============================================================
# Part 1: 广告数据看板 —— 关键词报告 sheet1
# ============================================================
print(">>> 处理 关键词报告-每日明细 sheet1 ...")
KW_XLSX = os.path.join(RES, "关键词报告-每日明细.xlsx")
df = pd.read_excel(KW_XLSX, sheet_name="sheet1")
df['日期'] = df['日期'].astype(str).str[:10]
num_cols = ['曝光量', '点击', '花费-本币', '广告销售额-本币', '广告订单', '广告销量']
for c in num_cols:
    df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0)

# ---- 汇率转换：本币金额 -> 美元 (仅广告数据看板生效) ----
# 汇率sheet: 国家/本币(=1)/美元 ; 换算公式 usd = local * 美元汇率
fx_df = pd.read_excel(KW_XLSX, sheet_name="汇率")
FX = {str(r['国家']).strip(): float(r['美元']) for _, r in fx_df.iterrows()}
print(f"汇率表: {FX}")
# sheet1 所有涉及本币的金额列（比率列 ACoS/ROAS/CVR/CTR 不随汇率变化，无需转换）
local_money_cols = ['CPC-本币', '花费-本币', '广告销售额-本币', '直接销售额-本币',
                    '间接销售额-本币', 'CPA-本币', '广告笔单价-本币']
_rate = df['国家'].astype(str).str.strip().map(FX)
if _rate.isna().any():
    miss = df.loc[_rate.isna(), '国家'].unique().tolist()
    raise ValueError(f"以下国家在汇率表中缺失，无法换算: {miss}")
for c in local_money_cols:
    if c in df.columns:
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0) * _rate
print("已将本币金额列换算为美元。")

# 维度字典编码
dim_cols = {
    'd': '日期', 'o': '运营负责人', 's': '店铺名称', 'c': '国家',
    'g': '类目', 'p': '广告组合', 'a': '广告活动', 'k': '关键词',
    'm': '匹配方式', 't': '类型',
}
dims = {}
codes = {}
for key, col in dim_cols.items():
    vals = sorted(df[col].fillna('未知').astype(str).unique().tolist())
    dims[key] = vals
    idx = {v: i for i, v in enumerate(vals)}
    codes[key] = df[col].fillna('未知').astype(str).map(idx).astype(int)

rows = []
for i in range(len(df)):
    rows.append([
        int(codes['d'].iat[i]), int(codes['o'].iat[i]), int(codes['s'].iat[i]),
        int(codes['c'].iat[i]), int(codes['g'].iat[i]), int(codes['p'].iat[i]),
        int(codes['a'].iat[i]), int(codes['k'].iat[i]), int(codes['m'].iat[i]),
        int(codes['t'].iat[i]),
        int(df['曝光量'].iat[i]), int(df['点击'].iat[i]),
        r2(df['花费-本币'].iat[i]), r2(df['广告销售额-本币'].iat[i]),
        int(df['广告订单'].iat[i]), int(df['广告销量'].iat[i]),
    ])

kw_data = {
    'dims': dims,
    # 行结构: d,o,s,c,g,p,a,k,m,t, impressions, clicks, spend, sales, orders, units
    'cols': ['d', 'o', 's', 'c', 'g', 'p', 'a', 'k', 'm', 't', 'im', 'cl', 'sp', 'sa', 'od', 'un'],
    'rows': rows,
}
dump_js(os.path.join(OUT, "kw_data.js"), "KW_DATA", kw_data)
print(f"kw rows: {len(rows)}, 日期: {dims['d'][0]} ~ {dims['d'][-1]}")

# ============================================================
# Part 2: 广告目标达成看板 —— 广告目标达成进度.xlsx
# ============================================================
print(">>> 处理 广告目标达成进度 ...")
xl = pd.ExcelFile(os.path.join(RES, "广告目标达成进度.xlsx"))

# ---- 2.1 产品表现数据源(日级实际) ----
perf = xl.parse("产品表现数据源", usecols=[
    '日期', '负责人', '店铺', '国家', '类目', '销售额', '广告花费', '广告销售额',
    '展示', '点击', '广告订单量', '订单量'])
perf['日期'] = pd.to_datetime(perf['日期']).dt.strftime('%Y-%m-%d')
perf = perf[perf['日期'] >= '2026-03-01'].copy()
perf['国家'] = perf['国家'].map(COUNTRY_MAP).fillna(perf['国家'])
for c in ['销售额', '广告花费', '广告销售额', '展示', '点击', '广告订单量', '订单量']:
    perf[c] = pd.to_numeric(perf[c], errors='coerce').fillna(0)

agg = perf.groupby(['日期', '负责人', '店铺', '国家', '类目'], as_index=False).agg(
    sales=('销售额', 'sum'), adsp=('广告花费', 'sum'), adsa=('广告销售额', 'sum'),
    imp=('展示', 'sum'), clk=('点击', 'sum'), adod=('广告订单量', 'sum'), od=('订单量', 'sum'))
print(f"perf 聚合后 rows: {len(agg)}")

tdim_cols = {'d': '日期', 'o': '负责人', 's': '店铺', 'c': '国家', 'g': '类目'}
tdims = {}
tcodes = {}
for key, col in tdim_cols.items():
    vals = sorted(agg[col].fillna('未知').astype(str).unique().tolist())
    tdims[key] = vals
    idx = {v: i for i, v in enumerate(vals)}
    tcodes[key] = agg[col].fillna('未知').astype(str).map(idx).astype(int)

trows = []
for i in range(len(agg)):
    trows.append([
        int(tcodes['d'].iat[i]), int(tcodes['o'].iat[i]), int(tcodes['s'].iat[i]),
        int(tcodes['c'].iat[i]), int(tcodes['g'].iat[i]),
        r2(agg['sales'].iat[i]), r2(agg['adsp'].iat[i]), r2(agg['adsa'].iat[i]),
        int(agg['imp'].iat[i]), int(agg['clk'].iat[i]),
        int(agg['adod'].iat[i]), int(agg['od'].iat[i]),
    ])

# ---- 2.2 月度目标(每月销售目标: 目标销售额 + 目标月花费; 用 list-info 补店铺) ----
sales_t = xl.parse("每月销售目标")
info = xl.parse("list-info", usecols=['国家', '公司SKU', '店铺'])
info = info.drop_duplicates(subset=['国家', '公司SKU'])
sales_t = sales_t.merge(info, left_on=['国家', 'SKU'], right_on=['国家', '公司SKU'], how='left')
sales_t['店铺'] = sales_t['店铺'].fillna('未知')
for c in ['本月销售额目标', '本月目标月花费']:
    sales_t[c] = pd.to_numeric(sales_t[c], errors='coerce').fillna(0)
sales_t['产品类目'] = sales_t['产品类目'].fillna('未知').astype(str)

tg = sales_t.groupby(['年', '月份', '运营', '国家', '产品类目', '店铺'], as_index=False).agg(
    tgt_sales=('本月销售额目标', 'sum'), tgt_spend=('本月目标月花费', 'sum'))
print(f"月度目标聚合后 rows: {len(tg)}")

# 目标维度需与实际维度字典对齐: 运营->o, 国家->c, 类目->g, 店铺->s
def code_of(dimkey, val):
    arr = tdims[dimkey]
    val = str(val)
    if val not in arr:
        arr.append(val)
    return arr.index(val)

grows = []
for i in range(len(tg)):
    grows.append([
        int(tg['年'].iat[i]), int(tg['月份'].iat[i]),
        code_of('o', tg['运营'].iat[i]), code_of('s', tg['店铺'].iat[i]),
        code_of('c', tg['国家'].iat[i]), code_of('g', tg['产品类目'].iat[i]),
        r2(tg['tgt_sales'].iat[i]), r2(tg['tgt_spend'].iat[i]),
    ])

tg_data = {
    'dims': tdims,
    # daily 行: d,o,s,c,g, sales, adspend, adsales, imp, clk, adorders, orders
    'dailyCols': ['d', 'o', 's', 'c', 'g', 'sales', 'adsp', 'adsa', 'imp', 'clk', 'adod', 'od'],
    'daily': trows,
    # targets 行: year, month, o, s, c, g, tgtSales, tgtSpend
    'tgtCols': ['y', 'mo', 'o', 's', 'c', 'g', 'ts', 'tp'],
    'targets': grows,
}
dump_js(os.path.join(OUT, "tg_data.js"), "TG_DATA", tg_data)
print(f"daily rows: {len(trows)}, targets rows: {len(grows)}")
print(f"daily 日期: {tdims['d'][0]} ~ {tdims['d'][-1]}")
print("done.")
