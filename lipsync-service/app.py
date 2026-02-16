import os
import subprocess
import sys
import tempfile
import shutil
import uuid

import cv2
import numpy as np
import torch

# Add Wav2Lip to Python path so we can import its modules directly
W2L = "/app/Wav2Lip"
sys.path.insert(0, W2L)

import audio
import face_detection
from models import Wav2Lip as Wav2LipModel

import google.auth
import google.auth.transport.requests
import requests as http_requests
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

CHK = "/models/wav2lip_gan.pth"
FACE = "/app/geoff.png"
IMG_SIZE = 96
MEL_STEP_SIZE = 16
FPS = 25.0
PADS = [0, 10, 0, 0]  # top, bottom, left, right
WAV2LIP_BATCH_SIZE = 128

app = FastAPI(title="Geoff Lipsync Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Persistent state loaded once at startup ---

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[startup] Using {device} for inference")

# Load Wav2Lip model into GPU memory — this persists across requests
print(f"[startup] Loading Wav2Lip model from {CHK}...")
_checkpoint = torch.load(CHK) if device == "cuda" else torch.load(CHK, map_location="cpu")
_model = Wav2LipModel()
_model.load_state_dict({k.replace("module.", ""): v for k, v in _checkpoint["state_dict"].items()})
_model = _model.to(device).eval()
del _checkpoint
print("[startup] Wav2Lip model loaded and ready")

# Pre-detect face in geoff.png — this never changes so do it once
print(f"[startup] Running face detection on {FACE}...")
_face_frame = cv2.imread(FACE)
_detector = face_detection.FaceAlignment(face_detection.LandmarksType._2D, flip_input=False, device=device)
_det_results = _detector.get_detections_for_batch(np.array([_face_frame]))
if _det_results[0] is None:
    raise RuntimeError("Face not detected in geoff.png!")
rect = _det_results[0]
pady1, pady2, padx1, padx2 = PADS
_face_coords = (
    max(0, rect[1] - pady1),
    min(_face_frame.shape[0], rect[3] + pady2),
    max(0, rect[0] - padx1),
    min(_face_frame.shape[1], rect[2] + padx2),
)
del _detector
print(f"[startup] Face detected at coords {_face_coords}")
print("[startup] Ready to serve requests")

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


def run_wav2lip_inprocess(audio_path: str, out_path: str):
    """Run Wav2Lip inference using the pre-loaded model and cached face detection."""
    # Convert audio to wav if needed
    wav_path = audio_path
    if not audio_path.endswith(".wav"):
        wav_path = audio_path.rsplit(".", 1)[0] + ".wav"
        subprocess.check_call(
            ["ffmpeg", "-y", "-i", audio_path, "-strict", "-2", wav_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    # Load audio and compute mel spectrogram
    wav = audio.load_wav(wav_path, 16000)
    mel = audio.melspectrogram(wav)

    if np.isnan(mel.reshape(-1)).sum() > 0:
        raise ValueError("Mel contains nan!")

    # Chunk mel spectrogram by frame rate
    mel_chunks = []
    mel_idx_multiplier = 80.0 / FPS
    i = 0
    while True:
        start_idx = int(i * mel_idx_multiplier)
        if start_idx + MEL_STEP_SIZE > len(mel[0]):
            mel_chunks.append(mel[:, len(mel[0]) - MEL_STEP_SIZE:])
            break
        mel_chunks.append(mel[:, start_idx: start_idx + MEL_STEP_SIZE])
        i += 1

    # Static image: one frame repeated
    full_frames = [_face_frame.copy()]
    y1, y2, x1, x2 = _face_coords
    face_crop = _face_frame[y1:y2, x1:x2]

    # Build batches
    frame_h, frame_w = _face_frame.shape[:2]
    tmp_avi = out_path.rsplit(".", 1)[0] + ".avi"
    out_video = cv2.VideoWriter(tmp_avi, cv2.VideoWriter_fourcc(*"DIVX"), FPS, (frame_w, frame_h))

    img_batch, mel_batch, frame_batch, coords_batch = [], [], [], []

    for m in mel_chunks:
        face = cv2.resize(face_crop, (IMG_SIZE, IMG_SIZE))
        img_batch.append(face)
        mel_batch.append(m)
        frame_batch.append(_face_frame.copy())
        coords_batch.append(_face_coords)

        if len(img_batch) >= WAV2LIP_BATCH_SIZE:
            _process_batch(img_batch, mel_batch, frame_batch, coords_batch, out_video)
            img_batch, mel_batch, frame_batch, coords_batch = [], [], [], []

    if len(img_batch) > 0:
        _process_batch(img_batch, mel_batch, frame_batch, coords_batch, out_video)

    out_video.release()

    # Mux audio + video with ffmpeg
    subprocess.check_call(
        ["ffmpeg", "-y", "-i", wav_path, "-i", tmp_avi, "-strict", "-2", "-q:v", "1", out_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    os.remove(tmp_avi)


def _process_batch(img_batch, mel_batch, frame_batch, coords_batch, out_video):
    """Run model inference on a batch and write frames to video."""
    img_arr = np.asarray(img_batch)
    mel_arr = np.asarray(mel_batch)

    img_masked = img_arr.copy()
    img_masked[:, IMG_SIZE // 2:] = 0

    img_input = np.concatenate((img_masked, img_arr), axis=3) / 255.0
    mel_input = mel_arr.reshape(len(mel_arr), mel_arr.shape[1], mel_arr.shape[2], 1)

    img_tensor = torch.FloatTensor(np.transpose(img_input, (0, 3, 1, 2))).to(device)
    mel_tensor = torch.FloatTensor(np.transpose(mel_input, (0, 3, 1, 2))).to(device)

    with torch.no_grad():
        pred = _model(mel_tensor, img_tensor)

    pred = pred.cpu().numpy().transpose(0, 2, 3, 1) * 255.0

    for p, f, c in zip(pred, frame_batch, coords_batch):
        y1, y2, x1, x2 = c
        p = cv2.resize(p.astype(np.uint8), (x2 - x1, y2 - y1))
        f[y1:y2, x1:x2] = p
        out_video.write(f)


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": True, "device": device}


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
        wav_bytes = get_tts_audio(text)
        with open(aud_path, "wb") as f:
            f.write(wav_bytes)

        run_wav2lip_inprocess(aud_path, out_path)

        with open(out_path, "rb") as f:
            video_bytes = f.read()

        return Response(content=video_bytes, media_type="video/mp4")

    except http_requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"TTS API error: {e}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}") from e
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

        run_wav2lip_inprocess(aud_path, out_path)

        with open(out_path, "rb") as f:
            video_bytes = f.read()

        return Response(content=video_bytes, media_type="video/mp4")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}") from e
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
