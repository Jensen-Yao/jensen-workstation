# -*- coding: utf-8 -*-
src = open('main.js', encoding='utf-8').read()

# ── 1) 投稿冲刺顶部：期刊速查器 ──
anchor = "  renderSubmit(page) {\n    /* 我的投稿管线 */"
ui = """  renderSubmit(page) {
    /* ── 期刊速查器（任意期刊 → CCF/科协/中科院2025/新锐2026/预警）── */
    const qc = page.createEl('section', { cls: 'jrs-card' });
    const qh = qc.createEl('div', { cls: 'jrs-section-heading' });
    qh.createEl('h2', { text: '期刊速查器' });
    const cacheNow = this.plugin._jcache;
    qh.createSpan({ text: cacheNow ? `已加载全量库（中科院2025 ${Object.keys(cacheNow.cas || {}).length} 刊 · 新锐2026 ${Object.keys(cacheNow.xr || {}).length} 刊）` : '内置 CCF2026·科协目录；下载全量库后可查任意期刊的 2025 中科院分区与新锐分区' });
    const dlBtn = qh.createEl('button', { cls: 'od-btn od-btn--sm' });
    setIcon(dlBtn.createSpan(), 'download');
    dlBtn.createSpan({ text: cacheNow ? '更新全量库' : '下载全量库(约10MB)' });
    dlBtn.onclick = async () => {
      dlBtn.disabled = true;
      new Notice('正在下载并解析中科院2025 + 新锐2026…');
      try {
        const r = await this.plugin.downloadJournalDB();
        new Notice(`期刊库就绪：中科院 ${r.cas} 刊 · 新锐 ${r.xr} 刊`);
        this.render();
      } catch (e) { new Notice(`下载失败：${e.message}`); dlBtn.disabled = false; }
    };
    const qRow = qc.createEl('div', { cls: 'jrs-discover-form' });
    const qInput = qRow.createEl('input', { type: 'text', placeholder: '输入任意期刊/会议名，如 Journal of Scheduling、GECCO、宇航学报…' });
    const qOut = qc.createEl('div', { cls: 'jrs-lookup-out' });
    let deb = null;
    const badge = (text, cls, title) => {
      const b = document.createElement('span');
      b.className = 'jrs-zone-badge';
      b.textContent = text;
      b.setAttribute('data-zone', cls);
      if (title) b.title = title;
      return b;
    };
    const runQ = async () => {
      const v = qInput.value.trim();
      qOut.empty();
      if (!v) return;
      const r = await this.plugin.lookupJournal(v);
      if (!r.found) {
        qOut.createEl('div', { cls: 'od-hint', text: `未收录「${v}」——内置库含 CCF2026/科协目录${this.plugin._jcache ? '' : '；点右上下载全量库可查中科院2025/新锐2026'}。试试全称或缩写？` });
        return;
      }
      const row = qOut.createEl('div', { cls: 'jrs-lookup-result' });
      row.createEl('span', { cls: 'jrs-lookup-name', text: v });
      const badges = row.createEl('span', { cls: 'jrs-ask-sources' });
      if (r.cas) badges.appendChild(badge(`中科院 ${r.cas}${r.casTop ? ' · Top' : ''}`, r.cas.includes('1区') ? 'top' : 'mid', r.cat ? `大类：${r.cat}` : ''));
      if (r.xr) badges.appendChild(badge(`新锐 ${r.xr}`, 'cn', '中科院2026新锐期刊分区'));
      if (r.ccf) badges.appendChild(badge(`CCF-${r.ccf.grade}`, 'top', `${r.ccf.type}${r.ccf.field ? ' · ' + r.ccf.field : ''}`));
      if (r.cast) badges.appendChild(badge(`科协 ${r.cast}`, r.cast.startsWith('T1') || r.cast === 'A' ? 'top' : 'mid', r.castField ? `中国科协高质量目录 · ${r.castField}` : '中国科协高质量目录'));
      if (r.jcr) badges.appendChild(badge(`JCR ${r.jcr}`, 'mid'));
      if (r.target) badges.appendChild(badge('目标刊', 'cn', '已在投稿冲刺目标期刊库'));
      if (r.warn) badges.appendChild(badge(`⚠️ 预警：${r.warn}`, 'top', '2025 国际期刊预警名单'));
    };
    qInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };
    this.plugin.loadJournalCache(true).then(() => { if (this.plugin._jcache && qInput.value) runQ(); });

    /* 我的投稿管线 */"""
assert anchor in src, 'submit anchor'
src = src.replace(anchor, ui, 1)

# ── 2) AddPaperModal venue 联想 ──
old = "    mkText('期刊 / 会议', 'venue', 'EJOR / AST / 宇航学报…（可选目标刊）');"
new = """    const venueWrap = new Setting(contentEl).setName('期刊 / 会议').setDesc('输入后自动识别 CCF/科协/中科院分区');
    const venueInput = venueWrap.controlEl.createEl('input', { type: 'text' });
    venueInput.className = 'jrs-inline-input';
    venueInput.style.width = '220px';
    venueInput.placeholder = 'EJOR / Journal of Scheduling / 宇航学报…';
    const venueHint = venueWrap.controlEl.createEl('div', { cls: 'od-hint' });
    venueHint.style.cssText = 'font-size:11px;margin-top:2px;';
    let venueTimer = null;
    venueInput.oninput = () => {
      this.data.venue = venueInput.value;
      if (venueTimer) clearTimeout(venueTimer);
      venueTimer = setTimeout(async () => {
        const v = venueInput.value.trim();
        if (!v) { venueHint.textContent = ''; return; }
        const r = await this.plugin.lookupJournal(v);
        venueHint.textContent = r.found
          ? [r.cas ? `中科院${r.cas}${r.casTop ? '·Top' : ''}` : '', r.xr ? `新锐${r.xr}` : '', r.ccf ? `CCF-${r.ccf.grade}` : '', r.cast ? `科协${r.cast}` : '', r.warn ? `⚠️${r.warn}` : ''].filter(Boolean).join(' · ')
          : '（未收录，可照常保存）';
      }, 250);
    };"""
assert old in src, 'venue anchor'
src = src.replace(old, new)

# ── 3) createPaperNote 自动写入分级字段 ──
old = """  async createPaperNote(data, open = true) {
    const folder = this.settings.libFolder;
    await this.ensureFolder(folder);"""
new = """  async createPaperNote(data, open = true) {
    const folder = this.settings.libFolder;
    await this.ensureFolder(folder);
    let zoneFm = {};
    if (data.venue) {
      const r = await this.lookupJournal(data.venue);
      if (r.found) {
        zoneFm = {
          cas: r.cas || '', casTop: !!r.casTop, xr: r.xr || '',
          ccf: r.ccf ? r.ccf.grade : '', cast: r.cast || '',
        };
      }
    }"""
assert old in src, 'createPaperNote anchor'
src = src.replace(old, new)

old = "      `added: ${todayKey()}`,"
new = """      ...(zoneFm.cas ? [`cas: ${zoneFm.cas}`] : []),
      ...(zoneFm.casTop ? ['cas_top: true'] : []),
      ...(zoneFm.xr ? [`xr_zone: ${zoneFm.xr}`] : []),
      ...(zoneFm.ccf ? [`ccf: ${zoneFm.ccf}`] : []),
      ...(zoneFm.cast ? [`cast_tier: ${zoneFm.cast}`] : []),
      `added: ${todayKey()`,"""
# 上面故意留错，避免误替换；正确写法：
new = new.replace("`added: ${todayKey()`", "`added: ${todayKey()}`,")
assert old in src, 'added anchor'
src = src.replace(old, new, 1)

# ── 4) getPapers 读新字段 ──
old = "        pdf: fm.pdf || '',\n        summary: typeof fm.summary === 'string' ? fm.summary : '',\n        project: typeof fm.project === 'string' ? fm.project : '',"
new = """        pdf: fm.pdf || '',
        summary: typeof fm.summary === 'string' ? fm.summary : '',
        project: typeof fm.project === 'string' ? fm.project : '',
        fmCas: typeof fm.cas === 'string' ? fm.cas : '',
        fmCasTop: fm.cas_top === true,
        fmXr: typeof fm.xr_zone === 'string' ? fm.xr_zone : '',
        fmCcf: typeof fm.ccf === 'string' ? fm.ccf : '',
        fmTier: typeof fm.cast_tier === 'string' ? fm.cast_tier : '',"""
assert old in src, 'getPapers anchor'
src = src.replace(old, new)

# ── 5) zoneBadge 支持全维度 ──
old = """  zoneBadge(zone) {
    if (!zone) return null;
    const el = document.createElement('span');
    el.className = 'jrs-zone-badge';
    el.textContent = `${zone.abbr} ${zone.cas}`;
    el.setAttribute('data-zone', zone.cas.includes('1区') ? 'top' : zone.cas.includes('EI') ? 'cn' : 'mid');
    el.title = `中科院分区：${zone.cas}${zone.jcr ? ' · JCR ' + zone.jcr : ''}（参考值，以最新官方表为准）`;
    return el;
  }"""
new = """  zoneBadge(zone) {
    if (!zone) return null;
    const el = document.createElement('span');
    el.className = 'jrs-zone-badge';
    const bits = [];
    if (zone.cas) bits.push(`中科院${zone.cas}${zone.top ? '·Top' : ''}`);
    if (zone.xr) bits.push(`新锐${zone.xr}`);
    if (zone.ccf) bits.push(`CCF-${zone.ccf}`);
    if (zone.tier) bits.push(`科协${zone.tier}`);
    if (!bits.length) return null;
    el.textContent = bits.join(' · ');
    el.setAttribute('data-zone', (zone.cas || '').includes('1区') || (zone.ccf || '').startsWith('A') || ['A', 'T1'].includes(zone.tier) ? 'top' : (zone.xr || '') ? 'cn' : 'mid');
    el.title = '分区/分级为参考值，以最新官方表为准';
    return el;
  }"""
assert old in src, 'zoneBadge anchor'
src = src.replace(old, new)

# ── 6) 文献库卡优先 frontmatter 分级 ──
old = "    const zone = this.plugin.zoneOf(p.venue);\n    if (zone) { const zb = this.plugin.zoneBadge(zone); if (zb) meta.appendChild(zb); }\n    const parts = [p.year, p.venue, p.authorsShort].filter(Boolean);"
new = "    const zone = (p.fmCas || p.fmXr || p.fmCcf || p.fmTier) ? { cas: p.fmCas, top: p.fmCasTop, xr: p.fmXr, ccf: p.fmCcf, tier: p.fmTier } : this.plugin.zoneOf(p.venue);\n    if (zone) { const zb = this.plugin.zoneBadge(zone); if (zb) meta.appendChild(zb); }\n    const parts = [p.year, p.venue, p.authorsShort].filter(Boolean);"
assert old in src, 'lib zone anchor'
src = src.replace(old, new)

open('main.js', 'w', encoding='utf-8').write(src)
print('全部 6 处落位 ✓')
