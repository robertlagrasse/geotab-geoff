FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3.10 python3-pip python3-setuptools python3-wheel \
    build-essential curl git ffmpeg libsm6 libxext6 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Wav2Lip source
COPY Wav2Lip/ /app/Wav2Lip/

# Copy model weights
COPY wav2lip_gan.pth /models/wav2lip_gan.pth

# Copy baked-in face image
COPY geoff.png /app/geoff.png

# Copy application code
COPY app.py /app/app.py

# Install PyTorch with CUDA 12.1 support
RUN pip3 install --no-cache-dir \
    torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cu121

# Install other Python dependencies
RUN pip3 install --no-cache-dir \
    "fastapi[standard]" \
    "uvicorn[standard]" \
    "python-multipart" \
    "pydantic" \
    "requests" \
    "opencv-python" \
    "scikit-learn" \
    "numba" \
    "numpy" \
    "librosa" \
    "tqdm" \
    "soundfile" \
    "soxr" \
    "google-auth"

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
