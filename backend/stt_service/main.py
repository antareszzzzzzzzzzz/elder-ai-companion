"""
Async STT Service using FastAPI + WebSocket + Amazon Transcribe Streaming.
Runs separately from the main Flask app to handle real-time audio streaming.
"""
import asyncio
import json
import os
import logging
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# --- Logging setup for STT service ---
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

stt_logger = logging.getLogger("eldercare.stt")
stt_logger.setLevel(logging.DEBUG)

_fmt = logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s", "%Y-%m-%d %H:%M:%S")

_fh = RotatingFileHandler(os.path.join(LOG_DIR, "stt.log"), maxBytes=5*1024*1024, backupCount=3, encoding="utf-8")
_fh.setLevel(logging.DEBUG)
_fh.setFormatter(_fmt)
stt_logger.addHandler(_fh)

_ch = logging.StreamHandler()
_ch.setLevel(logging.INFO)
_ch.setFormatter(_fmt)
stt_logger.addHandler(_ch)
# --- End logging setup ---

app = FastAPI(title="Elder Care AI - STT Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """WebSocket endpoint for real-time speech-to-text."""
    await websocket.accept()
    client_host = websocket.client.host if websocket.client else "unknown"
    stt_logger.info(f"WebSocket connected from {client_host}")

    try:
        # Try to use Amazon Transcribe streaming
        from amazon_transcribe.client import TranscribeStreamingClient
        from amazon_transcribe.handlers import TranscriptResultStreamHandler
        from amazon_transcribe.model import TranscriptEvent

        class TranscribeHandler(TranscriptResultStreamHandler):
            def __init__(self, stream, ws):
                super().__init__(stream)
                self.ws = ws

            async def handle_transcript_event(self, transcript_event: TranscriptEvent):
                results = transcript_event.transcript.results
                for result in results:
                    for alt in result.alternatives:
                        transcript = alt.transcript
                        if transcript:
                            msg_type = "final" if not result.is_partial else "partial"
                            msg = {"type": msg_type, "transcript": transcript}
                            stt_logger.debug(f"[{msg_type}] {transcript[:80]}")
                            await self.ws.send_json(msg)

        stt_logger.info("Starting Amazon Transcribe streaming session...")
        client = TranscribeStreamingClient(region=AWS_REGION)

        stream = await client.start_stream_transcription(
            language_code="zh-TW",
            media_sample_rate_hz=16000,
            media_encoding="pcm",
        )
        stt_logger.info("Transcribe streaming session started")

        handler = TranscribeHandler(stream.output_stream, websocket)
        handler_task = asyncio.create_task(handler.handle_events())

        chunks_received = 0
        try:
            while True:
                data = await websocket.receive_bytes()
                chunks_received += 1
                await stream.input_stream.send_audio_event(audio_chunk=data)
        except WebSocketDisconnect:
            stt_logger.info(f"WebSocket disconnected after {chunks_received} audio chunks")
        finally:
            await stream.input_stream.end_stream()
            await handler_task

    except ImportError:
        stt_logger.warning("amazon-transcribe SDK not installed, notifying client to use fallback")
        await websocket.send_json({
            "type": "fallback",
            "message": "Amazon Transcribe not available, use browser Web Speech API"
        })
        try:
            while True:
                await websocket.receive_bytes()
        except WebSocketDisconnect:
            pass

    except Exception as e:
        stt_logger.error(f"Transcribe streaming error: {type(e).__name__}: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "fallback",
                "message": f"Transcribe error: {str(e)}, use browser Web Speech API"
            })
        except Exception:
            pass
        try:
            while True:
                await websocket.receive_bytes()
        except WebSocketDisconnect:
            pass


@app.get("/health")
async def health():
    return {"status": "ok", "service": "stt"}


if __name__ == "__main__":
    import uvicorn
    stt_logger.info("=== STT Service starting on port 8001 ===")
    uvicorn.run(app, host="0.0.0.0", port=8001)
