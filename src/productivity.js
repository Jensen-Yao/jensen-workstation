class SidebarLife {
  constructor(view, host) {
    this.view = view; this.plugin = view.plugin; this.host = host;
    this.month = view._lifeMonth || window.moment().startOf('month');
    this._unsubscribe = this.plugin.pomo.onTick(() => this.renderClock());
    this.render();
  }
  destroy() { this._unsubscribe?.(); }
  render() {
    const host = this.host; host.empty(); host.addClass('jrs-life-sidebar');
    const heading = host.createEl('div', { cls: 'jrs-life-heading' });
    heading.createSpan({ text: '日历与生活' });
    const reminder = uiButton(heading, '', 'bell', () => new WellnessSettingsModal(this.plugin).open(), 'od-icon-btn'); reminder.setAttribute('aria-label', '喝水与休息提醒设置');
    const calendar = host.createEl('div', { cls: 'jrs-mini-calendar' });
    const bar = calendar.createEl('div', { cls: 'jrs-mini-calendar-bar' });
    uiButton(bar, '', 'chevron-left', () => this.moveMonth(-1), 'jrs-mini-cal-arrow').setAttribute('aria-label', '上个月');
    uiButton(bar, this.month.format('YYYY年 M月'), '', () => { this.month = window.moment().startOf('month'); this.view._lifeMonth = this.month; this.render(); }, 'jrs-mini-cal-month');
    uiButton(bar, '', 'chevron-right', () => this.moveMonth(1), 'jrs-mini-cal-arrow').setAttribute('aria-label', '下个月');
    const days = calendar.createEl('div', { cls: 'jrs-mini-calendar-days' });
    '一二三四五六日'.split('').forEach((day) => days.createSpan({ cls: 'jrs-mini-cal-week', text: day }));
    const first = (this.month.day() + 6) % 7;
    for (let i = 0; i < first; i++) days.createSpan();
    for (let day = 1; day <= this.month.daysInMonth(); day++) {
      const key = this.month.clone().date(day).format('YYYY-MM-DD');
      const log = this.plugin.wellnessDay(key);
      const button = uiButton(days, String(day), '', () => new LifeDayModal(this.plugin, key, () => this.render()).open(), `jrs-mini-cal-day${key === todayKey() ? ' is-today' : ''}${log.workouts ? ' is-trained' : ''}`);
      button.title = `${key} · 喝水 ${log.water} 次 · 休息 ${log.breaks} 次${log.workouts ? ' · 已健身' : ''}`;
      button.setAttribute('aria-label', button.title);
      if (this.plugin.findDailyNote(key)) button.classList.add('has-note');
    }
    const log = this.plugin.wellnessDay();
    const habits = host.createEl('div', { cls: 'jrs-habit-buttons' });
    [['water', 'glass-water', '喝水', log.water], ['breaks', 'coffee', '休息', log.breaks], ['workouts', 'dumbbell', '健身', log.workouts ? '已打卡' : '打卡']].forEach(([kind, icon, label, count]) => {
      const button = uiButton(habits, '', icon, async () => { await this.plugin.recordWellness(kind, todayKey(), kind === 'workouts' && log.workouts ? -1 : 1); this.render(); }, `jrs-habit-button${kind === 'workouts' && log.workouts ? ' is-done' : ''}`);
      button.createSpan({ text: label }); button.createEl('strong', { text: String(count) });
      button.title = kind === 'workouts' ? log.workouts ? '取消今日健身打卡' : '记录今日健身' : `记录一次${label}`;
    });
    const focus = host.createEl('div', { cls: 'jrs-life-focus' });
    setIcon(focus.createSpan(), 'timer'); this.clock = focus.createEl('strong');
    this.start = uiButton(focus, '', '', () => { this.plugin.pomo.phase === 'idle' ? this.plugin.pomo.start() : this.plugin.pomo.reset(); }, 'jrs-text-button');
    this.renderClock();
  }
  moveMonth(delta) { this.month = this.month.clone().add(delta, 'month'); this.view._lifeMonth = this.month; this.render(); }
  renderClock() {
    if (!this.clock) return;
    const pomo = this.plugin.pomo;
    this.clock.textContent = pomo.phase === 'idle' ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00` : pomo.clockText();
    this.start.textContent = pomo.phase === 'idle' ? '开始专注' : '停止';
  }
}

class LifeDayModal extends Modal {
  constructor(plugin, key, onDone) { super(plugin.app); this.plugin = plugin; this.key = key; this.onDone = onDone; }
  onOpen() {
    this.titleEl.setText(`${this.key} · 生活记录`); this.contentEl.empty();
    const log = this.plugin.wellnessDay(this.key);
    [['water', '喝水记录', log.water], ['breaks', '休息记录', log.breaks], ['workouts', '健身打卡', log.workouts]].forEach(([kind, label, count]) => {
      const setting = new Setting(this.contentEl).setName(label).setDesc(`${count} 次`);
      setting.addButton((button) => button.setButtonText('−').setDisabled(!count).onClick(async () => { await this.plugin.recordWellness(kind, this.key, -1); this.onOpen(); this.onDone?.(); }));
      setting.addButton((button) => button.setButtonText('+ 记录').setDisabled(kind === 'workouts' && count >= 1).onClick(async () => { await this.plugin.recordWellness(kind, this.key, 1); this.onOpen(); this.onDone?.(); }));
    });
    uiButton(this.contentEl, '打开这一天的日记', 'calendar-days', () => this.plugin.openDailyNote(this.key), 'od-btn od-btn--primary');
  }
}

class WellnessSettingsModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; }
  onOpen() {
    this.titleEl.setText('喝水与休息提醒');
    const options = this.plugin.settings.wellnessReminders;
    new Setting(this.contentEl).setName('启用温和提醒').setDesc('仅在 Obsidian 可见且处于提醒时段时显示。').addToggle((toggle) => toggle.setValue(options.enabled).onChange(async (value) => { options.enabled = value; this.plugin._wellnessStarted = Date.now(); await this.plugin.saveSettings(); }));
    [['waterMinutes', '喝水提醒间隔', 60], ['breakMinutes', '休息提醒间隔', 50]].forEach(([key, label, fallback]) => {
      new Setting(this.contentEl).setName(label).setDesc('分钟，5–240').addText((text) => {
        text.setValue(String(options[key])); text.inputEl.type = 'number'; text.inputEl.min = '5'; text.inputEl.max = '240';
        text.onChange(async (value) => { const number = Number(value); if (Number.isFinite(number) && number >= 5 && number <= 240) { options[key] = number; await this.plugin.saveSettings(); } });
      });
    });
    [['startHour', '每日开始时间'], ['endHour', '每日结束时间']].forEach(([key, label]) => new Setting(this.contentEl).setName(label).addDropdown((dropdown) => {
      for (let hour = 0; hour < 24; hour++) dropdown.addOption(String(hour), `${String(hour).padStart(2, '0')}:00`);
      dropdown.setValue(String(options[key])).onChange(async (value) => { options[key] = Number(value); await this.plugin.saveSettings(); });
    }));
  }
}

class LifePanelView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW_LIFE; }
  getDisplayText() { return '日历与生活'; }
  getIcon() { return 'calendar-heart'; }
  async onOpen() {
    this.render(); this.registerInterval(window.setInterval(() => { if (this._date !== todayKey()) this.render(); }, 60000));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      if (file.path !== this.plugin.dailyPath()) return;
      window.clearTimeout(this._taskRefresh); this._taskRefresh = window.setTimeout(() => this.render(), 160);
    }));
  }
  onClose() { this._life?.destroy(); window.clearTimeout(this._taskRefresh); }
  render() {
    this._life?.destroy(); this._date = todayKey();
    const root = this.contentEl; root.empty(); root.addClass('jrs-view', 'jrs-life-view');
    const header = root.createEl('header', { cls: 'jrs-life-panel-header' });
    header.createEl('div', { cls: 'jrs-eyebrow', text: 'DAILY COMPANION' });
    header.createEl('h2', { text: '日历与生活' });
    header.createEl('p', { text: `${window.moment().format('M月D日')} 星期${'日一二三四五六'[window.moment().day()]}` });
    buildThemeToggle(header, this.plugin);
    const body = root.createEl('div', { cls: 'jrs-life-panel-body' });
    this._life = new SidebarLife(this, body.createEl('section'));
    const notes = body.createEl('section', { cls: 'jrs-life-daily-actions' });
    notes.createEl('h3', { text: '今天的小计划' });
    uiButton(notes, '打开今日日记', 'calendar-days', () => this.plugin.openDailyNote(), 'od-btn');
    uiButton(notes, '生成今日小结', 'notebook-pen', () => this.plugin.generateDailyDigest(), 'od-btn');
    uiButton(notes, '喝水与休息提醒', 'bell', () => new WellnessSettingsModal(this.plugin).open(), 'od-btn');
    const hint = notes.createEl('p', { cls: 'od-hint' });
    hint.textContent = this.plugin.settings.wellnessReminders.enabled ? `提醒已开启 · 喝水 ${this.plugin.settings.wellnessReminders.waterMinutes} 分钟 / 休息 ${this.plugin.settings.wellnessReminders.breakMinutes} 分钟` : '提醒已关闭，可随时开启';
    const tasks = notes.createEl('div', { cls: 'jrs-life-tasks' });
    this.plugin.getTodayTasks().then((items) => {
      if (!tasks.isConnected) return;
      if (!items.length) { tasks.createEl('p', { cls: 'od-hint', text: '日记里的待办会出现在这里。' }); return; }
      items.slice(0, 8).forEach((task) => {
        const label = tasks.createEl('label', { cls: 'jrs-survey-task' });
        const check = label.createEl('input', { type: 'checkbox' }); check.checked = task.done; label.createSpan({ text: task.text });
        check.onchange = async () => { check.disabled = true; try { await this.plugin.toggleDailyTask(task); } finally { check.disabled = false; } };
      });
    });
  }
}

const WellnessMethods = {
  wellnessDay(key = todayKey()) { return Object.assign({ water: 0, breaks: 0, workouts: 0 }, this.settings.wellnessLog[key]); },
  async recordWellness(kind, key = todayKey(), delta = 1) {
    if (!['water', 'breaks', 'workouts'].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('无效的生活记录');
    const log = this.wellnessDay(key); const old = log[kind];
    log[kind] = Math.max(0, Math.min(kind === 'workouts' ? 1 : 999, old + delta));
    log[`${kind}At`] = Date.now(); this.settings.wellnessLog[key] = log;
    await this.saveSettings();
    this.app.workspace.getLeavesOfType(VIEW_LIFE).forEach((leaf) => leaf.view._life?.render());
    return log;
  },
  startWellnessReminders() {
    this._wellnessStarted = Date.now(); this._wellnessNotified = {}; this._wellnessSnooze = {};
    this.registerInterval(window.setInterval(() => this.checkWellnessReminders(), 30000));
  },
  checkWellnessReminders() {
    const options = this.settings.wellnessReminders;
    if (!options.enabled || document.visibilityState !== 'visible') return;
    const hour = window.moment().hour();
    const inHours = options.startHour === options.endHour || (options.startHour < options.endHour ? hour >= options.startHour && hour < options.endHour : hour >= options.startHour || hour < options.endHour);
    if (!inHours) return;
    const now = Date.now(); const log = this.wellnessDay();
    for (const [kind, minutes, label] of [['water', options.waterMinutes, '喝点水，让思路缓一缓。'], ['breaks', options.breakMinutes, '暂时离开屏幕，活动一下。']]) {
      const previous = Math.max(this._wellnessStarted, log[`${kind}At`] || 0, this._wellnessNotified[kind] || 0);
      if (now - previous < Math.max(5, Number(minutes) || 60) * 60000 || now < (this._wellnessSnooze[kind] || 0)) continue;
      this._wellnessNotified[kind] = now;
      const content = document.createElement('div'); content.createEl('p', { text: label });
      let notice;
      uiButton(content, kind === 'water' ? '记录喝水' : '记录休息', kind === 'water' ? 'glass-water' : 'coffee', async () => { await this.recordWellness(kind); notice.hide(); }, 'od-btn');
      uiButton(content, '10 分钟后', 'clock', () => { this._wellnessSnooze[kind] = now + 10 * 60000; this._wellnessNotified[kind] = now - Math.max(5, Number(minutes) || 60) * 60000; notice.hide(); }, 'od-btn');
      notice = new Notice(content, 30000);
    }
  },
};
