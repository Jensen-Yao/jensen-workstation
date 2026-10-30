# -*- coding: utf-8 -*-
src = open('main.js', encoding='utf-8').read()

# ── 1) home 区段不渲染 topbar（信息并入居中 hero）──
old = """    const main = shell.createEl('div', { cls: 'jrs-main' });
    main.appendChild(this.buildTopbar());"""
new = """    const main = shell.createEl('div', { cls: 'jrs-main' });
    if (this.section !== 'home') main.appendChild(this.buildTopbar());"""
assert old in src, 'topbar anchor'
src = src.replace(old, new)

# ── 2) Hero 重构：居中版式（标题 → 副标题 → 搜索框 → 操作行）──
old = """  buildHero() {
    const s = this.plugin.settings;
    const h = document.createElement('header');
    h.addClass('jrs-hero', 'od-anim');
    const titleRow = h.createEl('div', { cls: 'jrs-hero-title-row' });
    const brand = titleRow.createEl('div', { cls: 'jrs-hero-brand' });
    const logo = brand.createEl('span', { cls: 'jrs-hero-logo' });
    setIcon(logo, 'telescope');
    brand.createEl('h1', { cls: 'jrs-hero-name', text: 'Jensen 科研工作站' });
    const editBtn = titleRow.createEl('button', { cls: `od-btn jrs-edit-toggle${this.editing ? ' is-on' : ''}` });
    setIcon(editBtn.createSpan(), this.editing ? 'check' : 'layout-grid');
    editBtn.createSpan({ text: this.editing ? '完成排版' : '排版' });
    editBtn.onclick = () => this.toggleEditing();

    const hour = window.moment().hour();
    const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    const papers = this.plugin.getPapers();
    const todo = papers.filter((p) => p.status === '待读').length;
    const reading = papers.filter((p) => p.status === '阅读中').length;
    const wd = '日一二三四五六'[window.moment().day()];
    let sub = `${greet}，Jensen · ${window.moment().format('M月D日')} 星期${wd}`;
    if (s.researchStart && window.moment(s.researchStart, 'YYYY-MM-DD').isValid()) {
      sub += ` · 科研第 ${window.moment().diff(window.moment(s.researchStart, 'YYYY-MM-DD'), 'days') + 1} 天`;
    }
    sub += ` · 待读 ${todo} / 阅读中 ${reading} · 今日专注 ${this.plugin.todayPomoMinutes()} 分钟`;
    h.createEl('div', { cls: 'jrs-hero-sub', text: sub });
    return h;
  }"""
new = """  buildHero() {
    const s = this.plugin.settings;
    const h = document.createElement('header');
    h.addClass('jrs-hero', 'jrs-hero-center', 'od-anim');

    /* 标题（居中） */
    const brand = h.createEl('div', { cls: 'jrs-hero-brand' });
    const logo = brand.createEl('span', { cls: 'jrs-hero-logo' });
    setIcon(logo, 'telescope');
    brand.createEl('h1', { cls: 'jrs-hero-name', text: 'Jensen 科研工作站' });

    /* 副标题 */
    const hour = window.moment().hour();
    const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    const papers = this.plugin.getPapers();
    const todo = papers.filter((p) => p.status === '待读').length;
    const reading = papers.filter((p) => p.status === '阅读中').length;
    const wd = '日一二三四五六'[window.moment().day()];
    let sub = `${greet}，Jensen · ${window.moment().format('M月D日')} 星期${wd}`;
    if (s.researchStart && window.moment(s.researchStart, 'YYYY-MM-DD').isValid()) {
      sub += ` · 科研第 ${window.moment().diff(window.moment(s.researchStart, 'YYYY-MM-DD'), 'days') + 1} 天`;
    }
    sub += ` · 待读 ${todo} / 阅读中 ${reading} · 今日专注 ${this.plugin.todayPomoMinutes()} 分钟`;
    h.createEl('div', { cls: 'jrs-hero-sub', text: sub });

    /* 搜索框（标题正下方，居中） */
    const omni = h.createEl('div', { cls: 'jrs-hero-omni' });
    this.buildOmnibox(omni);

    /* 操作行（居中） */
    const actions = h.createEl('div', { cls: 'od-header-actions jrs-hero-actions' });
    const mkBtn = (cls, icon, label, fn) => {
      const b = actions.createEl('button', { cls });
      setIcon(b.createSpan(), icon);
      b.createSpan({ text: label });
      b.onclick = fn;
      return b;
    };
    mkBtn('od-btn od-btn--primary', 'library', '文献库', () => this.goto('library'));
    mkBtn('od-btn', 'file-plus', '添加', () => new AddPaperModal(this.plugin, () => this.goto('home')).open());
    mkBtn('od-btn', 'import', '导入', () => new ImportFolderModal(this.plugin, () => this.goto('home')).open());
    mkBtn('od-btn', 'layout-panel-left', '卡片', () => new CardManagerModal(this.plugin, () => this.goto('home')).open());
    mkBtn('od-btn', 'bot', '知识问答', () => this.goto('ask'));
    mkBtn('od-btn', 'target', '投稿冲刺', () => this.goto('submit'));
    const editBtn = actions.createEl('button', { cls: `od-btn jrs-edit-toggle${this.editing ? ' is-on' : ''}` });
    setIcon(editBtn.createSpan(), this.editing ? 'check' : 'layout-grid');
    editBtn.createSpan({ text: this.editing ? '完成排版' : '排版' });
    editBtn.onclick = () => this.toggleEditing();
    return h;
  }"""
assert old in src, 'hero anchor'
src = src.replace(old, new)

open('main.js', 'w', encoding='utf-8').write(src)
print('Hero 居中重构 ✓')
