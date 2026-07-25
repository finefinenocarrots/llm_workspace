import pandas as pd

path = r"D:\workspace\llm_dashboard\resource\关键词报告-每日明细.xlsx"
xl = pd.ExcelFile(path)
print("SHEETS:", xl.sheet_names)
print("=" * 60)

for sh in xl.sheet_names:
    df = pd.read_excel(path, sheet_name=sh, nrows=5)
    print(f"\n### SHEET: {sh}  shape(head)={df.shape}")
    print("COLUMNS:", list(df.columns))
    print(df.head(5).to_string())
    print("-" * 60)

# Full 汇率 sheet
for sh in xl.sheet_names:
    if "汇率" in sh or "rate" in sh.lower() or "fx" in sh.lower():
        df = pd.read_excel(path, sheet_name=sh)
        print(f"\n=== FULL FX SHEET: {sh} ===")
        print(df.to_string())

# Country distinct values in sheet1
df1 = pd.read_excel(path, sheet_name=xl.sheet_names[0])
print("\n=== sheet1 columns ===")
print(list(df1.columns))
for c in df1.columns:
    if "国家" in str(c) or "站点" in str(c) or "country" in str(c).lower():
        print(f"\n国家列 [{c}] distinct:", df1[c].dropna().unique().tolist())
