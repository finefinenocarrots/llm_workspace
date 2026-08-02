---
name: update-dashboard-data
description: 更新跨境电商广告数据看板与目标达成看板的前端数据。当用户在 resource/ 目录下追加或修改《关键词报告-每日明细.xlsx》《广告目标达成进度.xlsx》两个 Excel 后，用本技能重新生成 dashboard/data/kw_data.js 与 tg_data.js 并刷新浏览器缓存版本号。This skill should be used when the user says things like "更新看板数据""重新生成数据""表格更新了，刷新看板""跑了下数据处理脚本" or updates the two source Excel files.
agent_created: true
---

# 看板数据更新技能

## 目的

两个看板的前端数据来自两个 Excel，经 `scripts/process_data.py` 处理后导出为前端直接加载的
JS 数据文件。本技能描述「源表追加/修改行 → 重新生成数据 → 破除浏览器缓存」的完整闭环，
让任何一次数据更新都能被正确、可复现地同步到看板上。

数据流：
```
resource/关键词报告-每日明细.xlsx  ─┐
                                   ├─► scripts/process_data.py ─► dashboard/data/kw_data.js  (广告数据看板)
resource/广告目标达成进度.xlsx     ─┘                              dashboard/data/tg_data.js  (目标达成看板)
```
前端 `dashboard/index.html`、`dashboard/target.html` 通过 `<script src="data/*.js?v=...">` 加载，
`?v=版本号` 用于强刷缓存——**数据变更后必须升版本号，否则浏览器仍读旧缓存。**

## 何时使用

- 用户在 `resource/` 下追加了新日期/新店铺/新类目的行（最常见的场景）。
- 用户修改了历史行的数值。
- 用户新增了国家（需在汇率表中登记）。
- 用户说「更新看板」「重新生成数据」「刷新数据」「跑了处理脚本」等。

## 标准流程（务必按序执行）

### 1. 确认源表已更新且结构正确
检查两个 Excel 的 sheet 名与列名是否仍与 `references/schema.md` 一致。重点确认：
- `关键词报告-每日明细.xlsx` 仍存在 `sheet1` 与 `汇率` 两个 sheet。
- `汇率` sheet 覆盖所有出现过的「国家」（含新增国家），否则脚本会 `ValueError` 中断。
- `广告目标达成进度.xlsx` 存在 `产品表现数据源`、`每月销售目标`、`list-info` 三个 sheet。
- 不要改列名；只应「追加行」，不要改变既有列顺序。

### 2. 运行数据处理脚本重新生成数据
使用隔离 Python 环境（含 pandas / openpyxl）：

```bash
cd D:/workspace/llm_dashboard
C:/Users/fang_hu/.workbuddy/binaries/python/envs/default/Scripts/python.exe scripts/process_data.py
```

正常输出会打印每个数据文件的 size、行数、日期范围，最后打印 `done.`。
脚本内 `BASE` 已硬编码为 `D:\workspace\llm_dashboard`，无需传参。

### 3. 校验生成结果
确认：
- `dashboard/data/kw_data.js`（约 570KB）与 `dashboard/data/tg_data.js`（约 430KB）已更新（看文件修改时间）。
- 终端无 `ValueError`/异常；若报「以下国家在汇率表中缺失」→ 回到第 1 步补 `汇率` sheet 后重跑。

### 4. 升缓存版本号（必须）
运行版本号脚本，它会把 `index.html`、`target.html` 中所有 `?v=...` 引用统一替换为
`YYYYMMDDdN` 格式的新版本，强制浏览器重新拉取数据：

```bash
cd D:/workspace/llm_dashboard
C:/Users/fang_hu/.workbuddy/binaries/python/envs/default/Scripts/python.exe scripts/bump_data_version.py
```

脚本输出形如 `index.html: 替换 3 处引用 -> ?v=20260726d1`，确认两个 HTML 都有替换记录。

> 注意：切勿手动改版本号字符串而跳过本脚本，否则可能遗漏某个资源引用导致部分文件仍走缓存。

### 5. （推荐）无头浏览器回归验证
确保本地静态服务在 `dashboard/` 目录运行（如未运行：
`cd D:/workspace/llm_dashboard/dashboard && python -m http.server 8770`），然后：

```bash
CHS=$(find /c/Users/fang_hu -iname "chrome-headless-shell.exe" | head -1)
cd D:/workspace/llm_dashboard
BASE_URL=http://localhost:8770 CHROME_PATH="$CHS" \
NODE_PATH=C:/Users/fang_hu/.workbuddy/binaries/node/workspace/node_modules \
C:/Users/fang_hu/.workbuddy/binaries/node/versions/22.22.2/node.exe scripts/verify_pages.js
```

期望：`console errors: NONE`，且 kpi cards / canvas 数量正常（index 应有 4 KPI + 6 canvas；
target 应有 8 KPI + 6 canvas）。

### 6. 向用户汇报
简洁告知：数据已基于哪个日期范围重新生成、新版本号是多少、验证是否通过、本地访问地址
（http://localhost:8770/index.html 与 http://localhost:8770/target.html）。提醒用户**强制刷新浏览器**
（Ctrl/Cmd+Shift+R）以加载新 `?v=`。

### 7. Git 提交并推送（main 分支）
数据更新与缓存刷新完成后，把本次变更提交并推送到 `main` 分支的远端。
仓库根目录为 `D:\workspace`（看板位于 `llm_dashboard/` 子目录，已被该仓库跟踪；远端名为 `origin`，当前分支即 `main`）。

```bash
cd D:/workspace
git checkout main
git add .
git commit -m "chore(dashboard): 更新看板数据，版本 v{YYYYMMDDdN}"
git push origin main
```

- 提交信息里的版本号用步骤 4 生成的新版本号（`?v=...`）填充，方便回溯；
  若本次还涉及数据范围变化，可追加日期区间，例如 `数据区间 06-30~08-02`。
- `git add .` 在仓库根目录执行，会暂存本次所有改动（含 `dashboard/data/*.js`、
  `dashboard/*.html` 的版本号改动）。推送前可先 `git status` 确认只暂存了预期文件，
  避免误带无关改动（本 skill 的修改也会一并被暂存，属正常）。
- `git push origin main` 需要网络访问。若执行环境的沙箱拦截了网络，需以「退出沙箱 /
  允许网络」的方式运行该命令（否则会连接失败）。

> 注意：本步骤会直接写入远端 `main` 分支。只应在步骤 5 验证通过后执行；
> 若验证失败或数据异常，先不要 push，回到前面步骤排查。

## 常见坑位

- **新增国家必填汇率**：`汇率` sheet 的「国家」列必须包含 `sheet1` 中出现的所有国家中文名，
  否则 Part1 会 `raise ValueError`。汇率换算公式 `usd = local × 美元`，US=1.0。
- **目标数据日期下限**：`process_data.py` 对「产品表现数据源」做了 `日期 >= '2026-03-01'` 过滤，
  早于该日的行会被静默丢弃。若需纳入更早数据，改脚本里的该过滤条件。
- **比率列不随汇率变**：ACoS/ROAS/CVR/CTR 为比率，不做汇率换算；只有金额类本币列换算成美元。
- **维度自动扩展**：新增的负责人/店铺/类目/国家/广告组合值会自动编入 `dims` 字典，无需改前端代码。
- **删除列是安全的（仅限可选金额列）**：`process_data.py` 对 sheet1 的「金额类本币列」做了
  `if c in df.columns` 容错——删除其中任意一列（如 `间接销售额-本币`）会自动跳过、不报错。
  仅 `花费-本币`、`广告销售额-本币` 进入前端输出，其余金额列非必需。但**必需列不可删**
  （`日期`/`曝光量`/`点击`/`花费-本币`/`广告销售额-本币`/`广告订单`/`广告销量` 及各维度列），
  删除会 KeyError 中断。删列后照常跑流程即可，无需改脚本（除非要从容错列表里移除该列名，见下条）。
- **同步脚本与文档**：删除某列后，建议把该列名从 `process_data.py` 的 `local_money_cols` 列表、
  以及 `references/schema.md` 的列清单中移除，保持三者一致；缺失的列名留着也不会报错（有容错），
  但移除更干净、避免误导。
- **缓存是唯一「看不见的坑」**：数据已变但页面不变，99% 是缓存——务必执行第 4 步并让用户强刷。

## 相关文件

- `scripts/process_data.py` —— 数据处理主脚本（读 Excel → 写 JS 数据文件）。详见 `references/schema.md`。
- `scripts/bump_data_version.py` —— 缓存版本号递增脚本（步骤 4）。
- `scripts/verify_pages.js` —— 无头浏览器验证（步骤 5）。
- `dashboard/data/kw_data.js` / `tg_data.js` —— 生成产物（前端直接依赖）。
- `dashboard/index.html` / `dashboard/target.html` —— 前端页面（含 `?v=` 引用）。
