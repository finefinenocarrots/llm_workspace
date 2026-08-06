# -*- coding: utf-8 -*-
"""分析 7月 W28-W31 费比(TACOS=广告花费/总销售额)波动，定位 W29 上涨主因。"""
import json, os
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dashboard', 'data', 'tg_data.js')
OUT = os.path.join(ROOT, 'exports', '7月W28-31费比波动分析.md')

def load_data():
    txt = open(SRC, encoding='utf-8').read()
    i = txt.index('{', txt.index('window.TG_DATA'))
    depth = 0
    for j in range(i, len(txt)):
        if txt[j] == '{': depth += 1
        elif txt[j] == '}':
            depth -= 1
            if depth == 0: return json.loads(txt[i:j+1])

def get_monday(ds):
    dt = datetime.strptime(ds, '%Y-%m-%d')
    return (dt - timedelta(days=dt.weekday())).strftime('%Y-%m-%d')

DATA = load_data()
DIM, DAILY = DATA['dims'], DATA['daily']
date_idx = {d: k for k, d in enumerate(DIM['d'])}

# 7月 daily 行
july = [r for r in DAILY if DIM['d'][r[0]].startswith('2026-07')]

def agg(rows):
    t = dict(sales=0.0, adsp=0.0, adsa=0.0, imp=0.0, clk=0.0, adod=0.0, od=0.0)
    for r in rows:
        t['sales']+=r[5]; t['adsp']+=r[6]; t['adsa']+=r[7]; t['imp']+=r[8]; t['clk']+=r[9]; t['adod']+=r[10]; t['od']+=r[11]
    return t

def metrics(t):
    adsp, sales, adsa, clk, imp, adod = t['adsp'], t['sales'], t['adsa'], t['clk'], t['imp'], t['adod']
    tacos = adsp/sales if sales>0 else float('nan')
    acos  = adsp/adsa if adsa>0 else float('nan')
    cpc   = adsp/clk if clk>0 else float('nan')
    ctr   = clk/imp if imp>0 else float('nan')
    cvr   = adod/clk if clk>0 else float('nan')
    aov   = sales/adod if adod>0 else float('nan')   # 客单价(总销售额口径)
    return dict(adsp=adsp, sales=sales, adsa=adsa, tacos=tacos, acos=acos, cpc=cpc, ctr=ctr, cvr=cvr, aov=aov, clk=clk, adod=adod)

# 按周(周一为始)聚合
weeks = {}
for r in july:
    d = DIM['d'][r[0]]
    mon = get_monday(d)
    weeks.setdefault(mon, []).append(r)

def wk_label(mon):
    dt = datetime.strptime(mon, '%Y-%m-%d')
    iso = dt.isocalendar()[1]
    return f"W{iso}({mon})"

print("=== 7月各周汇总 ===")
print(f"{'周':<16}{'花费':>12}{'销售额':>12}{'TACOS':>9}{'ACOS':>9}{'CPC':>8}{'CVR':>9}{'AOV':>9}{'点击':>10}")
rows_sorted = sorted(weeks.items())
week_metrics = {}
for mon, rows in rows_sorted:
    m = metrics(agg(rows)); week_metrics[mon] = m
    print(f"{wk_label(mon):<16}{m['adsp']:>12,.0f}{m['sales']:>12,.0f}{m['tacos']*100:>8.1f}%{m['acos']*100:>8.1f}%{('$%.2f'%m['cpc']) if m['cpc']==m['cpc'] else '—':>8}{m['cvr']*100:>8.1f}%{m['aov']:>9,.0f}{m['clk']:>10,.0f}")

# 漏斗分解: TACOS = CPC / (CVR * AOV)
def decompose(base, comp):
    tb, tc = base['tacos'], comp['tacos']
    if not (tb==tb and tc==tc and base['cpc']==base['cpc']): 
        return None
    # 对数分解
    dC = (comp['cpc']/base['cpc']) if base['cpc']>0 else 1
    dV = (comp['cvr']/base['cvr']) if base['cvr']>0 else 1
    dA = (comp['aov']/base['aov']) if base['aov']>0 else 1
    ln_t = (tc/tb)
    ln_c = dC; ln_v = 1/dV; ln_a = 1/dA
    # 贡献(占比)
    tot = (tc/tb) + (base['cpc']/base['cpc'])  # placeholder
    # 直接给出因子变化
    return dict(
        tacos_b=tb, tacos_c=tc,
        cpc_chg=(comp['cpc']/base['cpc']-1) if base['cpc']>0 else float('nan'),
        cvr_chg=(comp['cvr']/base['cvr']-1) if base['cvr']>0 else float('nan'),
        aov_chg=(comp['aov']/base['aov']-1) if base['aov']>0 else float('nan'),
    )

# 找 W29
w29 = [mon for mon in week_metrics if 'W29' in wk_label(mon)]
if not w29:
    # 兜底：找 TACOS 最高的周
    w29 = [max(week_metrics, key=lambda m: week_metrics[m]['tacos'])]
mon29 = w29[0]
print(f"\n=== 重点周: {wk_label(mon29)} ===")

# W29 相邻周对比
order = rows_sorted
idx29 = [i for i,(m,_) in enumerate(order) if m==mon29][0]
for lbl, j in [('vs 前一周(W28)', idx29-1), ('vs 后一周(W30)', idx29+1)]:
    if 0 <= j < len(order):
        monj = order[j][0]
        b, c = week_metrics[monj], week_metrics[mon29]
        d = decompose(b, c)
        print(f"\n{wk_label(mon29)} {lbl} ({wk_label(monj)}):")
        print(f"  TACOS: {b['tacos']*100:.1f}% -> {c['tacos']*100:.1f}%  ({(c['tacos']/b['tacos']-1)*100:+.1f}%)")
        print(f"  CPC 变化  : {(c['cpc']/b['cpc']-1)*100:+.1f}%   (↑推高费比)")
        print(f"  CVR 变化  : {(c['cvr']/b['cvr']-1)*100:+.1f}%   (↑=费比↓)")
        print(f"  AOV 变化  : {(c['aov']/b['aov']-1)*100:+.1f}%   (↑=费比↓)")
        print(f"  ACOS     : {b['acos']*100:.1f}% -> {c['acos']*100:.1f}%")

# 类目维度下钻：W29 各类目 TACOS 及 vs 前一周
print(f"\n=== {wk_label(mon29)} 类目下钻（按广告花费排序 Top）===")
def cat_week(mon):
    rows = weeks[mon]
    m = {}
    for r in rows:
        k = r[4]; a = m.get(k, dict(adsp=0.0,sales=0.0)); a['adsp']+=r[6]; a['sales']+=r[5]; m[k]=a
    return m
c29 = cat_week(mon29)
c28 = cat_week(order[idx29-1][0]) if idx29>0 else {}
print(f"{'类目':<14}{'W29花费':>11}{'W29销售':>11}{'W29TACOS':>10}{'W28TACOS':>10}{'ΔTACOS':>9}")
cat_rows = []
for k,a in c29.items():
    tac = a['adsp']/a['sales'] if a['sales']>0 else float('nan')
    a28 = c28.get(k)
    tac28 = a28['adsp']/a28['sales'] if (a28 and a28['sales']>0) else float('nan')
    dtac = (tac-tac28) if (tac==tac and tac28==tac28) else float('nan')
    cat_rows.append((DIM['g'][k], a['adsp'], a['sales'], tac, tac28, dtac))
for name,sp,sales,tac,tac28,dtac in sorted(cat_rows, key=lambda x:-x[1])[:12]:
    print(f"{name:<14}{sp:>11,.0f}{sales:>11,.0f}{tac*100:>9.1f}%{tac28*100:>9.1f}%{('' if dtac!=dtac else (dtac*100>0 and '+' or '')+f'{dtac*100:.1f}pp'):>9}")

# 国家维度
print(f"\n=== {wk_label(mon29)} 国家下钻 ===")
def country_week(mon):
    rows = weeks[mon]; m={}
    for r in rows:
        k=r[3]; a=m.get(k,dict(adsp=0.0,sales=0.0)); a['adsp']+=r[6]; a['sales']+=r[5]; m[k]=a
    return m
co29=country_week(mon29); co28=country_week(order[idx29-1][0]) if idx29>0 else {}
co_rows=[]
for k,a in co29.items():
    tac=a['adsp']/a['sales'] if a['sales']>0 else float('nan')
    a28=co28.get(k); tac28=a28['adsp']/a28['sales'] if (a28 and a28['sales']>0) else float('nan')
    co_rows.append((DIM['c'][k], a['adsp'], tac, tac28))
for name,sp,tac,tac28 in sorted(co_rows,key=lambda x:-x[1])[:10]:
    print(f"  {name:<10} 花费 {sp:>10,.0f}  W29TACOS {tac*100:>6.1f}%  W28 {tac28*100 if tac28==tac28 else 0:>6.1f}%")

# W29 每日 TACOS（看是否单日尖峰）
print(f"\n=== {wk_label(mon29)} 每日 TACOS ===")
days29 = sorted({DIM['d'][r[0]] for r in weeks[mon29]})
for d in days29:
    rs=[r for r in weeks[mon29] if DIM['d'][r[0]]==d]
    t=agg(rs)
    print(f"  {d}: TACOS {(t['adsp']/t['sales']*100) if t['sales']>0 else 0:.1f}%  花费 {t['adsp']:,.0f}  销售额 {t['sales']:,.0f}")

# 写报告
with open(OUT, 'w', encoding='utf-8') as f:
    f.write("# 7月 W28–W31 费比(TACOS)波动分析\n\n")
    f.write("> TACOS = 广告花费 / 总销售额。费比上涨 = 同样销售额花掉了更多广告费。\n\n")
    f.write("## 1. 各周汇总\n\n")
    f.write("| 周 | 广告花费 | 总销售额 | TACOS | ACOS | CPC | CVR | 客单价AOV | 点击 |\n")
    for mon,rows in rows_sorted:
        m=week_metrics[mon]
        f.write(f"| {wk_label(mon)} | {m['adsp']:,.0f} | {m['sales']:,.0f} | {m['tacos']*100:.1f}% | {m['acos']*100:.1f}% | ${m['cpc']:.2f} | {m['cvr']*100:.1f}% | {m['aov']:,.0f} | {m['clk']:,.0f} |\n")
    f.write("\n## 2. 归因分解（漏斗: TACOS = CPC / (CVR × AOV)）\n\n")
    f.write(f"重点周 {wk_label(mon29)} 与前一周对比：\n\n")
    if idx29>0:
        b=week_metrics[order[idx29-1][0]]; c=week_metrics[mon29]
        f.write(f"- TACOS: {b['tacos']*100:.1f}% → {c['tacos']*100:.1f}%（{(c['tacos']/b['tacos']-1)*100:+.1f}%）\n")
        f.write(f"- CPC: {(c['cpc']/b['cpc']-1)*100:+.1f}%（↑推高费比）\n")
        f.write(f"- CVR(转化率): {(c['cvr']/b['cvr']-1)*100:+.1f}%（↑代表费比↓，有利）\n")
        f.write(f"- AOV(客单价): {(c['aov']/b['aov']-1)*100:+.1f}%（↑代表费比↓，有利）\n")
    f.write("\n## 3. 类目下钻（W29 vs W28）\n\n")
    f.write("见上方控制台输出 Top 类目。\n")
print("\nSaved ->", OUT)
