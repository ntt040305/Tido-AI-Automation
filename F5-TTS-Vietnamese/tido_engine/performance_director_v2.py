"""
TIDO Voice Performance Engine - Performance Director V2
========================================================
High-level intelligence layer that parses PerformanceScriptV2,
evaluates global and segment-level intents, and orchestrates ProsodyEngineV2.
"""

from typing import List, Dict, Any
from tido_engine.v2_schemas import PerformanceScriptV2, SegmentV2
from tido_engine.prosody_engine_v2 import VietnameseProsodyEngineV2, ProsodyExecutionPlan

class ProsodyExecutionModel:
    def __init__(self, title: str, voice_id: str, global_genre: str, execution_plans: List[ProsodyExecutionPlan]):
        self.title = title
        self.voice_id = voice_id
        self.global_genre = global_genre
        self.execution_plans = execution_plans

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "voice_id": self.voice_id,
            "global_genre": self.global_genre,
            "total_segments": len(self.execution_plans),
            "execution_plans": [plan.to_dict() for plan in self.execution_plans]
        }

class PerformanceDirectorV2:
    def __init__(self):
        self.prosody_engine = VietnameseProsodyEngineV2()

    def build_execution_model(self, script_v2: PerformanceScriptV2) -> ProsodyExecutionModel:
        """
        Parses a PerformanceScriptV2 instance and computes prosody execution plans for all segments.
        """
        script_v2.validate()
        execution_plans: List[ProsodyExecutionPlan] = []

        for seg in script_v2.segments:
            perf_dict = seg.performance.to_dict()
            perf_dict["segment_id"] = seg.segment_id
            
            plan = self.prosody_engine.compute_segment_prosody(
                text=seg.text,
                perf_dict=perf_dict
            )
            execution_plans.append(plan)

        return ProsodyExecutionModel(
            title=script_v2.title,
            voice_id=script_v2.voice_id,
            global_genre=script_v2.global_genre,
            execution_plans=execution_plans
        )
