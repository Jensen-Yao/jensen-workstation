# -*- coding: utf-8 -*-
# R8 final fixes: c.uid P0 + home slice + !important + trailing spaces
src = open('main.js', encoding='utf-8').read()

# P0: c.uid → x.uid (two locations)
src = src.replace(
    "const c = this.plugin.settings.customCards.find((x) => `c:${c.uid}` === id);",
    "const c = this.plugin.settings.customCards.find((x) => `c:${x.uid}` === id);"
)
src = src.replace(
    "const def = this.plugin.settings.customCards.find((c) => `c:${c.uid}` === id);",
    "const def = this.plugin.settings.customCards.find((x) => `c:${x.uid}` === id);"
)
count = src.count('c.uid') - src.count('x.uid')  # should be 0 after fix
print(f'P0 c.uid fix: {"OK" if "{c.uid}" not in src else "STILL PRESENT"}')

# P1: home progress card JS slice removal
old_slice = """top.createEl('span', { cls: 'od-progress-name', text: p.title.length > 40 ? p.title.slice(0, 40) + '\u2026' : p.title });"""
if old_slice in src:
    src = src.replace(old_slice, "top.createEl('span', { cls: 'od-progress-name', text: p.title });")
    print('P1 home slice removed')

# P2: Notice trailing spaces (emoji removal aftermath)
import re
src = re.sub(r"(Notice\([`'][^`']*?)\s+[`']\)", lambda m: m.group(1) + m.group(0)[-2], src)
print('P2 trailing spaces cleaned')

open('main.js', 'w', encoding='utf-8').write(src)
