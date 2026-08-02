import re, json
from collections import defaultdict

with open('D:/workspace/llm_dashboard/dashboard/data/kw_data.js', 'r', encoding='utf-8') as f:
    c = f.read()
m = re.search(r'=\s*({.*?});?\s*$', c, re.DOTALL)
data = json.loads(m.group(1))
dims = data['dims']
rows = data['rows']

p_idx_206june = dims['p'].index('206塑封机-June')
p_idx_206mina = dims['p'].index('塑封机206-mina')
us_idx = dims['c'].index('US')

target_rows = [r for r in rows if r[3] == us_idx and (r[5] == p_idx_206june or r[5] == p_idx_206mina)]
print(f'=== 塑封机206 新品 US站 关键词分析 ===')
print(f'总数据行数: {len(target_rows)}')
print()

# === 按关键词+匹配方式聚合 ===
kw_agg = defaultdict(lambda: {'im':0, 'cl':0, 'sp':0, 'sa':0, 'od':0, 'camps':set(), 'pfs':set(), 'mts':set()})
for r in target_rows:
    kw = dims['k'][r[7]]
    mt = dims['m'][r[8]]
    pf = dims['p'][r[5]]
    key = kw + '|||' + mt
    kw_agg[key]['im'] += r[11]
    kw_agg[key]['cl'] += r[12]
    kw_agg[key]['sp'] += r[13]
    kw_agg[key]['sa'] += r[14]
    kw_agg[key]['od'] += r[15]
    kw_agg[key]['camps'].add(dims['a'][r[6]])
    kw_agg[key]['pfs'].add(pf)
    kw_agg[key]['mts'].add(mt)

# === 按匹配方式汇总 ===
mt_agg = defaultdict(lambda: {'im':0,'cl':0,'sp':0,'sa':0,'od':0,'kc':0})
for kw_key, agg in kw_agg.items():
    kw, mt = kw_key.split('|||')
    mt_agg[mt]['im'] += agg['im']
    mt_agg[mt]['cl'] += agg['cl']
    mt_agg[mt]['sp'] += agg['sp']
    mt_agg[mt]['sa'] += agg['sa']
    mt_agg[mt]['od'] += agg['od']
    mt_agg[mt]['kc'] += 1

print('=== 按匹配方式汇总 ===')
print(f'{"匹配方式":10s} {"花费":>8s} {"销售额":>8s} {"ACoS":>6s} {"CPC":>6s} {"CTR":>6s} {"CVR":>6s} {"词数":>4s}')
print('-' * 65)
for mt, agg in sorted(mt_agg.items(), key=lambda x: -x[1]['sp']):
    acos = agg['sp']/agg['sa']*100 if agg['sa'] > 0 else 999
    cpc = agg['sp']/agg['cl'] if agg['cl'] > 0 else 0
    ctr = agg['cl']/agg['im']*100 if agg['im'] > 0 else 0
    cvr = agg['od']/agg['cl']*100 if agg['cl'] > 0 else 0
    print(f'{mt:10s} ${agg["sp"]:7.2f} ${agg["sa"]:7.2f} {acos:5.1f}% ${cpc:5.2f} {ctr:5.1f}% {cvr:5.1f}% {agg["kc"]:4d}')

print()

# === 按负责人(组合)汇总 ===
pf_agg = defaultdict(lambda: {'im':0,'cl':0,'sp':0,'sa':0,'od':0})
for r in target_rows:
    pf = dims['p'][r[5]]
    pf_agg[pf]['im'] += r[11]
    pf_agg[pf]['cl'] += r[12]
    pf_agg[pf]['sp'] += r[13]
    pf_agg[pf]['sa'] += r[14]
    pf_agg[pf]['od'] += r[15]

print('=== 按广告组合汇总 ===')
print(f'{"组合":20s} {"花费":>8s} {"销售额":>8s} {"ACoS":>6s} {"CPC":>6s} {"CTR":>6s} {"CVR":>6s}')
print('-' * 75)
for pf, agg in sorted(pf_agg.items(), key=lambda x: -x[1]['sp']):
    acos = agg['sp']/agg['sa']*100 if agg['sa'] > 0 else 999
    cpc = agg['sp']/agg['cl'] if agg['cl'] > 0 else 0
    ctr = agg['cl']/agg['im']*100 if agg['im'] > 0 else 0
    cvr = agg['od']/agg['cl']*100 if agg['cl'] > 0 else 0
    print(f'{pf:20s} ${agg["sp"]:7.2f} ${agg["sa"]:7.2f} {acos:5.1f}% ${cpc:5.2f} {ctr:5.1f}% {cvr:5.1f}%')

print()

# === 按关键词聚合 (跨匹配方式) ===
kw_only = defaultdict(lambda: {'im':0,'cl':0,'sp':0,'sa':0,'od':0,'mts':set()})
for r in target_rows:
    kw = dims['k'][r[7]]
    mt = dims['m'][r[8]]
    kw_only[kw]['im'] += r[11]
    kw_only[kw]['cl'] += r[12]
    kw_only[kw]['sp'] += r[13]
    kw_only[kw]['sa'] += r[14]
    kw_only[kw]['od'] += r[15]
    kw_only[kw]['mts'].add(mt)

# 有销售的词
kw_sales = {k:v for k,v in kw_only.items() if v['sa'] > 0}
# 无销售的浪费词
kw_waste = {k:v for k,v in kw_only.items() if v['sa'] == 0 and v['sp'] > 0}

print(f'=== 关键词分析 ===')
print(f'总词数: {len(kw_only)}, 有销售: {len(kw_sales)}, 无销售: {len(kw_waste)}')
print()

print('--- 优质词 (ACoS <= 30%, 销售额 > 0) ---')
print(f'{"关键词":35s} {"花费":>8s} {"销售额":>8s} {"ACoS":>6s} {"CPC":>6s} {"CVR":>6s} {"匹配":>10s}')
print('-' * 95)
for kw, agg in sorted(kw_sales.items(), key=lambda x: x[1]['sp']/x[1]['sa']):
    acos = agg['sp']/agg['sa']*100
    if acos > 30:
        continue
    cpc = agg['sp']/agg['cl'] if agg['cl']>0 else 0
    cvr = agg['od']/agg['cl']*100 if agg['cl']>0 else 0
    mts = ','.join(sorted(agg['mts']))
    print(f'{kw[:35]:35s} ${agg["sp"]:7.2f} ${agg["sa"]:7.2f} {acos:5.1f}% ${cpc:5.2f} {cvr:5.1f}% {mts:>10s}')

print()
print('--- 浪费词 Top15 (有花费无销售) ---')
print(f'{"关键词":35s} {"花费":>8s} {"点击":>6s} {"曝光":>8s} {"CPC":>6s} {"匹配":>10s}')
print('-' * 85)
for kw, agg in sorted(kw_waste.items(), key=lambda x: -x[1]['sp'])[:15]:
    cpc = agg['sp']/agg['cl'] if agg['cl']>0 else 0
    mts = ','.join(sorted(agg['mts']))
    print(f'{kw[:35]:35s} ${agg["sp"]:7.2f} {agg["cl"]:5d} {agg["im"]:8d} ${cpc:5.2f} {mts:>10s}')

print()
print('--- 高ACoS词 Top15 (ACoS > 30%, 有销售) ---')
print(f'{"关键词":35s} {"花费":>8s} {"销售额":>8s} {"ACoS":>6s} {"CVR":>6s} {"匹配":>10s}')
print('-' * 90)
for kw, agg in sorted(kw_sales.items(), key=lambda x: -(x[1]['sp']/x[1]['sa'])):
    acos = agg['sp']/agg['sa']*100
    if acos <= 30:
        continue
    cvr = agg['od']/agg['cl']*100 if agg['cl']>0 else 0
    mts = ','.join(sorted(agg['mts']))
    print(f'{kw[:35]:35s} ${agg["sp"]:7.2f} ${agg["sa"]:7.2f} {acos:5.1f}% {cvr:5.1f}% {mts:>10s}')
