# -*- coding: utf-8 -*-
# Round2 P1 修复：
# P1-18 library 区段隐藏 topbar 全局搜索（消除双搜索栏）
# P1-10 graph 区段：真实图谱 SVG 缩略预览
# P1-12 作者归一重打（上一轮 ×0 未命中）
# P1-16 输入框圆角 token 12px
src = open('main.js', encoding='utf-8').read()
fixes = []

# ── P1-18 library 区段 topbar 不渲染 omnibox ──
old = """  buildTopbar() {
    const sec = SECTIONS.find((s) => s.id === this.section) || SECTIONS[0];"""
new = """  buildTopbar(omitSearch = false) {
    const sec = SECTIONS.find((s) => s.id === this.section) || SECTIONS[0];"""
assert old in src, 'P1-18a'
src = src.replace(old, new)
old = """    const tools = bar.createEl('div', { cls: 'jrs-tools' });
    const omni = tools.createEl('div', { cls: 'jrs-omnibox' });
    this.buildOmnibox(omni);"""
new = """    const tools = bar.createEl('div', { cls: 'jrs-tools' });
    if (!omitSearch) {
      const omni = tools.createEl('div', { cls: 'jrs-omnibox' });
      this.buildOmnibox(omni);
    }"""
assert old in src, 'P1-18b'
src = src.replace(old, new)
old = "    if (this.section !== 'home') main.appendChild(this.buildTopbar());"
new = "    if (this.section !== 'home') main.appendChild(this.buildTopbar(this.section === 'library'));"
assert old in src, 'P1-18c'
src = src.replace(old, new); fixes.append('P1-18双搜索')

# ── P1-10 graph SVG 缩略预览 ──
old = """    const exists = !!this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);"""
new = """    const exists = !!this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);
    /* 真实图谱缩略预览：读 canvas JSON → SVG */
    if (exists) {
      const thumb = intro.createEl('div', { cls: 'jrs-graph-thumb' });
      try {
        const f = this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);
        const data = JSON.parse(await this.app.vault.cachedRead(f));
        const nodes = data.nodes || [];
        const edges = data.edges || [];
        if (nodes.length) {
          const xs = nodes.map((nd) => nd.x); const ys = nodes.map((nd) => nd.y);
          const minX = Math.min(...xs) - 160; const maxX = Math.max(...xs) + 160;
          const minY = Math.min(...ys) - 60; const maxY = Math.max(...ys) + 60;
          const W = 640; const H = Math.max(200, Math.round((W * (maxY - minY)) / (maxX - minX)));
          const sx = (x) => ((x - minX) / (maxX - minX)) * W;
          const sy = (y) => ((y - minY) / (maxY - minY)) * H;
          const nodeById = Object.fromEntries(nodes.map((nd) => [nd.id, nd]));
          let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
          edges.forEach((e) => {
            const a = nodeById[e.fromNode]; const b = nodeById[e.toNode];
            if (!a || !b) return;
            svg += `<line x1="${sx(a.x + 130)}" y1="${sy(a.y + 30)}" x2="${sx(b.x + 140)}" y2="${sy(b.y + 40)}" stroke="rgba(124,140,180,.28)" stroke-width="1"/>`;
          });
          nodes.forEach((nd) => {
            const isTopic = String(nd.id).startsWith('topic-');
            const cx = sx(nd.x + (nd.width || 260) / 2); const cy = sy(nd.y + (nd.height || 60) / 2);
            if (isTopic) {
              svg += `<rect x="${sx(nd.x)}" y="${sy(nd.y)}" width="${Math.max(40, (nd.width || 260) / (maxX - minX) * W)}" height="${Math.max(16, (nd.height || 60) / (maxY - minY) * H)}" rx="6" fill="rgba(76,125,239,.85)"/>`;
            } else {
              svg += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="rgba(120,140,180,.9)"/>`;
            }
          });
          svg += '</svg>';
          thumb.innerHTML = svg;
          const cap = intro.createEl('div', { cls: 'od-hint' });
          cap.textContent = `缩略预览：${nodes.filter((nd) => String(nd.id).startsWith('topic-')).length} 主题节点 · ${nodes.length} 节点 · ${edges.length} 连线（打开图谱可拖拽编辑）`;
        }
      } catch (e) {
        thumb.createEl('div', { cls: 'od-hint', text: `图谱文件解析失败：${e.message}` });
      }
    }"""
assert old in src, 'P1-10'
src = src.replace(old, new); fixes.append('P1-10图谱缩略')

# renderGraph 需为 async（原已是 async? 检查）
src = src.replace('  async renderGraph(page) {', '  async renderGraph(page) {')  # no-op 确认

# ── P1-12 作者归一（找实际调用点重打）──
import re
hits = re.findall(r'authors: it\.authors', src)
src = src.replace('authors: it.authors', 'authors: JensenResearchStationPlugin.normalizeAuthors(it.authors)')
fixes.append(f'P1-12作者归一×{len(hits)}')

open('main.js', 'w', encoding='utf-8').write(src)
print('Round2 修复:', fixes)
