# L1 · 原始资料库（Raw Sources）

> **本层不可变：LLM 只读不写。** 这是信息源头，库主负责往里丢资料。

## 用途
存放一切原始素材：剪藏的网页文章、论文 / 行业报告、CSV / Excel / JSON 数据、文章配图。LLM 据此生成并维护 L2 知识库，但**绝不修改本层任何文件**。

## 目录
- `articles/` 剪藏网页文章（.md + 本地图片）
- `papers/` 论文 / 行业报告（PDF、md）
- `data/` 结构化数据（CSV / Excel / JSON）
- `images/` 文章图片本地下载存放处（Obsidian 附件也指向这里）

## 投放工作流（Obsidian Web Clipper）
1. 安装浏览器插件 **Obsidian Web Clipper**。
2. 新建 Clip 模板，目标 vault = 本仓库，保存到 `00-Raw-Sources/articles/{{date}}-{{title}}.md`。
3. 模板里把"下载图片到本地"打开，附件路径设为 `00-Raw-Sources/images/`（与 `.obsidian` 的 `attachmentFolderPath` 一致）。
4. 一键剪藏：文章正文转 md，图片全部落到 `images/`，**不依赖可能失效的外链** —— 这样 LLM 能直接读图。
5. 回仓库告诉 LLM："处理刚加的 `articles/xxx.md`"，它会走 L3（CLAUDE.md）的 Processing 流水线。

## 原则
- **只增不改**：资料一旦入仓就别手改；需要修正请在 L2 标注，或在 L1 追加新版本并让 LLM 标冲突。
- 命名：`{{date}}-{{标题}}.md`，标题用原文关键短词。

## 相关
- [[CLAUDE]]（L3 规则，定义本层职责与处理流水线）
- [[首页]]（L2 总入口）
