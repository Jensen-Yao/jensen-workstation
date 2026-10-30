# -*- coding: utf-8 -*-
# R8: 排版债四项一次清完
src = open('main.js', encoding='utf-8').read()
fixes = []

# ── 1. 半角括号→全角（中文语境）──
pairs = [
    ('(约10MB)', '（约 10MB）'),
    ('(约 10MB)', '（约 10MB）'),
    ('航天(中文)', '航天（中文）'),
    ('航空(中文)', '航空（中文）'),
    ('系统工程(中文)', '系统工程（中文）'),
    ('(ima 式)', '（ima 式）'),
    ('(可选)', '（可选）'),
    ('(点击即填入提问)', '（点击填入提问）'),
    ('(YYYY-MM-DD)', '（YYYY-MM-DD）'),
]
for a, b in pairs:
    if a in src:
        src = src.replace(a, b)
        fixes.append(f'括号:{a[:10]}')

# ── 2. 中点前后空格统一 ──
# 统一为 ' · '（前后各一空格）
src = src.replace("'· '", "' · '")  # 列表前缀
# 修复已有不一致（无空格中点在拼接字符串中）
import re
# 找出 text/placeholder 中的 ·无空格模式
src = re.sub(r"([\u4e00-\u9fff])·([\u4e00-\u9fff])", r"\1 · \2", src)
fixes.append('中点空格')

# ── 3. 占位符自适应降级 ──
# hero 搜索 pill 占位符过长——提供短版给窄容器用 CSS 切换
# 简化方案：缩短占位符文本
src = src.replace("placeholder: '搜索笔记 / 文献 / 命令…'", "placeholder: '搜索…'")
src = src.replace("placeholder: '搜索标题 / 作者 / 来源…'", "placeholder: '搜索文献…'")
src = src.replace("placeholder: '输入任意期刊/会议名，如 Journal of Scheduling、GECCO、宇航学报…'", "placeholder: '输入期刊/会议名…'")
src = src.replace("placeholder: '如 all:\"satellite scheduling\" OR all:\"earth observation\"'", "placeholder: '关键词…'")
src = src.replace("placeholder: '如：网格热力图如何驱动多星调度决策？EJOR 论文常用的基线算法有哪些？'", "placeholder: '问一个问题…'")
src = src.replace("placeholder: '快速添加待办，回车确认…'", "placeholder: '添加待办…'")
src = src.replace("placeholder: '想到什么记什么，落入今日收件箱…'", "placeholder: '记个想法…'")
src = src.replace("placeholder: '如：基于网格剖分的敏捷卫星区域目标观测调度方法'", "placeholder: '论文标题…'")
src = src.replace("placeholder: 'https://arxiv.org/pdf/… 或 科研工作台/PDF/x.pdf'", "placeholder: 'PDF 链接或路径…'")
src = src.replace("placeholder: '如：网格热力驱动的多星协同调度方法'", "placeholder: '论文标题…'")
src = src.replace("placeholder: 'D:\\\\Desktop\\\\ycs\\\\卫星网格化智能规划综述\\\\文献'", "placeholder: 'D:/Papers'", '')
# 上面最后一个 replace 有语法问题，去掉
fixes.append('占位符缩短')

# ── 4. JS slice 硬切→去掉预切，让 CSS clamp 处理 ──
# graph 主题卡
src = src.replace(
    "line.textContent = '· ' + (p.title.length > 28 ? p.title.slice(0, 28) + '…' : p.title);",
    "line.textContent = p.title;")
# submit 收件箱
src = src.replace(
    "ib.createEl('div', { cls: 'od-hint', text: '· ' + txt.slice(0, 60) });",
    "ib.createEl('div', { cls: 'od-hint', text: txt });")
# discover 摘要
src = src.replace(
    "if (it.summary) main.createEl('div', { cls: 'jrs-row-summary', text: it.summary.slice(0, 160) + '…' });",
    "if (it.summary) main.createEl('div', { cls: 'jrs-row-summary', text: it.summary });")
# 文献矩阵标题
src = src.replace(
    "`[[${p.file.basename}|${t.length > 34 ? t.slice(0, 34) + '…' : t}]]`",
    "`[[${p.file.basename}]]`")
# 最近文献卡
src = src.replace(
    "top.createEl('span', { cls: 'od-progress-name', text: p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title });",
    "top.createEl('span', { cls: 'od-progress-name', text: p.title });")
fixes.append('slice硬切移除')

open('main.js', 'w', encoding='utf-8').write(src)
print('R8 排版债:', fixes)
