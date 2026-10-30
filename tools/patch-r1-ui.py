# -*- coding: utf-8 -*-
src = open('main.js', encoding='utf-8').read()
fixes = []

# ── V4 queue 分组重构（消除"阅读中既在高优组又在阅读中组"）──
old = """    const groups = [
      { title: '高优先级', hint: '优先啃下硬骨头', items: papers.filter((p) => p.priority === '高' && p.status !== '已归档') },
      { title: '阅读中', hint: '正在进行', items: papers.filter((p) => p.status === '阅读中') },
      { title: '待读', hint: '按优先级排队', items: papers.filter((p) => p.status === '待读').sort((a, b) => (PRIORITIES.indexOf(a.priority || '低') - PRIORITIES.indexOf(b.priority || '低')) || b.added - a.added).slice(0, 15) },
    ];"""
new = """    const groups = [
      { title: '进行中', hint: '正在阅读的文献', items: papers.filter((p) => p.status === '阅读中') },
      { title: '高优先待读', hint: '先啃硬骨头', items: papers.filter((p) => p.priority === '高' && p.status === '待读') },
      { title: '排队待读', hint: '按优先级与时间排序', items: papers.filter((p) => p.status === '待读' && p.priority !== '高').sort((a, b) => (PRIORITIES.indexOf(a.priority || '低') - PRIORITIES.indexOf(b.priority || '低')) || b.added - a.added).slice(0, 15) },
    ];"""
assert old in src, 'V4'
src = src.replace(old, new); fixes.append('V4分组')

# ── V5a 文案：方法文 → 方法类论文 ──
old = "note: '偏方法严谨与计算实验，规划类综述与方法文均常见'"
new = "note: '偏方法严谨与计算实验，规划类综述与方法类论文均常见'"
assert old in src, 'V5a'
src = src.replace(old, new); fixes.append('V5a文案')

# ── V5b 优先级胶囊：无优先级不显示（消除"优·"截断观感）──
old = """    const pr = foot.createEl('span', { cls: 'od-status jrs-prio' });
    pr.setAttribute('data-prio', p.priority || '');
    pr.textContent = p.priority ? `优 ${p.priority}` : '优 ·';
    pr.onclick = async (e) => {"""
new = """    const pr = foot.createEl('span', { cls: 'od-status jrs-prio' });
    pr.setAttribute('data-prio', p.priority || '');
    pr.textContent = p.priority || '';
    pr.title = '优先级（点击切换 高→中→低→无）';
    if (!p.priority) pr.style.display = 'none';
    pr.onclick = async (e) => {"""
assert old in src, 'V5b'
src = src.replace(old, new); fixes.append('V5b优先级')

# ── V2 progress 全零引导 + 幽灵起草态 ──
old = """    } else {
      const sections = await this.plugin.getSurveyProgress();
      const all = sections.reduce((a, s) => ({ d: a.d + s.done, t: a.t + s.total }), { d: 0, t: 0 });"""
new = """    } else {
      const sections = await this.plugin.getSurveyProgress();
      const all = sections.reduce((a, s) => ({ d: a.d + s.done, t: a.t + s.total }), { d: 0, t: 0 });
      if (all.d === 0) {
        const cta = surveyCard.createEl('div', { cls: 'jrs-zero-cta' });
        cta.createSpan({ text: '还没有任何勾选——打开大纲勾掉第一项，或点任意章节的 ✨ 直接让 AI 起草初稿' });
      }"""
assert old in src, 'V2'
src = src.replace(old, new); fixes.append('V2零态引导')

# ── V3 ask 空态示例问题 chips ──
old = """    await refreshList();
  }

  /* ========== 区段：阅读笔记 ========== */"""
new = """    /* 空态：示例问题 chips（点击即填入提问） */
    if (!document.querySelector('.jrs-ask-item')) {
      const sug = card.createEl('div', { cls: 'jrs-ask-suggest' });
      sug.createEl('div', { cls: 'od-hint', text: '试试这些问题：' });
      const chips = sug.createEl('div', { cls: 'od-chips' });
      ['网格热力图如何驱动多星调度决策？', '元启发式算法在卫星调度中怎么用？', '敏捷卫星与常规成像卫星的调度差异？'].forEach((q) => {
        const c = chips.createEl('span', { cls: 'od-chip', text: q });
        c.onclick = () => { input.value = q; input.focus(); };
      });
    }
    await refreshList();
  }

  /* ========== 区段：阅读笔记 ========== */"""
assert old in src, 'V3'
src = src.replace(old, new); fixes.append('V3示例问题')

# ── V6a 作者名格式统一（', ' 归一）──
old = """  async arxivToLibrary(it) {"""
new = """  /** 作者串归一：'Caldeiras , Paulo' → 'Paulo Caldeiras' 类脏空格清理 */
  static normalizeAuthors(s) {
    return String(s || '').replace(/\\s*,\\s*/g, ', ').replace(/,([^ ])/g, ', $1').trim();
  }

  async arxivToLibrary(it) {"""
assert old in src, 'V6a'
src = src.replace(old, new)
old = "        authors: it.authors,"
cnt = src.count(old)
src = src.replace(old, "        authors: JensenResearchStationPlugin.normalizeAuthors(it.authors),")
fixes.append(f'V6a作者归一×{cnt}')

# ── V8 graph 去重复主按钮 ──
old = """    const acts = intro.createEl('div', { cls: 'jrs-row-actions' });
    const gen = acts.createEl('button', { cls: 'od-btn od-btn--primary', text: '重建并打开图谱' });
    gen.onclick = async () => { await this.plugin.generateGraphCanvas(true); this.render(); };
    const exists = !!this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);
    if (exists) {
      const open = acts.createEl('button', { cls: 'od-btn', text: '打开已有图谱' });
      open.onclick = () => this.plugin.openGraphCanvas();
    }"""
new = """    const acts = intro.createEl('div', { cls: 'jrs-row-actions' });
    const exists = !!this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);
    if (exists) {
      const open = acts.createEl('button', { cls: 'od-btn od-btn--primary', text: '打开图谱' });
      open.onclick = () => this.plugin.openGraphCanvas();
      const gen = acts.createEl('button', { cls: 'od-btn', text: '重建图谱' });
      gen.title = '按当前文献库重建（顶部「重建图谱」同效）';
      gen.onclick = async () => { await this.plugin.generateGraphCanvas(true); this.render(); };
    } else {
      const gen = acts.createEl('button', { cls: 'od-btn od-btn--primary', text: '生成图谱' });
      gen.onclick = async () => { await this.plugin.generateGraphCanvas(true); this.render(); };
    }"""
assert old in src, 'V8'
src = src.replace(old, new); fixes.append('V8图谱按钮')

open('main.js', 'w', encoding='utf-8').write(src)
print('UI 逻辑修复:', fixes)
