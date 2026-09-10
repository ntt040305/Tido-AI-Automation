# -*- coding: utf-8 -*-
"""Scan for literal control characters that should have been regex escapes."""
import io, os, sys

BS = chr(8)      # backspace  — should have been \b
FF = chr(12)     # form feed  — should have been \f
VT = chr(11)     # vertical tab — should have been \v

roots = ["lib/image-engine", "app", "data/cios-knowledge", "components"]
hits = []
for root in roots:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ("node_modules", ".next", ".verify-build")]
        for fn in filenames:
            if not fn.endswith((".ts", ".tsx", ".yaml", ".json", ".md")):
                continue
            p = os.path.join(dirpath, fn)
            try:
                t = io.open(p, encoding="utf-8").read()
            except Exception:
                continue
            counts = {"\\b": t.count(BS), "\\f": t.count(FF), "\\v": t.count(VT)}
            if any(counts.values()):
                hits.append((p, counts))

if not hits:
    print("clean: no literal control characters found")
else:
    print("CORRUPTED FILES (%d):" % len(hits))
    for p, c in hits:
        print("  %s  %s" % (p.replace(os.sep, "/"), {k: v for k, v in c.items() if v}))

# Repair: literal backspace was always meant to be a regex word boundary.
if "--fix" in sys.argv:
    fixed = 0
    for p, c in hits:
        t = io.open(p, encoding="utf-8").read()
        t2 = t.replace(BS, "\\b").replace(FF, "\\f").replace(VT, "\\v")
        if t2 != t:
            io.open(p, "w", encoding="utf-8").write(t2)
            fixed += 1
    print("\nrepaired %d file(s)" % fixed)
