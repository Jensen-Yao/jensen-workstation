# v0.10.1 UI 调整：侧栏压缩 + Hero 居中样式
css = open('F:/OrbitDesk/styles.css', encoding='utf-8').read()

# ── 侧栏压缩：替换原 brand/nav/bottom 相关规则 ──
old = """.jrs-sidebar {
  width: 208px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--background-modifier-border);
  background: color-mix(in srgb, var(--background-secondary) var(--od-card-alpha, 92%), transparent);
  backdrop-filter: blur(var(--od-blur, 18px)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--od-blur, 18px)) saturate(150%);
  padding: 14px 10px;
  gap: 10px;
  z-index: 2;
}"""
new = """.jrs-sidebar {
  width: 190px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--background-modifier-border);
  background: color-mix(in srgb, var(--background-secondary) var(--od-card-alpha, 92%), transparent);
  backdrop-filter: blur(var(--od-blur, 18px)) saturate(150%);
  -webkit-backdrop-filter: blur(var(--od-blur, 18px)) saturate(150%);
  padding: 8px 7px;
  gap: 5px;
  z-index: 2;
}"""
assert old in css, 'sidebar'
css = css.replace(old, new)

old = """.jrs-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 12px;
  border-bottom: 1px dashed var(--background-modifier-border);
}"""
new = """.jrs-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px 7px;
  border-bottom: 1px dashed var(--background-modifier-border);
}"""
assert old in css, 'brand'
css = css.replace(old, new)

old = """.jrs-brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--od-accent);
  color: var(--od-accent-text);
  flex-shrink: 0;
}"""
new = """.jrs-brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border-radius: 8px;
  background: var(--od-accent);
  color: var(--od-accent-text);
  flex-shrink: 0;
}"""
assert old in css, 'mark'
css = css.replace(old, new)

old = """.jrs-brand-mark svg { width: 18px; height: 18px; }"""
new = """.jrs-brand-mark svg { width: 14px; height: 14px; }"""
assert old in css
css = css.replace(old, new)

old = """.jrs-brand-name {
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-normal);
  line-height: 1.2;
  white-space: nowrap;
}"""
new = """.jrs-brand-name {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-normal);
  line-height: 1.15;
  white-space: nowrap;
}"""
assert old in css
css = css.replace(old, new)

old = """.jrs-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--od-radius-m);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background var(--od-transition), color var(--od-transition), transform 100ms ease-out;
}"""
new = """.jrs-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: var(--od-radius-m);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background var(--od-transition), color var(--od-transition), transform 100ms ease-out;
}"""
assert old in css, 'nav'
css = css.replace(old, new)

old = """.jrs-nav-icon svg { width: 16px; height: 16px; }"""
new = """.jrs-nav-icon svg { width: 14px; height: 14px; }"""
assert old in css
css = css.replace(old, new)

old = """.jrs-sidebar-bottom {
  border-top: 1px dashed var(--background-modifier-border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}"""
new = """.jrs-sidebar-bottom {
  border-top: 1px dashed var(--background-modifier-border);
  padding-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}"""
assert old in css, 'bottom'
css = css.replace(old, new)

# ── Hero 居中版式 ──
old = """.jrs-hero {
  padding: 30px 6px 14px;
  margin-bottom: 4px;
}"""
new = """/* 居中版 Hero（v0.10.1） */
.jrs-hero.jrs-hero-center {
  padding: 34px 20px 16px;
  margin-bottom: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.jrs-hero-center .jrs-hero-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.jrs-hero-center .jrs-hero-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  background: var(--od-accent-soft);
  color: var(--od-accent);
}

.jrs-hero-center .jrs-hero-logo svg { width: 21px; height: 21px; }

.jrs-hero-center .jrs-hero-name {
  margin: 0;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--text-normal);
}

.jrs-hero-center .jrs-hero-sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.jrs-hero-center .jrs-hero-omni {
  width: min(640px, 92%);
  margin-top: 4px;
}

.jrs-hero-center .jrs-hero-actions {
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}

/* 旧 hero 布局（非居中场景保留） */
.jrs-hero {
  padding: 30px 6px 14px;
  margin-bottom: 4px;
}"""
assert old in css, 'hero'
css = css.replace(old, new)

open('F:/OrbitDesk/styles.css', 'w', encoding='utf-8').write(css)
print('侧栏压缩 + Hero 居中样式 ✓')
