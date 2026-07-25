import pandas as pd, json, re

path = r"D:\workspace\llm_dashboard\resource\关键词报告-每日明细.xlsx"
df = pd.read_excel(path, sheet_name="sheet1")
fx = pd.read_excel(path, sheet_name="汇率")
FX = {str(r['国家']).strip(): float(r['美元']) for _, r in fx.iterrows()}

# 读回生成的 JS 数据
with open(r"D:\workspace\llm_dashboard\dashboard\data\kw_data.js", encoding="utf-8") as f:
    txt = f.read()
obj = json.loads(txt[txt.index('=')+1:].rstrip().rstrip(';'))
cIdx = obj['cols'].index('c'); spIdx = obj['cols'].index('sp'); saIdx = obj['cols'].index('sa')
countries = obj['dims']['c']

# 各国 raw 本币总花费 vs 生成的美元总花费
raw = df.copy()
raw['花费-本币'] = pd.to_numeric(raw['花费-本币'], errors='coerce').fillna(0)
raw_sum = raw.groupby('国家')['花费-本币'].sum()

gen = {}
for row in obj['rows']:
    c = countries[row[cIdx]]
    gen[c] = gen.get(c, 0) + row[spIdx]

print(f"{'国家':<6}{'汇率':>8}{'原始本币花费':>16}{'期望美元':>16}{'生成美元':>16}")
for c in sorted(raw_sum.index):
    rate = FX.get(c, None)
    exp = raw_sum[c] * rate if rate else None
    print(f"{c:<6}{rate:>8}{raw_sum[c]:>16.2f}{exp:>16.2f}{gen.get(c,0):>16.2f}")
