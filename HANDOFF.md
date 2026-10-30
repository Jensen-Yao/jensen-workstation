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
