# -*- coding: utf-8 -*-
# Round5 关键修复：
# F1: computeMetrics 自适应列数（boardW < 400 时自动降列）
# F2: columns 变更后 reflow（x+w>cols 的卡重排）
# F3: 问答来源行防毒化（模型输出"来源："改写）
# F4: 死代码 getInboxToday 接入 submit（今日收件箱卡）
# F5: graph 主题卡作者独立样式
src = open('main.js', encoding='utf-8').read()
fixes = []

# ── F1+F2: computeMetrics 自适应 + columns reflow ──
old = """  computeMetrics() {
    const s = this.plugin.settings;
    const boardW = this._board ? this._board.clientWidth : 1000;
    const cols = s.columns; const gap = s.gapPx;
    const colW = Math.max(40, (boardW - (cols - 1) * gap) / cols);
    this._metrics = { cols, colW, rowH: ROW_H, gap, boardW };
  }"""
new = """  computeMetrics() {
    const s = this.plugin.settings;
    const boardW = this._board ? this._board.clientWidth : 1000;
    const gap = s.gapPx;
    /* 自适应列数：colW 低于 90px 时自动降列，保底 2 列 */
    let cols = s.columns;
    const minColW = 90;
    const fitCols = Math.max(2, Math.floor((boardW + gap) / (minColW + gap)));
    if (cols > fitCols) cols = fitCols;
    const colW = Math.max(40, (boardW - (cols - 1) * gap) / cols);
    this._metrics = { cols, colW, rowH: ROW_H, gap, boardW };
    /* 列数减少后：越界卡重排 */
    if (cols < s.columns) {
      for (const def of this.visibleCards()) {
        const l = this.layoutOf(def.id);
        if (l.x >= 0 && l.x + Math.min(l.w, cols) > cols) { l.x = -1; l.y = -1; }
      }
      this.packLayout();
    }
  }"""
assert old in src, 'F1'
src = src.replace(old, new); fixes.append('F1自适应列数')

# ── F3: 问答来源行防毒化 ──
old = "    const safeA = item.a.trim().replace(/^### /gm, '#### ');"
new = """    const safeA = item.a.trim().replace(/^### /gm, '#### ').replace(/^来源：/gm, '**来源**：');"""
if old in src:
    src = src.replace(old, new); fixes.append('F3来源行防毒化')

# getAskLogToday 匹配最后一个来源行
old = """      const srcMatch = body.match(/^来源：(.+)$/m);"""
new = """      const srcMatch = body.match(/^来源：(.+)$/gm);  /* 全局匹配取最后一个 */
      const srcLine = srcMatch ? srcMatch[srcMatch.length - 1] : null;
      const srcText = srcLine ? srcLine.replace(/^来源：/, '') : '';"""
if old in src:
    src = src.replace(old, new)
    # 后续引用 srcMatch[1] 的地方改用 srcText
    src = src.replace(
      "const sources = (srcMatch ? srcMatch[1] : '').split(/、/).map((l) => l.replace(/\\[\\[([^\\]|]+).*?\\]\\]/, '$1').trim()).filter(Boolean)",
      "const sources = srcText.split(/、/).map((l) => l.replace(/\\[\\[([^\\]|]+).*?\\]\\]/, '$1').trim()).filter(Boolean)"
    )
    fixes.append('F3来源解析最后行')

# ── F4: submit 加今日收件箱卡（getInboxToday 死代码激活）──
old = """    /* 目标期刊速查 */"""
new = """    /* 今日收件箱（快速捕获的闭环出口） */
    const inboxItems = await this.plugin.getInboxToday();
    if (inboxItems.length) {
      const ib = page.createEl('section', { cls: 'jrs-card' });
      const ibh = ib.createEl('div', { cls: 'jrs-section-heading' });
      ibh.createEl('h2', { text: '今日收件箱' });
      ibh.createSpan({ text: `${inboxItems.length} 条想法待处理` });
      const openIb = ibh.createEl('button', { cls: 'od-btn od-btn--sm', text: '打开' });
      openIb.onclick = () => this.plugin.openInboxNote();
      inboxItems.slice(0, 5).forEach((txt) => {
        ib.createEl('div', { cls: 'od-hint', text: '· ' + txt.slice(0, 60) });
      });
    }

    /* 目标期刊速查 */"""
assert old in src, 'F4'
src = src.replace(old, new); fixes.append('F4收件箱卡')

# ── F5: graph 主题卡作者独立 ──
old = """      items.slice(0, 3).forEach((p) => card.createEl('div', { cls: 'od-hint', text: '· ' + (p.title.length > 30 ? p.title.slice(0, 30) + '…' : p.title) }));"""
new = """      items.slice(0, 3).forEach((p) => {
        const line = card.createEl('div', { cls: 'od-hint' });
        line.textContent = '· ' + (p.title.length > 28 ? p.title.slice(0, 28) + '…' : p.title);
        if (p.authorsShort) {
          const au = line.createEl('span', { cls: 'jrs-graph-author' });
          au.textContent = ' — ' + p.authorsShort;
        }
      });"""
assert old in src, 'F5'
src = src.replace(old, new); fixes.append('F5作者样式')

open('main.js', 'w', encoding='utf-8').write(src)
print('R5 修复:', fixes)
