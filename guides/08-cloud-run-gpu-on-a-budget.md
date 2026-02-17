# Cloud Run GPU on a Budget: Wav2Lip on NVIDIA L4

## The Problem

You need GPU inference in the cloud. Your model (Wav2Lip, Whisper, Stable Diffusion, whatever) requires an NVIDIA GPU. But you're a hackathon project or small startup, not a company that needs GPUs running 24/7.

Cloud Run GPU lets you run GPU containers with pay-per-use pricing and scale-to-zero. Here's how we deployed Wav2Lip with an NVIDIA L4 GPU for ~$0.006 per inference.

## The Setup

| Component | Value |
|-----------|-------|
| Service | Cloud Run |
| GPU | NVIDIA L4 (24GB VRAM) |
| Region | us-east4 (limited availability) |
| CPU | 4 vCPU |
| Memory | 16 GiB |
| Concurrency | 1 (one request at a time) |
| Min instances | 0 (scale to zero) |
| Max instances | 1 (budget control) |
| Container image | Custom Dockerfile with CUDA + Wav2Lip |

## The Dockerfile

Key ingredients for a GPU container on Cloud Run:

```dockerfile
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Install Python, ffmpeg, and dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Install ML dependencies
RUN pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
RUN pip3 install flask numpy opencv-python-headless librosa scipy

# Copy model weights and application code
COPY wav2lip/ /app/wav2lip/
COPY server.py /app/
COPY geoff.png /app/

WORKDIR /app

# Cloud Run expects port 8080
ENV PORT=8080
EXPOSE 8080

CMD ["python3", "server.py"]
```

**Key decisions:**
- `nvidia/cuda:11.8.0-cudnn8-runtime` — runtime image, not the full toolkit (smaller image)
- `opencv-python-headless` — no GUI dependencies needed in a container
- Model weights baked into the image — no download on cold start
- Image (geoff.png) baked into the container — one fewer file to transfer per request

## Deployment

```bash
# Build and push to Artifact Registry
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/YOUR_PROJECT/YOUR_REPO/lipsync \
  --timeout=1800

# Deploy to Cloud Run with GPU
gcloud run deploy lipsync \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT/YOUR_REPO/lipsync \
  --region us-east4 \
  --gpu 1 \
  --gpu-type nvidia-l4 \
  --cpu 4 \
  --memory 16Gi \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 300 \
  --no-cpu-throttling \
  --allow-unauthenticated
```

**Important flags:**
- `--gpu 1 --gpu-type nvidia-l4` — the GPU allocation
- `--concurrency 1` — one request at a time (GPU models typically aren't thread-safe)
- `--min-instances 0` — scale to zero when idle (saves money)
- `--max-instances 1` — budget control (also quota control — L4 availability is limited)
- `--no-cpu-throttling` — full CPU even when idle (needed for model loading)
- `--timeout 300` — 5 minutes per request (inference can take time)

## The Cold Start Problem

With `min-instances=0`, the first request after idle triggers a cold start:

```
Cold start:
├── Container startup:     ~5s
├── CUDA initialization:   ~3s
├── Model weight loading:  ~8s
├── First inference:       ~10s
└── Total first request:   ~26s
```

Subsequent requests (warm):
```
Warm request:
├── Audio processing:   ~1s
├── Wav2Lip inference:  ~5-8s
├── Video encoding:     ~2s
└── Total:              ~8-10s
```

### Mitigation: In-Process Model Caching

Load the model once on startup, reuse for all requests:

```python
import torch

# Global model — loaded once, reused
_model = None

def get_model():
    global _model
    if _model is None:
        _model = load_wav2lip_model('checkpoints/wav2lip_gan.pth')
        _model = _model.cuda()
        _model.eval()
        # Warm up with a dummy inference
        dummy = torch.zeros(1, 6, 96, 96).cuda()
        with torch.no_grad():
            _model(dummy, dummy)
    return _model
```

The dummy inference forces CUDA kernel compilation. Without it, the first real inference pays the compilation cost.

### Mitigation: Application-Level Warmup

In Geoff, we warm the lipsync service when a user logs in — before they need it:

```javascript
// Frontend: fire-and-forget warmup on login
async function warmLipsync() {
  try {
    await fetch('https://lipsync-XXXXX.run.app/health', {
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    // Ignore — this is a warmup ping, not a critical call
  }
}

// Call on login
auth.onAuthStateChanged((user) => {
  if (user) warmLipsync();
});
```

The `/health` endpoint hits the container, which triggers a cold start if needed. By the time the user navigates to a coaching session (10-20 seconds later), the container is warm.

## Cost Analysis

NVIDIA L4 on Cloud Run pricing (as of Feb 2026):

| Component | Price |
|-----------|-------|
| L4 GPU | ~$0.000325/second |
| 4 vCPU | ~$0.000024/second |
| 16 GiB memory | ~$0.0000025/second |

For a 10-second Wav2Lip inference:
- GPU: $0.00325
- CPU: $0.00024
- Memory: $0.000025
- **Total: ~$0.004 per inference**

With `min-instances=0`, you pay nothing when idle. The entire GPU cost is per-inference.

For 3 videos per coaching session: **~$0.006/session.**

Compare to keeping a GPU instance running 24/7:
- 24 hours × 3600 seconds × $0.000325 = **$28.08/day** just for the GPU
- That's $842/month whether you use it or not

Scale-to-zero is essential for hackathon and early-stage projects.

## Quota Limitations

GPU availability on Cloud Run is region-specific and quota-limited:

- **us-east4** is the most reliable region for L4 GPUs
- Default quota may be 0 — you may need to request a quota increase
- No zonal redundancy (single zone) — if that zone has issues, your service is down
- Quota increases can take days — request early

```bash
# Check your quota
gcloud compute regions describe us-east4 \
  --project=YOUR_PROJECT \
  --format="table(quotas.metric,quotas.limit,quotas.usage)" \
  | grep -i gpu
```

## API Design for GPU Inference

Your GPU container should be a simple HTTP API:

```python
from flask import Flask, request, jsonify, send_file

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'gpu': torch.cuda.is_available()})

@app.route('/lipsync', methods=['POST'])
def lipsync():
    image = request.files.get('image')
    audio = request.files.get('audio')

    if not image or not audio:
        return jsonify({'error': 'Missing image or audio'}), 400

    # Process
    video_bytes = run_wav2lip(image, audio)

    # Return video
    return send_file(io.BytesIO(video_bytes), mimetype='video/mp4')
```

**Design decisions:**
- Multipart form upload for image + audio files
- Return raw video bytes (not a URL)
- `/health` endpoint for warmup pings
- No state — each request is self-contained

## Summary

| Aspect | Recommendation |
|--------|---------------|
| GPU type | NVIDIA L4 (best price/performance for inference) |
| Region | us-east4 (most L4 availability) |
| Scaling | min=0, max=1 (budget control + scale to zero) |
| Concurrency | 1 (GPU models aren't thread-safe) |
| Cold start | ~26s. Mitigate with in-process caching + application warmup |
| Cost per inference | ~$0.004 for 10s of GPU time |
| Model loading | Bake weights into container, load once on startup |
| API design | Stateless HTTP, multipart upload, return bytes |

The key insight: Cloud Run GPU with scale-to-zero gives you production GPU inference at hackathon prices. You pay only for actual compute, not for idle time. The cold start is real but manageable with proper warmup strategy.
