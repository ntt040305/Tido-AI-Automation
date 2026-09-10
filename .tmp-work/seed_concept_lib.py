# -*- coding: utf-8 -*-
"""Phase 4.0 emitter for creative concept knowledge.

Enforces the one property that matters: a concept object must never carry
execution language. Its `decision` becomes a campaign's big idea verbatim, and
ConceptQualityGate rejects any big idea containing a measurement, a frame
reference or craft vocabulary. So the same prohibitions are asserted at
authoring time — catching it here costs a stack trace, catching it downstream
costs a whole benchmark run.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seed_lib
from seed_lib import K

# Mirrors ConceptQualityGate. Kept in sync deliberately: authoring-time and
# runtime rejection must agree, or objects pass here and fail in production.
BANNED = [
    (r"\b\d+(\.\d+)?\s*(percent|%|mm|pt|px|degrees?)", "production quantity"),
    (r"\b(four|three|two|five|six)[- ]to[- ](one|two|three|five)\b", "ratio"),
    (r"\b(upper|lower|left|right|top|bottom)\s+(third|half|quarter)", "frame band"),
    (r"\bframe\s+(height|width|edge|centre|center)\b", "frame reference"),
    (r"\b(centre|center)\s+axis\b", "compositional axis"),
    (r"\brule of thirds\b", "compositional rule"),
    (r"\bnegative space\b", "layout property"),
    (r"\b(safe area|margin|gutter|grid|column)s?\b", "layout mechanism"),
    (r"\b\d{2,3}\s?mm\b|\bf/\d", "camera setting"),
    (r"\b(lens|focal length|depth of field|aperture|shutter|ISO)\b", "camera control"),
    (r"\b(eye[- ]level|low angle|high angle|top[- ]down|overhead)\b", "camera angle"),
    (r"\b(key ?light|fill light|rim light|backlight|softbox|scrim|bounce)\b", "lighting instrument"),
    (r"\b(diffused?|specular|luminance|contrast ratio|kelvin|white balance)\b", "lighting property"),
    (r"\b(tracking|leading|kerning|letter[- ]spacing|x[- ]height|baseline)\b", "typographic control"),
    (r"\b(serif|sans|grotesque|typeface|font)\b", "typeface class"),
    (r"\b(type|typographic)\s+(level|hierarchy|scale)s?\b", "type hierarchy"),
    (r"\b(pore structure|specular highlight|matte finish|gloss|sheen)\b", "surface property"),
]

_ids = set()


def _clean(label, text, kid):
    for pattern, why in BANNED:
        m = re.search(pattern, text, re.I)
        assert not m, 'execution language in %s of %s: "%s" (%s)' % (label, kid, m.group(0), why)


def CONCEPT(kid, name, domain, sub, tension, insight, trigger, belief, territory,
            decision, reasoning, why, problem, impact,
            use, avoid, adv, lim, suit, unsuit, alts, aps,
            examples=None, avoid_patterns=None,
            ind="*", cat="*", aud="*", obj="*", ch="*", pos="*",
            iscore=8, prio=8, conf=0.85, related=None, human=None):
    assert kid not in _ids, "duplicate " + kid
    _ids.add(kid)
    assert kid.startswith(domain + "."), "%s must start with %s." % (kid, domain)

    # The decision becomes a big idea verbatim, so it carries the strictest bar.
    _clean("decision", decision, kid)
    _clean("human_tension", tension, kid)
    _clean("consumer_insight", insight, kid)
    _clean("campaign_territory", territory, kid)

    for label, v in (("tension", tension), ("insight", insight), ("trigger", trigger),
                     ("belief", belief), ("territory", territory)):
        assert v and len(v) > 25, "thin %s on %s" % (label, kid)
    assert len(aps) >= 1, "concept objects need an anti-pattern: " + kid

    profile = [
        ("kind", "creative_concept_pattern"),
        ("human_tension", tension),
        ("consumer_insight", insight),
        ("emotional_trigger", trigger),
        ("belief_shift", belief),
        ("campaign_territory", territory),
    ]
    if examples:
        profile.append(("example_applications", examples))
    if avoid_patterns:
        profile.append(("avoid_patterns", avoid_patterns))
    if ind != "*":
        profile.append(("industries", ind if isinstance(ind, list) else [ind]))

    K(kid, name, domain, sub,
      ktype="decision_rule", stages=["strategy", "concept"],
      ind=ind, cat=cat, aud=aud, obj=obj, ch=ch, asset="*", pos=pos,
      problem=problem, decision=decision, reasoning=reasoning, why=why,
      use=use, avoid=avoid, adv=adv, lim=lim, suit=suit, unsuit=unsuit,
      alts=alts, aps=aps, human=human, profile=profile,
      impact=impact, iscore=iscore, prio=prio, conf=conf, related=related)


def flush():
    seed_lib.flush()
    print("concept objects written: %d" % len(_ids))
