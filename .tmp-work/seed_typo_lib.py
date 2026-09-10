# -*- coding: utf-8 -*-
"""Typography emitter for Phase 2.1B Batch 4.

Enforces the Batch 4 profile contract so no object can be written without the
six typographic reasoning fields.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import seed_lib
from seed_lib import K


def TYPO(kid, name, sub,
         purpose, visual_effect, signal, hierarchy_rule, spacing_rule, failure,
         problem, decision, reasoning, why,
         use, avoid, adv, lim, suit, unsuit, alts, aps,
         impact, iscore=8, prio=8, conf=0.86,
         ind="*", cat="*", aud="*", obj="*", ch="*", asset="*", pos="*",
         stages=None, ktype="decision_rule", related=None, human=None, viet=None):
    assert kid.startswith("typography."), kid
    for label, v in (("purpose", purpose), ("visual_effect", visual_effect),
                     ("signal", signal), ("hierarchy_rule", hierarchy_rule),
                     ("spacing_rule", spacing_rule), ("failure", failure)):
        assert v and len(v) > 20, "thin %s on %s" % (label, kid)
    assert len(aps) >= 1, "typography objects need an anti-pattern: " + kid

    profile = [("kind", "typography"),
               ("personality", signal),
               ("purpose", purpose),
               ("visual_effect", visual_effect),
               ("psychological_signal", signal),
               ("hierarchy_rule", hierarchy_rule),
               ("spacing_rule", spacing_rule),
               ("failure_pattern", failure)]
    if viet:
        profile.append(("vietnamese_note", viet))

    K(kid, name, "typography", sub,
      ktype=ktype, stages=stages or ["design"],
      ind=ind, cat=cat, aud=aud, obj=obj, ch=ch, asset=asset, pos=pos,
      problem=problem, decision=decision, reasoning=reasoning, why=why,
      use=use, avoid=avoid, adv=adv, lim=lim, suit=suit, unsuit=unsuit,
      alts=alts, aps=aps, human=human, profile=profile,
      impact=impact, iscore=iscore, prio=prio, conf=conf, related=related)


def flush():
    seed_lib.flush()
