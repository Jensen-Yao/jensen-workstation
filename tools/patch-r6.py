# -*- coding: utf-8 -*-
# R6: 视觉5项 + 功能5项
src = open('main.js', encoding='utf-8').read()
fixes = []

# ═══ 视觉 ═══

# V1: 胶囊命名统一（"优先级：全部"→"全部优先级"、"全部方向"→"全部方向" 保留但统一冒号去除）
for old_s, new_s in [
    ("text: p === '全部' ? '优先级：全部' : p", "text: p === '全部' ? '全部优先级' : p"),
    ("text: '优先级： 全部'", "text: '全部优先级'"),
]:
    if old_s in src:
        src = src.replace(old_s, new_s)
        fixes.append(f'V1胶囊:{old_s[:14]}')

# V2: 库名统一
src = src.replace("'当前文库'", "'当前文献库'")
src = src.replace("'当前文库数学'", "'当前文献库'")
if '当前文献库' in src:
    fixes.append('V2库名统一')

# V3: emoji 换 SVG/文字（Notice 文案与卡内 emoji）
emoji_map = [
    ('new Notice(`🍅 专注完成！', 'new Notice(`专注完成！'),
    ('new Notice("☕ 休息结束', 'new Notice("休息结束'),
    ('new Notice(`✅ 新增', 'new Notice(`新增'),
    ('new Notice(`✅ 已生成', 'new Notice(`已生成'),
    ('✨', 'sparkles '),
    ('⚠️ 预警：', '预警：'),
]
for old_s, new_s in emoji_map:
    cnt = src.count(old_s)
    if cnt > 0:
        src = src.replace(old_s, new_s)
        fixes.append(f'V3emoji:{old_s[:8]}×{cnt}')

# V3b: 特定残留
src = src.replace("点任意章节的 ✨ 直接让 AI 起草初稿", "点任意章节的起草按钮直接让 AI 生成初稿")
src = src.replace("text: '📚 文献：", "text: '文献：")
src = src.replace("text: '❓ 研究问题：", "text: '研究问题：")
src = src.replace("text: '🎯 投稿管线：", "text: '投稿管线：")
src = src.replace("text: '🍅 专注：", "text: '专注：")
src = src.replace("- 🍅 专注', '- 专注")
src = src.replace("📡 arXiv", "arXiv")
src = src.replace("🤖 AI 助手", "AI 助手")
src = src.replace("🧲 MinerU", "MinerU")
src = src.replace("🔬 科研", "科研")
src = src.replace("🧭 应用外壳", "应用外壳")
src = src.replace("🎨 外观工作室", "外观工作室")
src = src.replace("📁 路径", "路径")
src = src.replace("🍅 番茄钟", "番茄钟")
src = src.replace("🗄 数据", "数据")
src = src.replace("📚 已加入文献库 📚", "已加入文献库")
src = src.replace("📚 已加入', '已加入'")
src = src.replace("已加入文献库 📚", "已加入文献库")
src = src.replace("✅ ", "")
src = src.replace("✅ 今日", "今日")
src = src.replace("📥", "")
src = src.replace("🔍", "")
src = src.replace("❌ ", "")
fixes.append('V3b全面清理')

# ═══ 功能 ═══

# F1: AI 综述取消机制
old = """    new Setting(contentEl).addButton((b) => b.setButtonText('生成综述').setCta().onClick(async () => {
      b.setDisabled(true);
      busy.textContent = '正在阅读文献并综合…';
      try {
        const f = await this.plugin.aiSynthesis(topic, n, goal);
        busy.textContent = `已生成：${f.path}`;
        this.app.workspace.getLeaf(false).openFile(f);
      } catch (e) { busy.textContent = `${e.message}`; new Notice(`综述失败：${e.message}`); }
      b.setDisabled(false);
    }));"""
new = """    this._cancelled = false;
    this.onClose = () => { this._cancelled = true; };
    new Setting(contentEl).addButton((b) => b.setButtonText('生成综述').setCta().onClick(async () => {
      b.setDisabled(true);
      busy.textContent = '正在阅读文献并综合…（关闭弹窗可取消）';
      try {
        const f = await this.plugin.aiSynthesis(topic, n, goal);
        if (this._cancelled) return; /* 弹窗已关闭：完成生成但不打开 */
        busy.textContent = `已生成：${f.path}`;
        this.plugin.smartOpenFile(f);
      } catch (e) { if (!this._cancelled) { busy.textContent = `${e.message}`; new Notice(`综述失败：${e.message}`); } }
      if (!this._cancelled) b.setDisabled(false);
    }));"""
if old in src:
    src = src.replace(old, new); fixes.append('F1综述取消')

# F2: Bases 重建确认
old = """  async generateBases() {
    const dir = this.settings.basesFolder;"""
new = """  async generateBases(confirmOverwrite = false) {
    const dir = this.settings.basesFolder;
    /* 已有文件时确认（首次静默） */
    if (!confirmOverwrite) {
      const existing = ['文献库', '阅读队列'].filter((n) => this.app.vault.getAbstractFileByPath(`${dir}/${n}.base`));
      if (existing.length) {
        const ok = window.confirm(`将覆盖 ${existing.join('、')} 的 Bases 视图配置（手工修改会丢失）。继续？`);
        if (!ok) { new Notice('已取消 Bases 重建'); return; }
      }
    }"""
if old in src:
    src = src.replace(old, new); fixes.append('F2Bases确认')

# F3: 空路径校验
old = "  async saveSettings() {"
new = """  async saveSettings() {
    /* 关键路径非空校验 */
    if (!String(this.settings.libFolder || '').trim()) {
      this.settings.libFolder = '科研工作台/文献';
      new Notice('文献目录不能为空，已重置为默认值');
    }"""
if old in src:
    src = src.replace(old, new, 1); fixes.append('F3空路径')

# F4: renderAsk 示例 chips 条件修正
old = """    /* 空态：示例问题 chips（点击即填入提问） */
    if (!document.querySelector('.jrs-ask-item')) {"""
new = """    /* 空态：示例问题 chips（仅在无历史时显示） */
    const historyItems = await this.plugin.getAskLogToday();
    if (!historyItems.length) {"""
if old in src:
    src = src.replace(old, new); fixes.append('F4chips条件')

open('main.js', 'w', encoding='utf-8').write(src)
print('R6 修复:', fixes)
