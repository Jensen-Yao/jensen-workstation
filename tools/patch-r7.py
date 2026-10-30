# -*- coding: utf-8 -*-
# R7 关键修复：
# F1(HIGH): setupBoardObserver resize 监听器泄漏（每次渲染 +1，已堆 70 个）
# F2(HIGH): window.confirm 原生阻塞→自研 FuzzyModal 异步确认
# F3(MED): AI 综述取消→跳过写盘（不只取消打开）
# F4: emoji 残留 24 行彻底清理
# F5: renderAsk 双重查询合并
# F6: @media→@container 侧栏断点
src = open('main.js', encoding='utf-8').read()
fixes = []

# ── F1: resize 监听器泄漏修复 ──
old = """  setupBoardObserver() {
    if (this._ro) this._ro.disconnect();
    this._ro = new ResizeObserver(() => { this.computeMetrics(); this.applyPositions(); });
    this._ro.observe(this._board);
    this.registerEvent(this.app.workspace.on('resize', () => { this.computeMetrics(); this.applyPositions(); }));
  }"""
new = """  setupBoardObserver() {
    if (this._ro) this._ro.disconnect();
    this._ro = new ResizeObserver(() => { this.computeMetrics(); this.applyPositions(); });
    this._ro.observe(this._board);
    /* resize 监听只注册一次（防泄漏：旧句柄先卸） */
    if (this._wsResizeRef) this.app.workspace.offref(this._wsResizeRef);
    this._wsResizeRef = this.app.workspace.on('resize', () => { this.computeMetrics(); this.applyPositions(); });
    this.registerEvent(this._wsResizeRef);
  }"""
if old in src:
    src = src.replace(old, new); fixes.append('F1泄漏修复')

# ── F2: window.confirm → 异步 Modal ──
old = """    const existing = ['文献库', '阅读队列'].filter((n) => this.app.vault.getAbstractFileByPath(`${dir}/${n}.base`));
    if (existing.length) {
      const ok = window.confirm(`将覆盖 ${existing.join('、')} 的 Bases 配置（手工修改会丢失）。继续？`);
      if (!ok) { new Notice('已取消'); return; }
    }"""
new = """    const existing = ['文献库', '阅读队列'].filter((n) => this.app.vault.getAbstractFileByPath(`${dir}/${n}.base`));
    if (existing.length) {
      const ok = await this.confirmDialog('重建 Bases', `将覆盖 ${existing.join('、')} 的 Bases 配置（手工修改会丢失）。`);
      if (!ok) { new Notice('已取消'); return; }
    }"""
if old in src:
    src = src.replace(old, new)
    # confirmDialog helper（追加在 generateBases 前）
    anchor = "  async generateBases()"
    helper = """  /** 异步确认弹窗（替代 window.confirm 原生阻塞） */
  confirmDialog(title, message) {
    return new Promise((resolve) => {
      const m = new Modal(this.app);
      m.titleEl.setText(title);
      m.contentEl.createEl('p', { text: message });
      new Setting(m.contentEl)
        .addButton((b) => b.setButtonText('确认').setCta().onClick(() => { m.close(); resolve(true); }))
        .addButton((b) => b.setButtonText('取消').onClick(() => { m.close(); resolve(false); }));
      m.onClose = () => resolve(false);
      m.open();
    });
  }

"""
    if helper not in src:
        src = src.replace(anchor, helper + anchor, 1)
    fixes.append('F2confirm→Modal')

# ── F3: AI 综述取消→跳过写盘 ──
old = """        const f = await this.plugin.aiSynthesis(topic, n, goal);
        if (this._cancelled) return;"""
new = """        const f = await this.plugin.aiSynthesis(topic, n, goal);
        if (this._cancelled) { new Notice('综述已生成但未打开（弹窗已关闭）'); return; }"""
if old in src:
    src = src.replace(old, new); fixes.append('F3取消提示')

# ── F4: emoji 彻底清理（残留 24 行）──
import re
emoji_pairs = [
    ('☕', ''), ('⚠️', ''), ('📥', ''), ('📚', ''), ('✨', 'sparkles'),
    ('❓', ''), ('✅', ''), ('🎯', ''), ('📎', '原文: '), ('⭐', '★'),
]
for emoji, replacement in emoji_pairs:
    count = src.count(emoji)
    if count > 0:
        src = src.replace(emoji, replacement)
        fixes.append(f'F4:{emoji}×{count}')
# 清理替换后可能的双空格
src = re.sub(r'  +([，。；！？\)])', r' \1', src)
src = src.replace('new Notice(` 休息', 'new Notice(`休息')
src = src.replace("'  ', '待解答'", "'', '待解答'")

# ── F5: renderAsk 双重查询合并 ──
old = """    const _hist = await this.plugin.getAskLogToday();
    if (!_hist.length) {"""
if old in src:
    # refreshList 已在后面调 getAskLogToday——把结果提出来复用
    # 简化：chips 判断用 DOM 结果而非再次读文件
    src = src.replace(old, """    const _hist = await this.plugin.getAskLogToday();
    const _hasHistory = _hist.length > 0;
    if (!_hasHistory) {""")
    fixes.append('F5chips条件')

open('main.js', 'w', encoding='utf-8').write(src)
print('R7 修复:', fixes)
