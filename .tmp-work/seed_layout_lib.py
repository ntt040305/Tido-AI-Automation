# -*- coding: utf-8 -*-
"""Layout-specific emitter for Phase 2.1B.

Wraps seed_lib.K and enforces the layout framework contract: every object must
carry purpose, structure, visual hierarchy, eye movement and a failure pattern,
alongside the core use_when / avoid_when / trade_off the schema already requires.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seed_lib
from seed_lib import K


def LAY(kid, name, sub, purpose, structure, hierarchy, eye, failure,
        problem, decision, reasoning, why,
        use, avoid, adv, lim, suit, unsuit, alts, aps,
        impact, iscore=8, prio=8, conf=0.86,
        ind="*", cat="*", aud="*", obj="*", ch="*", asset="*", pos="*",
        stages=None, ktype="decision_rule", related=None, human=None):
    """Emit one layout knowledge object with a complete layout profile."""
    assert kid.startswith("layout."), kid
    assert len(hierarchy) >= 2, "visual hierarchy needs at least two ranked elements: " + kid
    assert len(purpose) > 20 and len(structure) > 20, "thin profile: " + kid
    assert len(eye) > 20 and len(failure) > 25, "thin eye/failure: " + kid
    assert len(aps) >= 1, "layout objects need at least one anti-pattern: " + kid

    K(kid, name, "layout", sub,
      ktype=ktype, stages=stages or ["design"],
      ind=ind, cat=cat, aud=aud, obj=obj, ch=ch, asset=asset, pos=pos,
      problem=problem, decision=decision, reasoning=reasoning, why=why,
      use=use, avoid=avoid, adv=adv, lim=lim, suit=suit, unsuit=unsuit,
      alts=alts, aps=aps, human=human,
      profile=[("kind", "layout"), ("purpose", purpose), ("structure", structure),
               ("visual_hierarchy", hierarchy), ("eye_movement", eye),
               ("failure_pattern", failure)],
      impact=impact, iscore=iscore, prio=prio, conf=conf, related=related)


def flush():
    seed_lib.flush()
