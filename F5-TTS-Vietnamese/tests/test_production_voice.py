"""
Production Engine Integration Test
===================================
Validates that CLI, API, and VoiceService default to `v2_micro_dynamics` mode.
"""

import os
import sys
import unittest
from tido_engine.voice_service import VoiceService
from tido_voice_engine import TidoVoiceEngine
from tido_engine.api_service import SynthesizeRequest

class TestProductionVoiceEngine(unittest.TestCase):
    def setUp(self):
        self.service = VoiceService()
        self.cli_engine = TidoVoiceEngine()

    def test_voice_service_default_mode(self):
        """Verify VoiceService defaults to v2_micro_dynamics"""
        import inspect
        sig = inspect.signature(self.service.synthesize)
        default_mode = sig.parameters["pipeline_mode"].default
        self.assertEqual(default_mode, "v2_micro_dynamics", "VoiceService default mode MUST be v2_micro_dynamics")

    def test_api_service_default_mode(self):
        """Verify FastAPI request model defaults to v2_micro_dynamics"""
        req = SynthesizeRequest(script={"segments": [{"text": "Xin chào"}]})
        self.assertEqual(req.pipeline_mode, "v2_micro_dynamics", "API SynthesizeRequest default mode MUST be v2_micro_dynamics")

    def test_cli_default_mode(self):
        """Verify CLI engine default mode parameter"""
        import inspect
        sig = inspect.signature(self.cli_engine.process_script)
        default_mode = sig.parameters["pipeline_mode"].default
        self.assertEqual(default_mode, "v2_micro_dynamics", "CLI default mode MUST be v2_micro_dynamics")

if __name__ == "__main__":
    unittest.main()
