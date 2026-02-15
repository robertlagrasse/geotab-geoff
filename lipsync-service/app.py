import json
import os
import subprocess
import tempfile
import shutil
import uuid

import google.auth
import google.auth.transport.requests
import requests as http_requests
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

W2L = "/app/Wav2Lip"
CHK = "/models/wav2lip_gan.pth"
FACE = "/app/geoff.png"

app = FastAPI(title="Geoff Lipsync Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache credentials for TTS calls
_credentials = None


def get_tts_audio(text: str) -> bytes:
    """Call Google Cloud TTS using Application Default Credentials."""
    global _credentials
    if _credentials is None:
        _credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    auth_req = google.auth.transport.requests.Request()
    _credentials.refresh(auth_req)

    resp = http_requests.post(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        headers={
            "Authorization": f"Bearer {_credentials.token}",
            "Content-Type": "application/json",
        },
        json={
            "input": {"text": text},
            "voice": {"languageCode": "en-US", "name": "en-US-Neural2-D"},
            "audioConfig": {
                "audioEncoding": "LINEAR16",
                "speakingRate": 0.92,
                "pitch": -1.5,
                "volumeGainDb": 2.0,
            },
        },
        timeout=15,
    )
    resp.raise_for_status()
    import base64
    return base64.b64decode(resp.json()["audioContent"])


def run_wav2lip(audio_path: str, out_path: str):
    """Run Wav2Lip inference with baked-in face image."""
    cmd = [
        "python3", "inference.py",
        "--checkpoint_path", CHK,
        "--face", FACE,
        "--audio", audio_path,
        "--outfile", out_path,
        "--pads", "0", "10", "0", "0",
    ]
    subprocess.check_call(cmd, cwd=W2L)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/speak")
async def speak(body: dict):
    """Text in, MP4 video out. Calls Cloud TTS internally."""
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Missing 'text' field")

    work = tempfile.mkdtemp(dir="/tmp")
    uid = str(uuid.uuid4())
    aud_path = os.path.join(work, "tts.wav")
    out_path = os.path.join(work, f"{uid}.mp4")

    try:
        # 1. Get TTS audio
        wav_bytes = get_tts_audio(text)
        with open(aud_path, "wb") as f:
            f.write(wav_bytes)

        # 2. Run Wav2Lip
        run_wav2lip(aud_path, out_path)

        # 3. Return MP4 binary
        with open(out_path, "rb") as f:
            video_bytes = f.read()

        return Response(content=video_bytes, media_type="video/mp4")

    except http_requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"TTS API error: {e}") from e
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail="Wav2Lip inference failed") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/lipsync")
async def lipsync(audio: UploadFile):
    """Audio file in, MP4 video out. Uses baked-in geoff.png."""
    work = tempfile.mkdtemp(dir="/tmp")
    uid = str(uuid.uuid4())
    aud_path = os.path.join(work, audio.filename or "audio.wav")
    out_path = os.path.join(work, f"{uid}.mp4")

    try:
        with open(aud_path, "wb") as f:
            f.write(await audio.read())

        run_wav2lip(aud_path, out_path)

        with open(out_path, "rb") as f:
            video_bytes = f.read()

        return Response(content=video_bytes, media_type="video/mp4")

    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail="Wav2Lip inference failed") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
