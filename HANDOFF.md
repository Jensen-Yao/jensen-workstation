# v0.22.0 交接补充 · 2026-10-30

最新说明见 [CHANGES-v0.22.md](CHANGES-v0.22.md)。已部署当前库与共享母版，保留用户设置。

- 页面工作区代码在 `src/section-workspace.js`，样式在 `src/sections.css`；均由 build 嵌入发行文件。Dashboard 路由的 queue/reader/graph/discover 使用 SectionWorkspace，其余页面在原有真实数据功能上增强。
- AI 发现的 `discoveryTags` 为 `{label, query}` 数组；保存和点击仅填入查询，不自动联网。`journalDensity` 默认 compact；目标期刊详细说明折叠。
- 投稿在三视图内部切换，期刊目录不再与管线堆叠。`SectionWorkspace.metadata` 等待文件缓存刷新，避免状态写入后显示旧列。
- 章节任务保存后同步更新 task.raw/task.done，避免第二次勾选被过期检测拒绝。保留展开状态与局部统计。
- 设置使用 Obsidian 自带独立窗口（CDP URL about:blank），通过 activeTab.containerEl 访问；主窗口 document 查不到设置内容。截图工具使用对应目标。
- 总览研究桌面可折叠；长卡片内容在卡内滚动。不要移回原生左右栏已有功能。
- 检查共 72 项通过。截图在 screenshots/v022。工具 verify-v020 继续验证现有 PDF/侧栏流程；verify-v022 检查新增页面交互。
- 发布整理：历次一次性补丁、旧 QA jobs 和旧截图已从当前工作树清退；保留当前测试和构建工具，见 [tools/README.md](tools/README.md)。下方 v0.19 工具表仅是历史档案，不代表当前可执行工具集。日志、运行报告、私有备份均不进入发布内容。
- 本地备份归档根目录为 `F:/OrbitDesk-archive/v0.22.0-20261030/`；先前 `.jrs-tmp/backups/` 中的备份在该目录的 `generated-before-validation/.jrs-tmp/backups/`。下方历史路径是清理前位置。

---

# v0.21.0 交接补充 · 2026-10-30

最新变更见 [CHANGES-v0.21.md](CHANGES-v0.21.md)。下方保留 v0.20 和 v0.19 的历史上下文。

- PDF 原生 eventBus 的 pagechanging/scalechanging 由 `PdfResearch.trackReaders()` 订阅；换文件和卸载时解绑。`pdfReadingPositions` 保存页码/缩放，独立于 reading_progress。
- `openReading(paper)` 默认打开 PDF 标签页；只有明确的「分栏阅读」入口传 `{ split: true }`。3D/列表卡片、文献库标题和队列普通点击直达 PDF。无 PDF 时退回笔记。
- 普通阅读收起同次会话创建、未被用户改作他用且未固定的阅读分栏。`smartOpenFile` 同时检查标签组、固定状态与保存的文件路径；不要覆盖用户后来切换的文件。`revealLeaf` 必须 await，并正确恢复/设置 activeLeaf，避免视觉页面与实际文件打开目标不一致。
- `openReading`、`openPdf` 与 `readText` 保留已存位置。不要让后台 AI 读取把书签重置到第一页。
- 批注操作按 PDF 排队；`update` 检查过期编辑，`remove/undoDelete` 仅修改对应 Markdown 标记块。保留用户其他手写内容。
- `SidePanelView` 在同次会话缓存选区草稿和译文；旧请求完成不能清除新选区。PDF 页码事件只更新控件，不整体重绘输入区。
- 3D 阅读台增加筛选和完整标题；可见卡片最多七张，空队列禁用不适用按钮。明确选中的卡片不能被旧 PDF 上下文覆盖。
- 右栏重复品牌标题/计时器已移除；用户要求的原生左栏、单一右栏入口和网页实例保留规则不变。
- 当前检查：27 项 Node、23 项实机，以及九主区/四助手模式检查。验证工具文件名仍沿用 v020。截图命令 `node tools/capture-v020.mjs v021`。
- v0.20 更新前程序与设置备份：`F:/OrbitDesk/.jrs-tmp/backups/v020-before-v021-20261030-184348/`。

---

# v0.20.0 交接补充 · 2026-10-30

下方 v0.19 交接内容保留为历史上下文。当前实现、用户确认的边界与检查结果以 [CHANGES-v0.20.md](CHANGES-v0.20.md) 为准，视觉规则见 [DESIGN.md](DESIGN.md)。

## 用户最新要求与实现

- 参考图的重点是玻璃卡片、透视/3D 卡组和层次，不只是绿色强调色。首页已实现真实文献卡组与右侧联动。
- 「左边栏」指 Obsidian 原生左停靠栏。日历、番茄钟、喝水/休息、健身打卡在 `LifePanelView`，不要重新塞回内部导航栏。
- 右栏的助手和网页必须在同一个原生按钮内。`SidePanelView` 内部隐藏/显示网页，不销毁 webview。DeepSeek 在这里打开，用户自行登录。
- 文献来自 `settings.sourceFolder`，递归扫描实际 PDF，关联既有笔记、去重。当前目录 28 PDF 与旧索引 44 笔记口径不同，界面必须显示来源。
- 用户对小字号、低对比文字、假按钮敏感。已加入直接明暗切换，普通说明与操作至少 12px；逐项实机验证。
- PDF 选区、页面坐标、高亮、批注、翻译预览和 Markdown 保存已实现。摘要/导读读取真实 PDF 前 8 页（上限 18000 字符），无原文且笔记为空则拒绝生成。插件高亮不修改 PDF 二进制，不能宣传为可在其他阅读器查看的内嵌批注。

## 源码组织与构建

| 源码 | 用途 |
| --- | --- |
| `src/core.cjs` | 检索语法、状态不变量、布局排布、CSV/BibTeX；可直接 Node 测试 |
| `src/library-panel.js` | 文献库工作流、来源、筛选、批量操作与分页 |
| `src/side-panel.js` | 同一个右栏里的文献、批注、写作、工具与网页模式 |
| `src/research-browser.js` | 独立 webview 部件，持久化分区 `persist:jensen-research` |
| `src/pdf-research.js` | 真实选区捕获、坐标归一化、高亮恢复与批注 Markdown |
| `src/productivity.js` | 原生左栏、月历、日常记录、温和提醒 |
| `src/reading-deck.js` | 透视文献卡组与队列/助手联动 |
| `src/workspace.css` | 新设计系统、明暗主题、阅读台、原生侧栏和响应式 |

编辑 `src/` 后运行 `node tools/build.mjs`，会替换发布文件的 `BEGIN GENERATED` 区域。不要直接编辑生成区。main.js 中其他插件数据方法目前仍直接维护。运行时仍只需 main.js、styles.css、manifest.json 三个文件。

## 验证与部署

```powershell
node tools/build.mjs
node --check main.js
node --test tests/core.test.cjs
node tools/verify-v020.mjs
node tools/check-surfaces.mjs
```

CDP 使用 9223。集成检查写入独立临时目录并在 finally 恢复设置，翻译测试用受控响应；已有一次真实 API 小样翻译成功。见 `.jrs-tmp/verification.json`、`.jrs-tmp/surfaces.json`。

部署目录仍为 `F:/ObWork/Study/.obsidian/plugins/jensen-workstation/` 与中央母版 `F:/ObWork/.shared-plugins/jensen-workstation/`。不要复制 data.json 或覆盖用户笔记。旧程序及 data/workspace 备份在 `F:/OrbitDesk/.jrs-tmp/backups/20261030-173607/`。

尚需注意：PDF 原生视图内部 API 在未来 Obsidian 版本可能变化；扫描 PDF 需 OCR。AI 跨论文综述的旧 modal 关闭只停止自动打开，不取消 requestUrl 的在途请求。语义向量索引、Word/LaTeX 导出与自动 OCR 不属于本轮已实现功能。

---

## 以下为 v0.19 原始交接档案

# Jensen 科研工作站 · 开发交接文档

> **版本**: v0.19.0 | **日期**: 2026-10-30 | **状态**: 功能审计 A- / 视觉 6.5 / 建议上架
> **仓库**: https://github.com/Jensen-Yao/jensen-workstation
> **本文档目的**: 为下一个开发 agent 提供完整上下文，以便大力提升功能和重构美化 UI

---

## 一、项目概况

### 是什么
Obsidian 中文科研一体化工作台插件：卡片仪表盘 + 文献库 + AI 知识问答 + 期刊分区速查 + 投稿管线 + 番茄钟/日历。

### 核心数据
- **代码**: 单文件 `main.js`（~4000 行）+ `styles.css`（~2400 行），无构建步骤
- **体积**: main.js 260KB + styles.css 48KB + 内置期刊数据库 61KB（JOURNAL_BUILTIN 常量）
- **版本**: v0.19.0（15 个 Release，九轮双审 77+ 项修复）
- **许可**: MIT

### 用户研究背景
- 研究方向：卫星网格化智能任务规划（成像卫星/电磁探测卫星调度）
- 综述题目：《网格热力驱动的卫星任务规划方法研究进展综述》
- 目标期刊：EJOR（1区Top）、AST（1区）、INFORMS JoC（CCF-B）等
- 文献库：~44 篇（PDF 已入库，带 AI 摘要/方向标签/状态流）

---

## 二、环境信息

| 路径 | 说明 |
|---|---|
| `F:\OrbitDesk\` | 开发工作区（源码 + 工具脚本 + 截图） |
| `F:\OrbitDesk\main.js` | 插件源码（直接部署，无构建） |
| `F:\OrbitDesk\styles.css` | 样式文件 |
| `F:\OrbitDesk\manifest.json` | 插件清单 |
| `F:\ObWork\Study\` | 主力 vault（用户日常使用） |
| `F:\ObWork\Study\.obsidian\plugins\jensen-workstation\` | 部署位置（改完 cp 过去） |
| `F:\ObWork\.shared-plugins\` | 中央母版（多库共享插件程序） |
| `F:\ObWork\新建科研库.bat` | 一键创建新论文项目 vault |
| `F:\ObWork\同步插件更新.bat` | 一键同步插件到所有 vault |
| `F:\OBmd` → 已改名 `F:\ObWork\ObWorkTest` | 旧库备份（6 个插件完整） |

### 部署流程
```bash
cd F:/OrbitDesk
node --check main.js                    # 语法检查
cp main.js manifest.json styles.css "F:/ObWork/Study/.obsidian/plugins/jensen-workstation/"
# 重启 Obsidian 或 Ctrl+P → Reload app
```

### CDP 调试
```bash
# 启动 Obsidian 带调试端口
"F:\Obsidian\Obsidian.exe" --remote-debugging-port=9223
# 快速执行 JS
node tools/eval.mjs "app.plugins.plugins['jensen-workstation'].getPapers().length"
# 执行多行脚本（先写到 tools/jobs/xxx.js 再运行）
node tools/run.mjs tools/jobs/xxx.js
# 截图
node tools/shot.mjs "output.jpg"
# 交互审计（自动点击所有按钮检测死链）
node tools/audit.mjs
```

### AI 配置
- 用户的 AI API: `https://api.agnes-ai.cn/v1` + `agnes-3.0-flash`（免费档有限流 429）
- 存储位置: 插件设置 → AI 助手（vault 内 data.json）

---

## 三、架构

### 视图层（DashboardView，main.js 中的核心类）

```
DashboardView (ItemView, VIEW_DASHBOARD = 'jrs-dashboard')
├── 左侧栏 (jrs-sidebar, 190px, 可折叠/隐藏)
│   ├── 品牌区 (jrs-brand)
│   ├── 9 个导航项 (jrs-nav-item)
│   └── 底部库统计 (jrs-sidebar-bottom)
├── Topbar (jrs-topbar, 非home区段显示)
│   ├── 标题 + 副标题
│   └── 全局搜索 omnibox (jrs-omnibox) + 主按钮
└── 主区 (jrs-main)
    └── 页面 (jrs-page)
        └── 9 个区段 (renderSection 路由)
```

### 9 个区段

| ID | 名称 | 功能 |
|---|---|---|
| home | 总览 | 居中 Hero + 自由拖拽卡片看板（自适应列数） |
| discover | AI 发现 | arXiv + Crossref 双源检索，结果标分区 |
| queue | 阅读队列 | 进行中/高优先待读/排队待读三组 |
| library | 文献库 | 搜索/筛选/排序 + 文献卡片（状态/优先级/评分） |
| graph | 论文图谱 | SVG 缩略预览 + Canvas 生成 |
| progress | 研究进展 | 综述大纲分章进度 + 研究问题 + AI 起草 |
| reader | 阅读笔记 | 分栏精读（笔记+PDF）+ AI 按钮 |
| submit | 投稿冲刺 | 期刊速查器 + 投稿管线 + 目标期刊表 |
| ask | 知识问答 | 基于文献库的 grounding 问答 + 引用 |

### 数据层

- **文献笔记**: `科研工作台/文献/*.md`（YAML frontmatter: title/authors/year/venue/status/priority/topics/rating/reading_progress/pdf/cas/ccf/cast_tier/added/summary）
- **综述大纲**: `科研工作台/综述大纲.md`（## 章节 + `- [ ]` 任务）
- **研究问题**: `科研工作台/研究问题/*.md`
- **投稿**: `科研工作台/投稿/*.md`
- **收件箱**: `科研工作台/收件箱/YYYY-MM-DD.md`
- **AI 问答日志**: `科研工作台/AI问答/YYYY-MM-DD.md`
- **Bases**: `科研工作台/Bases/*.base`（文献库/阅读队列）
- **图谱**: `科研工作台/论文图谱.canvas`
- **期刊缓存**: `科研工作台/期刊分区缓存.json`（中科院2025 21772刊 + 新锐2026 22299刊）

### 期刊分区体系（JOURNAL_BUILTIN + JOURNALS）

- `JOURNALS`: 17 本目标期刊（EJOR/OR/AST/TAES 等），含 cas/jcr/ccf/tier 字段
- `JOURNAL_BUILTIN`: CCF 2026 全表 680 条（含会议）+ 科协运筹与管理 56 条 + 科协航空航天 62 条 + 预警名单
- `zoneOf(venue)`: 精确/分词匹配 → 返回分区对象
- `lookupJournal(name)`: 全量查询（内置 + 缓存）

### AI 功能（均需 OpenAI 兼容 API）

| 功能 | 方法 | 说明 |
|---|---|---|
| 知识问答 | `aiAsk(q)` | 检索文献库 → grounding → 带 [n] 引用回答 |
| AI 摘要 | `aiSummarize(paper)` | 补全笔记四段结构 |
| 导读十问 | `aiGuide(paper)` | 10 个理解性问题+参考答案 |
| 元数据补全 | `aiMetadata(paper)` | AI 推断作者/年份/方向/优先级 |
| 跨论文综述 | `aiSynthesis(topic,n)` | 多篇文献综合分析 |
| 章节起草 | `aiDraftSection(name)` | 检索相关文献→初稿写回大纲 |
| 编辑器润色 | `aiEditSelection(ed,mode)` | 选中段落学术润色/扩写/精简 |

### 右侧工具栏（SidePanelView, VIEW_SIDE = 'jrs-sidepanel'）

迷你番茄钟（ring + 主引擎共享）+ 期刊速查 + 快速记想法

---

## 四、样式体系

### CSS 变量（用户可调，设置页外观工作室）

```css
--od-accent: #4c7def          /* 强调色（6色可选+自定义HEX） */
--od-accent-soft: rgba(...)    /* 强调色柔和版 */
--od-blur: 18px               /* 毛玻璃模糊量 */
--od-card-alpha: 70%          /* 卡片不透明度 */
--od-radius-l: 16px           /* 卡片圆角 */
--od-gap: 14px                /* 卡片间距 */
--od-bg-dim: 0.30             /* 背景暗化 */
```

### 关键 CSS 类名

| 前缀 | 用途 |
|---|---|
| `jrs-` | 应用壳层（sidebar/topbar/main/page/shell） |
| `od-` | 通用组件（btn/card/chip/status/stat/progress） |
| `jrs-card` | 区段内卡片容器 |
| `jrs-paper-row` | 文献行卡 |

### 响应式
- `@container (max-width: 720px)` → 侧栏隐藏（基于 .jrs-view container-type）
- `@container (max-width: 700px)` → 宽卡回退单列
- `computeMetrics()` 自适应列数：colW < 90px 时自动降列至保底 2 列

---

## 五、九轮双审修复档案（QA 历史）

以下是 77+ 项修复的完整清单，**新开发时勿引入同类问题**：

### R1（v0.12.0）—— 基础数据安全
- ✅ 路径归一化（反斜杠/尾斜杠/非法字符自动清洗）
- ✅ 图谱空库防护（不覆盖真实 canvas）
- ✅ 分区匹配精确化（废除子串匹配防误标）
- ✅ 日记 ENOENT 防护（ensureFolder + catch）
- ✅ PDF 打开失败提示
- ✅ 双回车锁（防双计费）
- ✅ 模态 try/catch（失败不卡死）
- ✅ 文献矩阵竖线转义

### R3（v0.14.0）—— CRITICAL 修复
- ✅ `appendAskLog` srcLine 未声明（AI 回答计费后蒸发）
- ✅ 4 处视图级 smartOpenFile 幽灵调用
- ✅ 期刊名冒号击穿 YAML frontmatter
- ✅ deadline NaN 防护
- ✅ CCF 首尾词误配修复
- ✅ 模糊量滑杆被 22px 硬编码覆盖
- ✅ 列数减少后 x 越界 clamp
- ✅ 图谱缩略 NaN viewBox
- ✅ 今日小结 ENOENT

### R5（v0.15.0）—— 看板可用性
- ✅ 自适应列数（380px 窄布局 94px→276px 卡片）
- ✅ 列数滑杆减列后越界卡自动重排
- ✅ 问答来源行防毒化
- ✅ 死代码 getInboxToday 激活为收件箱卡

### R7（v0.17.0）—— 性能与安全
- ✅ resize 监听器 70 次泄漏 → offref 单次注册
- ✅ window.confirm 原生阻塞 → 自研 Modal 异步确认
- ✅ Emoji 24 行清零
- ✅ @media → @container 断点

### R8（v0.18.0）—— P0 炸弹 + 排版
- ✅ `c.uid` → `x.uid`（自定义卡片功能全线崩溃）
- ✅ `!important` 移除（容器查询行卡堆叠恢复）
- ✅ 排版债四项清完（括号/中点/占位符/slice→clamp）

---

## 六、已知遗留问题（下一步可修）

| 级别 | 问题 | 位置 |
|---|---|---|
| P2 | graph 缩略图与头部统计口径不一致（canvas 快照 vs 实时数据） | renderGraph |
| P2 | reader 进度=100% 但状态=待读 的不变量矛盾 | renderReader |
| P2 | 文献库筛选 26 个 chip 全量平铺占半屏 | LibraryPanel.render |
| P2 | progress 全零空态无 CTA 按钮 | renderProgress |
| P2 | 侧栏与主页双番茄钟同屏（同引擎不同可视化） | SidePanelView |
| P3 | AI 综述取消只取消"打开"不中断 API 请求 | AiSynthesisModal |
| P3 | Bases 重建覆盖无备份 | generateBases |
| P3 | setupBoardObserver 的 registerEvent 堆积死引用 | setupBoardObserver |
| P3 | styles.css 有 4 个死 @container 块 | styles.css:2019 |

---

## 七、下一步开发建议（功能 + UI 重构）

### 功能提升方向

1. **语义检索升级**: 当前关键词打分 → embedding 向量检索（Smart Connections 式）
2. **写作助手面板**: 侧栏选区上下文 + 文献引用建议 + 段落续写
3. **协作导出**: 文献矩阵 → Excel/CSV，综述大纲 → LaTeX/Word
4. **期刊数据增强**: 接入 LetPub/JCR 实时影响因子
5. **每日定时摘要**: cron 式自动生成今日小结
6. **多项目支持**: 按论文项目切换文献库（project 字段已有）
7. **PDF 内嵌批注**: 对接 PDF++ 生态，批注自动回流文献笔记
8. **MinerU 深度集成**: 本地安装 → 一键解析 PDF → 全文写入笔记

### UI 重构方向

1. **设计系统**: 抽取完整 token 表（色/字/距/角/影），统一所有组件
2. **文献库重构**: 26 个筛选 chip → 可折叠分组 + 搜索式筛选（`status:阅读中 topic:网格`）
3. **看板拖拽升级**: 自由定位 → 磁吸网格 + 碰撞检测 + 自动填充
4. **暗色主题优化**: 独立暗色 token（非简单 invert），照片背景暗色 scrim 自适应
5. **移动端适配**: @container 断点全覆盖，触摸手势（滑动切换区段）
6. **动画体系**: 区段切换过渡 + 卡片入场 stagger + 番茄钟进度动画
7. **空态设计**: 每个区段定制插画 + 引导 CTA（非纯文字）

---

## 八、工具脚本清单

| 脚本 | 用途 |
|---|---|
| `tools/eval.mjs` | 快速执行 JS 表达式（CDP） |
| `tools/run.mjs` | 执行 jobs 文件（多行 async IIFE） |
| `tools/shot.mjs` | 截图（自动清浮层） |
| `tools/sections.mjs` | 9 区段依次截图 |
| `tools/audit.mjs` | 全站交互审计（自动点击+检测反应） |
| `tools/evidence.mjs` | 完整采证（截图+审计+哈希去重） |
| `tools/evidence4.mjs` | v4 采证（含 resize/宽leaf/真去重） |
| `tools/round.mjs` | 迭代循环（evidence/verify/release） |
| `tools/critic-prompts.md` | 双子代理批评提示词模板 |
| `tools/patch-*.py` | 历次修复补丁（可参考写法） |
| `tools/jobs/*.js` | 测试脚本（qa-*.js 为功能审计用） |

---

## 九、Git 工作流

```bash
cd F:/OrbitDesk
# 发布新版本
python -c "import json; m=json.load(open('manifest.json')); m['version']='0.X.0'; json.dump(m, open('manifest.json','w'), indent=2)"
git add -A && git commit -m "v0.X.0: description" && git push origin main
git tag v0.X.0 && git push origin v0.X.0
cp main.js manifest.json styles.css /tmp/
gh release create v0.X.0 --title "..." --notes "..." /tmp/main.js /tmp/manifest.json /tmp/styles.css
# 同步到所有 vault
cp main.js manifest.json styles.css "F:/ObWork/.shared-plugins/jensen-workstation/"
```

### Obsidian 官方 PR（待用户在浏览器创建）

链接: https://github.com/obsidianmd/obsidian-releases/compare/master...Jensen-Yao:add-jensen-workstation?expand=1

---

## 十、用户偏好速记

- 审美：喜欢简洁现代 + 毛玻璃 + 照片背景（7.jpg 毕业明信片）
- 中文优先，但学术内容需英文
- 讨厌假功能（点击无反应）
- 讨厌 UI 乱（对齐/间距/一致性要求高）
- AI API: agnes-3.0-flash（免费档限流 429，批量操作需退避重试）
- 密切关注中科院分区/CCF 分级（科研考核刚需）
- 目标投稿 EJOR 等顶刊，投稿管线是高频功能
