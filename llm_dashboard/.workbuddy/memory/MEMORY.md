# 跨境电商广告数据看板 - 稳定模板

## 看板架构（最终版 v20260729）

```
dashboard/
├── index.html          # 广告数据看板 (8个板块)
├── target.html         # 目标达成看板 (5个模块)
├── assets/
│   ├── common.css      # 公共样式 (含预警条/风险标签)
│   ├── common.js       # 公共组件 (筛选器/图表工厂)
│   ├── ads.js          # 广告看板业务逻辑 (renderAll → 各板块)
│   ├── target.js       # 目标看板业务逻辑
│   └── echarts.min.js  # ECharts 5 图表库
└── data/
    ├── kw_data.js      # 关键词日数据源 (window.KW_DATA)
    └── tg_data.js      # 目标/销售日数据源 (window.TG_DATA)
```

## 数据更新方式
- 修改Excel后运行 `python scripts/process_data.py` 重新生成 `kw_data.js` + `tg_data.js`
- 数据格式：`window.KW_DATA = { dims: { d:[...], o:[...], s:[...], c:[...], g:[...], p:[...], a:[...], k:[...], m:[...], t:[...], st:[...] }, rows: [[...], ...] }`
- rows 每行17个值：[日期索引, 负责人索引, 店铺索引, 国家索引, 类目索引, 组合索引, 活动索引, 关键词索引, 匹配索引, 类型索引, 有效状态索引, 曝光, 点击, 花费, 销售额, 订单, un]
- **v20260729改动**: 金额已是美元无需汇率转换；新增有效状态(st)维度和筛选器
- **v20260817改动**: 板块六新增广告活动筛选器(msCampaign, 局部筛选) + 关键词表按广告活动名分组排序(先取Top20再按活动名分组)
- **v20260819改动**: 数据更新至 2026-08-17，版本号 v20260819d1
- **v20260821改动**: 关键词库&否词库点击关键词行同时复制到剪贴板(kw-name class + copy-flag)；数据更新至 2026-08-19，版本号 v20260821d1；日期范围 2026-06-01 ~ 08-19
- **v20260821改动(UI)**: 新增板块七「各类目星期表现对比」(类目×星期热力表 + 6指标分段控件 + 预算分配建议)；有效状态筛选从顶部筛选栏迁移至板块六卡片旁(标注"全局")；板块五匹配方式增加CVR；原板块七优化建议重编号为板块八。本次纯 UI 改动，数据文件未变，未 bump 版本号(需强制刷新浏览器)

## 板块清单
1. 板块一：整体表现 (KPI卡片 + 国家ACoS + 趋势图 + 负责人表)
2. 板块二：店铺/国家对比
3. 板块三：类目CVR/CPC/ACoS趋势与预警 (2026-07-28新增)
4. 板块四：广告类型对比
5. 板块五：匹配方式分析 (2026-08-21 图表+表格新增 CVR 转化率列)
6. 板块六：关键词优化 (浪费词/高ACoS/优质词 Top20, 按广告活动分组排列 + 广告活动筛选器 2026-08-17新增；2026-08-21 板块六卡片内新增"有效状态"全局筛选，从顶部筛选栏迁移而来)
7. 板块七：各类目星期表现对比 (2026-08-21新增：类目×星期 热力表 + 指标分段控件[花费/广告订单/CTR/CPC/CVR/ACoS] + 预算分配建议[效率排名/再平衡/周末vs工作日])
8. 板块八：优化建议与行动措施 (原板块七重编号)

## 目标达成看板模块清单
1. 模块一：目标总览 (KPI + 仪表盘 + 排名)
2. 模块二：月度趋势 + 类目完成率
3. 模块三：近14天日度变动 + 近4周周度变动 (2026-07-29新增)
4. 模块四：目标差距归因
5. 模块五：改进建议

## GitHub Pages 部署与远程核查（重要）
- 仓库 `finefinenocarrots/llm_workspace` 已开启 Pages（Settings→Pages→Source="GitHub Actions"）。8/3 部署成功已验证站点可用。
- 部署链路：`git push origin main` → 命中 `llm_dashboard/dashboard/**` → 触发 `.github/workflows/deploy-pages.yml` → upload-pages-artifact → deploy-pages。
- ⚠️ deploy-pages@v4 不稳定：可能 >10 分钟仍 in_progress，也可能约 10 分钟后转 **failure**（部署服务侧瞬时故障，非配置问题）。若 upload 成功而 deploy 失败，直接去 Actions 页面 Re-run all jobs 即可，无需改代码。
- 远程核查方法（无需 gh/登录，公开仓库匿名可读 GitHub API）：
  - 工作流运行：`/actions/runs?per_page=5` 看最新 run 的 status/conclusion
  - 部署状态：`/deployments?per_page=3` 取最新 deployment id → `/deployments/<id>/statuses` 看最新 state（success/failure/in_progress）
  - job 明细：`/actions/runs/<run_id>/jobs` 看哪一步失败
  - job 原始日志：`/actions/jobs/<job_id>/logs` 需 admin 权限，匿名返回 403
- ⚠️ WebFetch 对同一 URL 有 ~15 分钟缓存！重复查同一 URL 会返回旧结果，误判"一直 in_progress"。务必加 `?fresh=2` / `?t=时间戳` 等查询参数绕过（GitHub API 忽略未知参数）。
- 区分"推送成功"与"部署成功"：远端 `origin/main` SHA == 本地最新 commit（用 `git rev-list --left-right --count origin/main...HEAD` 看 0/0）即推送成功；部署成功看 deployment state==success 且线上板块一日期范围已更新。
- 核查顺序：先用 API 确认 deployment 最终 state（success/failure），再据结论行动；不要只凭"in_progress"下乐观结论。

## ⚠️ 本环境推送 GitHub 必须用 SSH（2026-08-14 实测）
- **现象**：本沙箱环境 `github.com:443` 的 HTTPS git 连接被防火墙拦截（`Failed to connect to github.com:443` / `Recv failure: Connection was reset`，连试 7 次均失败）；但 `api.github.com`、`codeload.github.com` 可达，`ssh -T git@github.com` 能成功认证。
- **解决**：推送前临时切 SSH：`git remote set-url origin git@github.com:finefinenocarrots/llm_workspace.git`，`git push origin main` 成功，完事再 `git remote set-url origin https://github.com/finefinenocarrots/llm_workspace.git` 还原 HTTPS（尊重用户原配置）。
- **澄清：本仓库未真正启用 Git LFS**——无 `.gitattributes`，`git cat-file` 显示 kw_data.js 是完整 3.3MB blob（非 pointer）。之前 `git config filter.lfs.smudge` 有值只是全局 git-lfs 安装残留，未作用于任何文件。故数据文件随 SSH push 直接传全量，无 LFS 上传隐患（无需折腾 `git lfs push`）。

## 线上站点 URL（Pages 部署在仓库根，非 llm_dashboard/dashboard 子路径）
- 站点根：`https://finefinenocarrots.github.io/llm_workspace/`
- 广告看板：`https://finefinenocarrots.github.io/llm_workspace/index.html`
- 目标看板：`https://finefinenocarrots.github.io/llm_workspace/target.html`
- 关键词库：`https://finefinenocarrots.github.io/llm_workspace/keywords.html`
- 数据文件：`https://finefinenocarrots.github.io/llm_workspace/data/kw_data.js`（注意是根下 `data/`，不是 `llm_dashboard/dashboard/data/`）
