"""
TIDO Voice Performance Engine - REST API Service (FastAPI)
===========================================================
Exposes POST /voice/synthesize endpoint for commercial integration.
Supports pipeline_mode: "v2_safe" (default), "v1", "v2_full".
"""

from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from typing import Any, Dict, Optional
import uvicorn

from tido_engine.voice_service import VoiceService

app = FastAPI(
    title="TIDO Voice Engine Commercial API",
    description="Commercial-grade Voice AI Service for Vietnamese Text-To-Speech & Dynamic Voice Cloning.",
    version="2.0.0"
)

# Global service instance
voice_service = VoiceService()

class SynthesizeRequest(BaseModel):
    script: Any
    voice_id: Optional[str] = "vo_mizaki_3"
    style: Optional[str] = "commercial_seller"
    persona: Optional[str] = "commercial_seller"
    pipeline_mode: Optional[str] = "v2_micro_dynamics"

@app.post("/voice/synthesize")
def synthesize_voice(req: SynthesizeRequest):
    try:
        res = voice_service.synthesize(
            script_input=req.script,
            voice_id=req.voice_id,
            style=req.style,
            persona=req.persona,
            pipeline_mode=req.pipeline_mode
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {"status": "healthy", "engine": "TIDO Voice Performance Engine V2"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
