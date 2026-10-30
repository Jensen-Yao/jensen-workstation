# -*- coding: utf-8 -*-
import re
src = open('main.js', encoding='utf-8').read()

# Pattern: Notice('text'; or Notice(`text`; → add closing )
# Safe: only match Notice followed by quoted string then semicolon (no closing paren)
pattern = re.compile(r"(Notice\((?:'[^']*'|`[^`]*`))\s*;")
src = pattern.sub(r"\1);", src)

open('main.js', 'w', encoding='utf-8').write(src)

# Verify
lines = src.split('\n')
bad = []
for i, l in enumerate(lines):
    if 'Notice(' in l:
        stripped = l.rstrip()
        if stripped.endswith(';') and not stripped.endswith(');') and not stripped.endswith('));'):
            bad.append((i+1, stripped[-50:]))
print(f"Fixed. Remaining bad lines: {len(bad)}")
for ln, txt in bad[:5]:
    print(f"  L{ln}: ...{txt}")
