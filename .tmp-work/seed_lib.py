# -*- coding: utf-8 -*-
"""Shared emitter for Phase 2.1 knowledge seeding.

Writes one V2-compliant YAML object per call. Every field required by the
quality gate is either supplied or defaulted deliberately — nothing is
auto-generated as filler, because an object that only exists to pass the gate is
exactly what the gate is for.
"""
import io, os

BASE = "data/cios-knowledge"
_written = []


def _yaml_str(v):
    """Quote only when YAML would otherwise misread the value."""
    s = str(v)
    if s == "*":
        return '"*"'
    if any(c in s for c in ':#{}[]&*!|>%@`"\'\n') or s.strip() != s:
        return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
    return s


def _block(text, indent=2):
    """Folded scalar for prose, so long sentences stay readable in the file."""
    words = str(text).split()
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 > 76:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    pad = " " * indent
    return ">-\n" + "\n".join(pad + l for l in lines)


def _ctx(v):
    if isinstance(v, list):
        return "[" + ", ".join(_yaml_str(x) for x in v) + "]"
    return _yaml_str(v)


def K(kid, name, domain, sub, ktype="decision_rule", stages=None,
      ind="*", cat="*", aud="*", obj="*", ch="*", asset="*", pos="*",
      problem="", decision="", reasoning="", why="",
      use=None, avoid=None,
      adv="", lim="", suit="", unsuit="",
      alts=None, aps=None, human=None, profile=None,
      impact="", iscore=7, prio=7, conf=0.8, related=None, examples=None):
    stages = stages or ["visual_direction"]
    use = use or []
    avoid = avoid or []
    alts = alts or []
    aps = aps or []

    L = []
    L.append("knowledge_id: %s" % kid)
    L.append("name: %s" % _yaml_str(name))
    L.append("domain: %s" % domain)
    L.append("sub_domain: %s" % sub)
    L.append("knowledge_type: %s" % ktype)
    L.append("creative_stage: [%s]" % ", ".join(stages))
    L.append("context:")
    L.append("  industry: %s" % _ctx(ind))
    L.append("  category: %s" % _ctx(cat))
    L.append("  audience: %s" % _ctx(aud))
    L.append("  objective: %s" % _ctx(obj))
    L.append("  channel: %s" % _ctx(ch))
    L.append("  asset_type: %s" % _ctx(asset))
    L.append("  brand_position: %s" % _ctx(pos))
    L.append("problem: %s" % _block(problem))
    if human:
        L.append("human_insight:")
        L.append("  functional_need: %s" % _yaml_str(human[0]))
        L.append("  emotional_need: %s" % _yaml_str(human[1]))
        L.append("  social_need: %s" % _yaml_str(human[2]))
    L.append("decision: %s" % _block(decision))
    L.append("reasoning: %s" % _block(reasoning))
    L.append("why_this_works: %s" % _block(why))
    L.append("use_when:")
    for u in use:
        L.append("  - %s" % _yaml_str(u))
    L.append("avoid_when:")
    for a in avoid:
        L.append("  - %s" % _yaml_str(a))
    L.append("trade_off:")
    L.append("  advantage: %s" % _yaml_str(adv))
    L.append("  limitation: %s" % _yaml_str(lim))
    L.append("  suitable_conditions: %s" % _yaml_str(suit))
    L.append("  unsuitable_conditions: %s" % _yaml_str(unsuit))
    if alts:
        L.append("alternatives:")
        for a in alts:
            L.append("  - %s" % _yaml_str(a))
    if aps:
        L.append("anti_patterns:")
        for p, w, r in aps:
            L.append("  - problem: %s" % _yaml_str(p))
            L.append("    why_it_fails: %s" % _yaml_str(w))
            L.append("    replacement: %s" % _yaml_str(r))
    if examples:
        L.append("examples:")
        for ex in examples:
            L.append("  - problem: %s" % _yaml_str(ex[0]))
            L.append("    creative_decision: %s" % _yaml_str(ex[1]))
            L.append("    transferable_rule: %s" % _yaml_str(ex[2]))
    if profile:
        L.append("domain_profile:")
        for k, v in profile:
            if isinstance(v, list):
                L.append("  %s:" % k)
                for item in v:
                    L.append("    - %s" % _yaml_str(item))
            else:
                L.append("  %s: %s" % (k, _yaml_str(v)))
    L.append("impact: %s" % _yaml_str(impact))
    L.append("impact_score: %d" % iscore)
    L.append("priority: %d" % prio)
    L.append("confidence: %s" % conf)
    if related:
        L.append("related_knowledge:")
        for r in related:
            L.append("  - %s" % r)
    L.append("source: CIOS Phase 2.1 expansion - Core Creative Brain")

    fname = kid.replace(".", "_") + ".yaml"
    path = os.path.join(BASE, domain, fname)
    io.open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")
    _written.append(path)


def flush():
    print("  wrote %d objects" % len(_written))
