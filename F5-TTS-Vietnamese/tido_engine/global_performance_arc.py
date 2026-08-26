"""
TIDO Voice Performance Engine - Global Performance Arc
======================================================
Analyzes full script narrative structure to build a dynamic energy curve across segments,
preventing flat or uniform energy delivery across long commercials/narration.
"""

from dataclasses import dataclass, asdict
from typing import List, Dict, Any
from tido_engine.v2_schemas import PerformanceScriptV2

@dataclass
class SegmentArcModifier:
    segment_id: str
    narrative_phase: str               # "opening_hook", "problem_setup", "solution_explanation", "climax_peak", "call_to_action"
    energy_arc_multiplier: float        # Multiplier applied to baseline energy (e.g. 0.90 to 1.25)
    speed_arc_multiplier: float         # Multiplier applied to baseline speed (e.g. 0.95 to 1.10)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class GlobalPerformancePlan:
    title: str
    total_segments: int
    opening_energy: float
    middle_energy: float
    peak_segment_index: int
    cta_energy: float
    segment_modifiers: List[SegmentArcModifier]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "total_segments": self.total_segments,
            "narrative_arc": {
                "opening_energy": self.opening_energy,
                "middle_energy": self.middle_energy,
                "peak_segment_index": self.peak_segment_index,
                "cta_energy": self.cta_energy
            },
            "segment_modifiers": [s.to_dict() for s in self.segment_modifiers]
        }

class GlobalPerformanceArc:
    """
    Computes global narrative arc dynamic modifiers to ensure human-like emotional progression.
    """

    @classmethod
    def compute_global_arc(cls, script_v2: PerformanceScriptV2) -> GlobalPerformancePlan:
        segments = script_v2.segments
        total = len(segments)

        if total == 0:
            return GlobalPerformancePlan(
                title=script_v2.title,
                total_segments=0,
                opening_energy=1.0,
                middle_energy=1.0,
                peak_segment_index=0,
                cta_energy=1.0,
                segment_modifiers=[]
            )

        # Identify key narrative indices
        peak_idx = total - 1  # Default climax near CTA
        for idx, seg in enumerate(segments):
            if seg.performance.segment_role == "call_to_action":
                peak_idx = idx
                break

        modifiers: List[SegmentArcModifier] = []

        for idx, seg in enumerate(segments):
            role = seg.performance.segment_role
            progress_ratio = idx / float(total) if total > 1 else 0.0

            if idx == 0 or role == "hook":
                phase = "opening_hook"
                energy_mult = 1.15
                speed_mult = 1.05
            elif idx == peak_idx or role == "call_to_action":
                phase = "call_to_action"
                energy_mult = 1.25
                speed_mult = 1.08
            elif role in ["testimonial", "narration"]:
                phase = "storytelling_intimate"
                energy_mult = 0.88
                speed_mult = 0.92
            elif progress_ratio < 0.4:
                phase = "problem_setup"
                energy_mult = 0.98
                speed_mult = 0.98
            elif progress_ratio < 0.8:
                phase = "solution_explanation"
                energy_mult = 1.02
                speed_mult = 1.00
            else:
                phase = "climax_peak"
                energy_mult = 1.18
                speed_mult = 1.04

            modifiers.append(SegmentArcModifier(
                segment_id=seg.segment_id,
                narrative_phase=phase,
                energy_arc_multiplier=round(energy_mult, 2),
                speed_arc_multiplier=round(speed_mult, 2)
            ))

        return GlobalPerformancePlan(
            title=script_v2.title,
            total_segments=total,
            opening_energy=1.15,
            middle_energy=1.00,
            peak_segment_index=peak_idx,
            cta_energy=1.25,
            segment_modifiers=modifiers
        )
