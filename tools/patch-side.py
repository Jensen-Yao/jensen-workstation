# -*- coding: utf-8 -*-
src = open('main.js', encoding='utf-8').read()

# ── 1) ViewType 常量 ──
old = "const VIEW_DASHBOARD = 'jrs-dashboard';\nconst VIEW_LIBRARY = 'jrs-library';"
new = "const VIEW_DASHBOARD = 'jrs-dashboard';\nconst VIEW_LIBRARY = 'jrs-library';\nconst VIEW_SIDE = 'jrs-sidepanel';"
assert old in src, 'viewtype'
src = src.replace(old, new)

# ── 2) SidePanelView 类（插在 DashboardView 类定义之前）──
anchor = "/* ==========================================================================\n * 应用壳视图：左侧栏 + Topbar + 区段路由\n * ========================================================================== */\n\nclass DashboardView extends ItemView {"
side = """/* ==========================================================================
 * 右侧工具栏：迷你番茄钟 + 期刊速查 + 快速记想法（与主界面共享引擎）
 * ========================================================================== */

class SidePanelView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._unsub = plugin.pomo.onTick(() => this.renderPomoMini());
  }

  getViewType() { return VIEW_SIDE; }
  getDisplayText() { return 'JRS 工具栏'; }
  getIcon() { return 'panel-right'; }

  async onOpen() { this.render(); }
  onClose() { if (this._unsub) this._unsub(); }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('jrs-side');

    /* ── 迷你番茄钟 ── */
    const pomoCard = root.createEl('section', { cls: 'jrs-card jrs-side-pomo' });
    const ph = pomoCard.createEl('div', { cls: 'od-card-title' });
    setIcon(ph, 'timer');
    ph.createSpan({ text: '番茄钟' });
    this._miniClock = pomoCard.createEl('div', { cls: 'jrs-side-clock' });
    this._miniPhase = pomoCard.createEl('div', { cls: 'od-hint' });
    const pc = pomoCard.createEl('div', { cls: 'jrs-side-pomo-btns' });
    this._miniStart = pc.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm' });
    this._miniStart.onclick = () => {
      const p = this.plugin.pomo;
      if (p.phase === 'idle') p.start(); else p.reset();
    };
    const resetBtn = pc.createEl('button', { cls: 'od-btn od-btn--sm', text: '重置' });
    resetBtn.onclick = () => this.plugin.pomo.reset();
    this._miniCount = pomoCard.createEl('div', { cls: 'od-hint' });
    this.renderPomoMini();

    /* ── 期刊速查 ── */
    const jCard = root.createEl('section', { cls: 'jrs-card' });
    const jh = jCard.createEl('div', { cls: 'od-card-title' });
    setIcon(jh, 'telescope');
    jh.createSpan({ text: '期刊速查' });
    const jInput = jCard.createEl('input', { type: 'text', cls: 'jrs-side-input', attr: { placeholder: '期刊/会议名…' } });
    const jOut = jCard.createEl('div', { cls: 'jrs-lookup-out' });
    let deb = null;
    const badge = (text, cls) => {
      const b = document.createElement('span');
      b.className = 'jrs-zone-badge';
      b.textContent = text;
      b.setAttribute('data-zone', cls);
      return b;
    };
    const runQ = async () => {
      const v = jInput.value.trim();
      jOut.empty();
      if (!v) return;
      const r = await this.plugin.lookupJournal(v);
      if (!r.found) { jOut.createEl('div', { cls: 'od-hint', text: '未收录' }); return; }
      const row = jOut.createEl('div', { cls: 'jrs-side-badges' });
      if (r.cas) row.appendChild(badge(`中科院${r.cas}${r.casTop ? '·Top' : ''}`, r.cas.includes('1区') ? 'top' : 'mid'));
      if (r.xr) row.appendChild(badge(`新锐${r.xr}`, 'cn'));
      if (r.ccf) row.appendChild(badge(`CCF-${r.ccf.grade}`, 'top'));
      if (r.cast) row.appendChild(badge(`科协${r.cast}`, r.cast === 'A' || r.cast === 'T1' ? 'top' : 'mid'));
      if (r.warn) row.appendChild(badge(`⚠️${r.warn}`, 'top'));
      if (!row.children.length) row.appendChild(badge('已收录', 'mid'));
    };
    jInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };

    /* ── 快速记想法 ── */
    const cCard = root.createEl('section', { cls: 'jrs-card' });
    const ch = cCard.createEl('div', { cls: 'od-card-title' });
    setIcon(ch, 'inbox');
    ch.createSpan({ text: '快速记想法' });
    const cInput = cCard.createEl('textarea', { cls: 'jrs-side-input', attr: { rows: '3', placeholder: '想到什么记什么，落入今日收件箱…' } });
    cInput.style.resize = 'vertical';
    const cBtn = cCard.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '存入收件箱' });
    const cHint = cCard.createEl('div', { cls: 'od-hint' });
    cBtn.onclick = async () => {
      const v = cInput.value.trim();
      if (!v) { new Notice('内容为空'); return; }
      await this.plugin.captureThought(v);
      cInput.value = '';
      cHint.textContent = `✅ ${window.moment().format('HH:mm')} 已存`;
      new Notice('已存入今日收件箱 📥');
    };
    const inbox = this.plugin.findDailyNote ? null : null;
    const openInbox = cCard.createEl('button', { cls: 'od-btn od-btn--sm od-btn--ghost', text: '查看收件箱' });
    openInbox.onclick = () => this.plugin.openInboxNote();
  }

  renderPomoMini() {
    if (!this._miniClock) return;
    const p = this.plugin.pomo;
    this._miniClock.textContent = p.phase === 'idle'
      ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00`
      : p.clockText();
    this._miniPhase.textContent = `${p.phaseText()} · 今日 ${p.completedToday} 个 / ${this.plugin.todayPomoMinutes()} 分钟`;
    this._miniStart.textContent = p.phase === 'idle' ? '开始专注' : '停止';
  }
}

""" + anchor
assert anchor in src, 'dashboard anchor'
src = src.replace(anchor, side, 1)

# ── 3) 插件注册：view + 命令 + ribbon ──
old = "    this.registerView(VIEW_LIBRARY, (leaf) => new LibraryView(leaf, this));"
new = """    this.registerView(VIEW_LIBRARY, (leaf) => new LibraryView(leaf, this));
    this.registerView(VIEW_SIDE, (leaf) => new SidePanelView(leaf, this));"""
assert old in src
src = src.replace(old, new)

old = "      ['daily-digest', '生成今日小结（写入日记）', () => this.generateDailyDigest()],"
new = """      ['daily-digest', '生成今日小结（写入日记）', () => this.generateDailyDigest()],
      ['side-panel', '打开右侧工具栏（番茄钟/查期刊/记想法）', () => this.activateSidePanel()],"""
assert old in src
src = src.replace(old, new)

# ── 4) activateSidePanel + openInboxNote + onunload 清理 ──
old = "  async activateLibrary(topic) {"
new = """  async activateSidePanel() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_SIDE);
    const leaf = existing.length ? existing[0] : workspace.getRightLeaf(false);
    if (!existing.length) await leaf.setViewState({ type: VIEW_SIDE, active: true });
    else {
      workspace.revealLeaf(leaf);
      if (leaf.isCollapsed?.()) leaf.expand?.();
    }
  }

  async openInboxNote() {
    const path = `${this.settings.inboxFolder}/${todayKey()}.md`;
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      await this.ensureFolder(this.settings.inboxFolder);
      f = await this.app.vault.create(path, `# 收件箱 ${todayKey()}\\n\\n`);
    }
    await this.smartOpenFile(f);
  }

  async activateLibrary(topic) {"""
assert old in src
src = src.replace(old, new)

old = """    this.app.workspace.detachLeavesOfType(VIEW_DASHBOARD);
    this.app.workspace.detachLeavesOfType(VIEW_LIBRARY);"""
new = """    this.app.workspace.detachLeavesOfType(VIEW_DASHBOARD);
    this.app.workspace.detachLeavesOfType(VIEW_LIBRARY);
    this.app.workspace.detachLeavesOfType(VIEW_SIDE);"""
assert old in src
src = src.replace(old, new)

# ── 5) 快速启动磁贴 ──
old = "      { icon: 'calendar-check', label: '今日小结', fn: () => this.plugin.generateDailyDigest() },"
new = """      { icon: 'calendar-check', label: '今日小结', fn: () => this.plugin.generateDailyDigest() },
      { icon: 'panel-right', label: '侧栏工具', fn: () => this.plugin.activateSidePanel() },"""
assert old in src
src = src.replace(old, new)

open('main.js', 'w', encoding='utf-8').write(src)
print('SidePanelView 三工具 + 注册 ✓')
