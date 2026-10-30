# -*- coding: utf-8 -*-
# Round4 安全修复：reader空态 / 侧栏按钮 / 截图管线 / 省略号精准替换
src = open('main.js', encoding='utf-8').read()
fixes = []

# ── 1. Reader 空态矛盾 ──
old = """    const intro = page.createEl('section', { cls: 'jrs-card' });
    const head = intro.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '选择一篇论文开始精读' });
    head.createSpan({ text: '点击标题 → 笔记 + PDF 分栏打开；AI 按钮生成摘要 / 导读十问' });
    if (!papers.length) { intro.createEl('div', { cls: 'od-task-empty', text: '文献库为空或都已读完，去「AI 发现」找新论文' }); return; }"""
new = """    const intro = page.createEl('section', { cls: 'jrs-card' });
    const head = intro.createEl('div', { cls: 'jrs-section-heading' });
    if (!papers.length) {
      head.createEl('h2', { text: '选择一篇论文开始精读' });
      intro.createEl('div', { cls: 'od-task-empty', text: '文献库为空或都已读完，去「AI 发现」找新论文' });
      return;
    }
    head.createEl('h2', { text: '继续精读' });
    head.createSpan({ text: `进行中 ${papers.filter((p) => p.status === '阅读中').length} 篇 · 共 ${papers.length} 篇可选` });"""
assert old in src, 'reader'
src = src.replace(old, new); fixes.append('reader空态')

# ── 2. 省略号精准替换：只改 UI 占位符字符串中的 ... ──
replacements = [
    ('期刊/会议名...', '期刊/会议名…'),
    ('落入今日收件箱...', '落入今日收件箱…'),
    ('快速添加待办，回车确认...', '快速添加待办，回车确认…'),
    ('搜索标题 / 作者 / 来源...', '搜索标题 / 作者 / 来源…'),
    ('搜索笔记 / 文献 / 命令...', '搜索笔记 / 文献 / 命令…'),
    ('如 all:"satellite scheduling" OR all:"earth observation"...', '…'),
    ('返回结果，换个筛选试试...', '返回结果，换个筛选试试…'),
    ('空输入...' , '空输入…'),
    ('该文件夹内没有找到 PDF...', '…'),
]
for old_s, new_s in replacements:
    if old_s in src:
        src = src.replace(old_s, new_s)
        fixes.append(f'省略号:{old_s[:12]}')

# ── 3. 双番茄统一：侧栏加 mini ring ──
old = """    this._miniClock = pomoCard.createEl('div', { cls: 'jrs-side-clock' });"""
new = """    /* mini ring：与主页同源可视化 */
    const ringBox = pomoCard.createEl('div', { cls: 'jrs-side-ring' });
    const C = 2 * Math.PI * 40;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 96 96');
    const mk = (cls) => { const c = document.createElementNS(svgNS, 'circle'); c.setAttribute('class', cls); c.setAttribute('cx','48'); c.setAttribute('cy','48'); c.setAttribute('r','40'); return c; };
    const track = mk('od-pomo-track');
    this._miniBar = mk('od-pomo-bar');
    this._miniBar.setAttribute('stroke-dasharray', String(C));
    this._miniBar.setAttribute('stroke-dashoffset', '0');
    this._miniBar.setAttribute('stroke-width', '6');
    track.setAttribute('stroke-width', '6');
    svg.appendChild(track); svg.appendChild(this._miniBar);
    ringBox.appendChild(svg);
    this._miniClock = ringBox.createEl('div', { cls: 'jrs-side-clock' });"""
assert old in src, 'side ring'
src = src.replace(old, new); fixes.append('侧栏ring')

# renderPomoMini 更新 ring
old = """  renderPomoMini() {
    if (!this._miniClock) return;
    const p = this.plugin.pomo;
    this._miniClock.textContent = p.phase === 'idle'
      ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00`
      : p.clockText();"""
new = """  renderPomoMini() {
    if (!this._miniClock) return;
    const p = this.plugin.pomo;
    this._miniClock.textContent = p.phase === 'idle'
      ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00`
      : p.clockText();
    if (this._miniBar) {
      const C = 2 * Math.PI * 40;
      this._miniBar.setAttribute('stroke-dashoffset', String(C * p.progress));
      this._miniBar.toggleClass('od-pomo-bar--break', p.phase === 'break' || p.phase === 'longbreak');
    }"""
assert old in src, 'mini ring update'
src = src.replace(old, new); fixes.append('侧栏ring更新')

open('main.js', 'w', encoding='utf-8').write(src)
print('Round4 JS:', fixes)
