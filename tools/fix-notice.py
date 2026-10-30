# -*- coding: utf-8 -*-
src = open('main.js', encoding='utf-8').read()

# Fix broken Notice calls: pattern is Notice('text'; or Notice(`text`;
import re

# Single-quote versions missing closing paren
pattern_sq = re.compile(r"Notice\('([^']*)';")
src = pattern_sq.sub(lambda m: f"Notice('{m.group(1)}');", src)

# Backtick versions missing closing paren
pattern_bt = re.compile(r"Notice\\(`([^`]*)`;")
src = pattern_bt.sub(lambda m: f"Notice(`{m.group(1)}`);", src)

# Also fix any Notice(xxx'  ); with double space
src = src.replace("Notice('  ');", "Notice('');")

open('main.js', 'w', encoding='utf-8').write(src)
print('Notice syntax fixed')
