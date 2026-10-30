# -*- coding: utf-8 -*-
# Round1 功能修复：F1 路径归一化 F2 图谱防护 F3 分区精确匹配 F4 日记ENOENT
# F5 openPath反馈 F6 双回车锁+模态catch F7 矩阵转义 F8 问答日志注入 F9 速查器回车
src = open('main.js', encoding='utf-8').read()
n_fix = []

# ── F1 路径归一化 + 非法字符校验（saveSettings 前统一清洗）──
old = "  async saveSettings() { await this.saveData(this.settings); }"
new = """  async saveSettings() {
    this.normalizeSettingPaths();
    await this.saveData(this.settings);
  }

  /** 库内路径字段统一清洗：反斜杠→正斜杠、去尾斜杠、非法字符拦截 */
  normalizeSettingPaths() {
    const keys = ['libFolder', 'pdfFolder', 'questionsFolder', 'submissionsFolder', 'inboxFolder', 'basesFolder', 'dailyFolder'];
    let warned = false;
    for (const k of keys) {
      const v = this.settings[k];
      if (typeof v !== 'string' || !v.trim()) continue;
      let nv = v.replace(/\\\\/g, '/').replace(/\\/+$/, '').trim();
      if (/[:*?"<>|]/.test(nv)) {
        nv = nv.replace(/[:*?"<>|]/g, ' ');
        warned = true;
      }
      if (nv !== v) this.settings[k] = nv;
    }
    if (warned) new Notice('路径含非法字符（: * ? " < > |），已自动清理');
  }"""
assert old in src, 'F1'
src = src.replace(old, new); n_fix.append('F1')

# ── F2 图谱：空库短路 + 未分类节点 + 不写空文件 ──
old = """  async generateGraphCanvas(open) {
    const papers = this.getPapers();
    const topics = this.settings.topics.filter((t) => papers.some((p) => p.topics.includes(t)));"""
new = """  async generateGraphCanvas(open) {
    const papers = this.getPapers();
    if (!papers.length) { new Notice('文献库为空，已阻止重建（避免清空现有图谱）'); return; }
    const topics = this.settings.topics.filter((t) => papers.some((p) => p.topics.includes(t)));
    const untagged = papers.filter((p) => !p.topics.some((t) => topics.includes(t)));"""
assert old in src, 'F2a'
src = src.replace(old, new)
# 未分类节点（追加在 topics 循环后）+ 统计口径
old = """    /* 论文节点：按主题列向下堆叠 */
    const P_W = 280; const P_H = 80; const P_GAP = 26;
    topics.forEach((t, ti) => {"""
new = """    /* 未分类虚拟节点 */
    if (untagged.length) {
      nodes.push({ id: 'topic-uncategorized', type: 'text', text: '## 未标注方向', x: -rowW / 2 - 340, y: -520, width: T_W, height: T_H, color: '4' });
    }
    /* 论文节点：按主题列向下堆叠 */
    const P_W = 280; const P_H = 80; const P_GAP = 26;
    topics.forEach((t, ti) => {"""
assert old in src, 'F2b'
src = src.replace(old, new)
old = """    const canvas = { nodes, edges, fmtMd: true };"""
new = """    /* 未分类论文节点 */
    untagged.forEach((p, pi) => {
      const nid = `paper-unc-${pi}`;
      nodes.push({
        id: nid, type: 'text',
        text: `[[${p.file.basename}|${p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title}]]\\n${p.status}${p.year ? ' · ' + p.year : ''}`,
        x: -rowW / 2 - 350, y: -420 + pi * (P_H + P_GAP), width: P_W, height: P_H, color: '0',
      });
      edges.push({ id: `e-${nid}`, fromNode: 'topic-uncategorized', fromSide: 'bottom', toNode: nid, toSide: 'top', color: '4' });
    });
    if (!nodes.length) { new Notice('图谱无内容，已取消写入'); return; }
    const canvas = { nodes, edges, fmtMd: true };"""
assert old in src, 'F2c'
src = src.replace(old, new)
old = 'new Notice(`图谱已生成：${topics.length} 主题 · ${papers.length} 论文`);'
new = 'new Notice(`图谱已生成：${topics.length} 主题 · 入图 ${papers.length - untagged.length} 篇（未标注 ${untagged.length} 篇归入"未标注方向"）`);'
assert old in src, 'F2d'
src = src.replace(old, new); n_fix.append('F2')

# ── F3 分区匹配：废除 includes 子串，改精确/分词 ──
old = """  zoneOf(venue) {
    if (!venue) return null;
    const v = String(venue).toLowerCase().trim();
    const j = JOURNALS.find((x) =>
      v === x.abbr.toLowerCase() || v === x.name.toLowerCase()
      || (x.abbr.length > 3 && v.includes(x.abbr.toLowerCase()))
      || (x.name.length > 8 && v.includes(x.name.toLowerCase())));
    if (j) return { abbr: j.abbr, cas: j.cas, jcr: j.jcr, ccf: j.ccf, tier: j.tier };
    /* 内置库兜底：CCF / 科协（同步查询） */
    const ccfHit = JOURNAL_BUILTIN.ccf.find((x) => x[0].toLowerCase() === v || (x[1] && x[1].toLowerCase() === v));
    if (ccfHit) return { abbr: '', cas: '', jcr: '', ccf: ccfHit[2], tier: '' };
    for (const [k, gv] of Object.entries(JOURNAL_BUILTIN.ops)) { if (k.toLowerCase() === v) return { abbr: '', cas: '', jcr: '', ccf: '', tier: gv }; }
    for (const [k, gv] of Object.entries(JOURNAL_BUILTIN.aero)) { if (k.toLowerCase() === v) return { abbr: '', cas: '', jcr: '', ccf: '', tier: gv }; }
    /* 已下载的中科院缓存（同步读内存缓存） */
    if (this._jcache?.cas?.[v]) return { abbr: '', cas: this._jcache.cas[v][0], jcr: '', ccf: '', tier: '', top: this._jcache.cas[v][1] };
    if (this._jcache?.xr?.[v]) return { abbr: '', cas: '', jcr: '', ccf: '', tier: '', xr: this._jcache.xr[v] };
    return null;
  }"""
new = """  /** 分词：切出全词集合（比较 abbr 用），如 'operations research letters' → words */
  static venueWords(v) {
    return new Set(String(v).toLowerCase().split(/[^a-z0-9\\u4e00-\\u9fff+&.-]+/).filter(Boolean));
  }

  zoneOf(venue) {
    if (!venue) return null;
    const v = String(venue).toLowerCase().trim();
    const words = JensenResearchStationPlugin.venueWords(v);
    /* 目标刊：全称精确 或 缩写整词命中（杜绝 'xxejorxx' / 'or' 误配） */
    const j = JOURNALS.find((x) =>
      v === x.abbr.toLowerCase() || v === x.name.toLowerCase() || words.has(x.abbr.toLowerCase()));
    if (j) return { abbr: j.abbr, cas: j.cas, jcr: j.jcr, ccf: j.ccf, tier: j.tier };
    /* 内置库兜底：CCF / 科协（精确名匹配） */
    const ccfHit = JOURNAL_BUILTIN.ccf.find((x) => x[0].toLowerCase() === v || (x[1] && x[1].toLowerCase() === v));
    if (ccfHit) return { abbr: '', cas: '', jcr: '', ccf: ccfHit[2], tier: '' };
    for (const [k, gv] of Object.entries(JOURNAL_BUILTIN.ops)) { if (k.toLowerCase() === v) return { abbr: '', cas: '', jcr: '', ccf: '', tier: gv }; }
    for (const [k, gv] of Object.entries(JOURNAL_BUILTIN.aero)) { if (k.toLowerCase() === v) return { abbr: '', cas: '', jcr: '', ccf: '', tier: gv }; }
    /* 已下载的中科院缓存（精确键） */
    if (this._jcache?.cas?.[v]) return { abbr: '', cas: this._jcache.cas[v][0], jcr: '', ccf: '', tier: '', top: this._jcache.cas[v][1] };
    if (this._jcache?.xr?.[v]) return { abbr: '', cas: '', jcr: '', ccf: '', tier: '', xr: this._jcache.xr[v] };
    return null;
  }"""
assert old in src, 'F3a'
src = src.replace(old, new)
# lookupJournal 同步收紧
old = """    const j = JOURNALS.find((x) => name === x.abbr.toLowerCase() || name === x.name.toLowerCase() || (x.name.length > 8 && name.includes(x.name.toLowerCase())));"""
new = """    const w1 = JensenResearchStationPlugin.venueWords(nameRaw);
    const j = JOURNALS.find((x) => name === x.abbr.toLowerCase() || name === x.name.toLowerCase() || w1.has(x.abbr.toLowerCase()));"""
assert old in src, 'F3b'
src = src.replace(old, new)
old = """    const ccfHit = JOURNAL_BUILTIN.ccf.find((x) => x[0].toLowerCase() === name || (x[1] && x[1].toLowerCase() === name) || (x[0].length > 8 && name.includes(x[0].toLowerCase())));"""
new = """    const ccfHit = JOURNAL_BUILTIN.ccf.find((x) => x[0].toLowerCase() === name || (x[1] && x[1].toLowerCase() === name) || (x[0].toLowerCase().length > 8 && w1.has(...x[0].toLowerCase().split(/\\s+/).slice(0, 1)) && w1.has(...x[0].toLowerCase().split(/\\s+/).slice(-1))));"""
assert old in src, 'F3c'
src = src.replace(old, new); n_fix.append('F3')

# ── F4 openDailyNote ensureFolder + catch ──
old = """  async openDailyNote(key) {
    let f = this.findDailyNote(key);
    if (!f) {
      const k = key || todayKey();
      f = await this.app.vault.create(this.dailyPath(key), `# ${k}\\n\\n## 今日待办\\n\\n## 专注记录\\n`);
    }
    await this.app.workspace.getLeaf(false).openFile(f);
  }"""
if old not in src:
    old = old.replace('await this.app.workspace.getLeaf(false).openFile(f);', 'await this.smartOpenFile(f);')
new = """  async openDailyNote(key) {
    let f = this.findDailyNote(key);
    if (!f) {
      const k = key || todayKey();
      try {
        if (this.settings.dailyFolder) await this.ensureFolder(this.settings.dailyFolder);
        f = await this.app.vault.create(this.dailyPath(key), `# ${k}\\n\\n## 今日待办\\n\\n## 专注记录\\n`);
      } catch (e) {
        new Notice(`日记创建失败：${e.message}（检查设置中的日记目录）`);
        return;
      }
    }
    await this.smartOpenFile(f);
  }"""
assert old in src, 'F4'
src = src.replace(old, new); n_fix.append('F4')

# ── F5 openPath 错误反馈 ──
old = """        if (electron?.shell?.openPath) { electron.shell.openPath(pdf); return; }"""
new = """        if (electron?.shell?.openPath) {
          const err = await electron.shell.openPath(pdf);
          if (err) new Notice(`打开失败：${err}`);
          return;
        }"""
assert old in src, 'F5'
src = src.replace(old, new); n_fix.append('F5')

# ── F6a ask 双回车锁 ──
old = """    const ask = async () => {
      const q = input.value.trim();
      if (!q) {
        new Notice('请输入问题，例如：网格热力图如何驱动多星调度决策？');
        input.focus();
        return;
      }
      btn.disabled = true;"""
new = """    let asking = false;
    const ask = async () => {
      if (asking) return;
      const q = input.value.trim();
      if (!q) {
        new Notice('请输入问题，例如：网格热力图如何驱动多星调度决策？');
        input.focus();
        return;
      }
      asking = true;
      btn.disabled = true;"""
assert old in src, 'F6a'
src = src.replace(old, new)
old = """      } catch (e) {
        busy.textContent = `❌ ${e.message}`;
        new Notice(`问答失败：${e.message}`);
      }
      btn.disabled = false;
    };
    btn.onclick = ask;
    input.onkeydown = (e) => { if (e.key === 'Enter') ask(); };"""
new = """      } catch (e) {
        busy.textContent = `❌ ${e.message}`;
        new Notice(`问答失败：${e.message}`);
      }
      asking = false;
      btn.disabled = false;
    };
    btn.onclick = ask;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ask(); } };"""
assert old in src, 'F6b'
src = src.replace(old, new); n_fix.append('F6a')

# ── F6b AddPaperModal 创建按钮 try/catch/finally ──
old = """    new Setting(contentEl)
      .addButton((b) => b.setButtonText('创建文献笔记').setCta().onClick(async () => {
        if (!this.data.title.trim()) { new Notice('标题不能为空'); return; }
        await this.plugin.createPaperNote(this.data);
        new Notice(`已添加：${this.data.title.slice(0, 24)}…`);
        this.close();
        if (this.onDone) this.onDone();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));"""
new = """    new Setting(contentEl)
      .addButton((b) => b.setButtonText('创建文献笔记').setCta().onClick(async () => {
        if (!this.data.title.trim()) { new Notice('标题不能为空'); return; }
        b.setDisabled(true);
        try {
          await this.plugin.createPaperNote(this.data);
          new Notice(`已添加：${this.data.title.slice(0, 24)}…`);
          this.close();
          if (this.onDone) this.onDone();
        } catch (e) {
          new Notice(`创建失败：${e.message}`);
          b.setDisabled(false);
        }
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));"""
assert old in src, 'F6c'
src = src.replace(old, new); n_fix.append('F6b')

# ── F7 矩阵单元格统一转义 ──
old = """    const rows = [
      '| 文献 | 年份 | 来源 | 分区 | 方向 | 状态 | 优先级 | 评分 | 问题设定 | 网格作用 | 求解算法 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const p of papers) {
      const t = p.title.replace(/\\|/g, '\\\\|');
      const link = `[[${p.file.basename}|${t.length > 34 ? t.slice(0, 34) + '…' : t}]]`;
      const zone = this.zoneOf(p.venue);
      rows.push(`| ${link} | ${p.year || '—'} | ${p.venue || '—'} | ${zone ? zone.abbr + ' ' + zone.cas : '—'} | ${p.topics.join('、') || '—'} | ${p.status} | ${p.priority || '—'} | ${'★'.repeat(p.rating) || '—'} |  |  |  |`);
    }"""
new = """    const mdCell = (v) => String(v == null ? '' : v).replace(/\\|/g, '\\\\|');
    const rows = [
      '| 文献 | 年份 | 来源 | 分区 | 方向 | 状态 | 优先级 | 评分 | 问题设定 | 网格作用 | 求解算法 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const p of papers) {
      const t = mdCell(p.title);
      const link = `[[${p.file.basename}|${t.length > 34 ? t.slice(0, 34) + '…' : t}]]`;
      const zone = this.zoneOf(p.venue);
      rows.push(`| ${link} | ${mdCell(p.year || '—')} | ${mdCell(p.venue || '—')} | ${zone ? mdCell(zone.abbr + ' ' + zone.cas) : '—'} | ${mdCell(p.topics.join('、') || '—')} | ${mdCell(p.status)} | ${mdCell(p.priority || '—')} | ${mdCell('★'.repeat(p.rating) || '—')} |  |  |  |`);
    }"""
assert old in src, 'F7'
src = src.replace(old, new); n_fix.append('F7')

# ── F8 问答日志：答案行首 ### 降级，防解析注入 ──
old = """    const srcLine = item.sources?.length
      ? `\\n\\n来源：${item.sources.map((s) => `[[${s.file.basename}]]`).join('、')}` : '';
    await this.app.vault.append(f, `\\n### Q: ${item.q}\\n\\n${item.a.trim()}${srcLine}\\n`);"""
if old not in src:
    # 宽松匹配
    import re as _re
    m = _re.search(r'await this\.app\.vault\.append\(f, `\\n### Q: \$\{item\.q\}\\n\\n\$\{item\.a\.trim\(\)\}\$\{srcLine\}\\n`\);', src)
    assert m, 'F8 pattern'
    old = m.group(0)
new = """    const safeA = item.a.trim().replace(/^### /gm, '#### ');
    await this.app.vault.append(f, `\\n### Q: ${item.q}\\n\\n${safeA}${srcLine}\\n`);"""
src = src.replace(old, new); n_fix.append('F8')

# ── F9 期刊速查器（投稿冲刺 + 侧栏）Enter 提交 ──
old = "    qInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };"
new = """    qInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };
    qInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (deb) clearTimeout(deb); runQ(); } };"""
assert old in src, 'F9a'
src = src.replace(old, new)
old = "    jInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };"
new = """    jInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };
    jInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (deb) clearTimeout(deb); runQ(); } };"""
assert old in src, 'F9b'
src = src.replace(old, new); n_fix.append('F9')

open('main.js', 'w', encoding='utf-8').write(src)
print('功能修复落位:', n_fix)
