/* 由本地 CSV 构建 vault 缓存（与 downloadJournalDB 同逻辑） */
const P = JensenResearchStationPlugin ? null : null;
const p = app.plugins.plugins['jensen-workstation'];
const parseLine = (line) => {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i += 1; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
};
return '用 python 生成更稳，此文件占位';
