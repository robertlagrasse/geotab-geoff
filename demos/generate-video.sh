#!/bin/bash
# Usage: ./generate-video.sh input.txt output.mp4
# Generates a lip-synced video of Geoff narrating the script.
# Requires: gcloud CLI authenticated, local lipsync container on port 8787

set -euo pipefail

INPUT_TEXT="$(realpath "$1")"
OUTPUT_MP4="$(realpath -m "${2:-output.mp4}")"
GEOFF_IMAGE="/home/robert/geoff/geoff.png"
LOCAL_LIPSYNC="http://localhost:8787/lipsync"
TMPDIR=$(mktemp -d)

trap "rm -rf $TMPDIR" EXIT

TEXT=$(cat "$INPUT_TEXT")
echo "=== Generating: $(basename "$INPUT_TEXT" .txt) ==="
echo "Text length: ${#TEXT} characters"

# Step 1: Get GCP access token
TOKEN=$(gcloud auth print-access-token)

# Step 2: Cloud TTS — text to WAV audio
# Cloud TTS has a 5000 byte limit per request. For longer scripts,
# split into chunks, synthesize each, then concatenate with ffmpeg.
MAX_CHARS=4800

if [ ${#TEXT} -le $MAX_CHARS ]; then
  # Short enough for a single TTS call
  echo "Synthesizing audio (single chunk)..."
  python3 -c "
import json, sys
text = open('$INPUT_TEXT').read()
payload = {
    'input': {'text': text},
    'voice': {
        'languageCode': 'en-US',
        'name': 'en-US-Neural2-D',
        'ssmlGender': 'MALE'
    },
    'audioConfig': {
        'audioEncoding': 'LINEAR16',
        'speakingRate': 0.92,
        'pitch': -1.5,
        'volumeGainDb': 2.0
    }
}
print(json.dumps(payload))
" > "$TMPDIR/tts_request.json"

  curl -s -X POST "https://texttospeech.googleapis.com/v1/text:synthesize" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-goog-user-project: geotab-geoff" \
    -H "Content-Type: application/json" \
    -d @"$TMPDIR/tts_request.json" > "$TMPDIR/tts_response.json"

  python3 -c "
import json, base64
resp = json.load(open('$TMPDIR/tts_response.json'))
if 'error' in resp:
    print(f'TTS ERROR: {resp[\"error\"]}')
    exit(1)
audio = base64.b64decode(resp['audioContent'])
open('$TMPDIR/speech.wav', 'wb').write(audio)
print(f'Audio: {len(audio)} bytes')
"
else
  # Split into sentence-boundary chunks, synthesize each, concatenate
  echo "Synthesizing audio (chunked — ${#TEXT} chars)..."
  python3 << 'PYEOF'
import json, base64, subprocess, os, sys

tmpdir = os.environ.get("TMPDIR", "$TMPDIR")
tmpdir = "$TMPDIR"
token = "$TOKEN"
input_file = "$INPUT_TEXT"
max_chars = $MAX_CHARS

text = open(input_file).read()

# Split on sentence boundaries
import re
sentences = re.split(r'(?<=[.!?])\s+', text)
chunks = []
current = ""
for s in sentences:
    if len(current) + len(s) + 1 > max_chars and current:
        chunks.append(current.strip())
        current = s
    else:
        current = current + " " + s if current else s
if current.strip():
    chunks.append(current.strip())

print(f"Split into {len(chunks)} chunks")

wav_files = []
for i, chunk in enumerate(chunks):
    payload = {
        "input": {"text": chunk},
        "voice": {
            "languageCode": "en-US",
            "name": "en-US-Neural2-D",
            "ssmlGender": "MALE"
        },
        "audioConfig": {
            "audioEncoding": "LINEAR16",
            "speakingRate": 0.92,
            "pitch": -1.5,
            "volumeGainDb": 2.0
        }
    }
    req_file = f"{tmpdir}/tts_req_{i}.json"
    resp_file = f"{tmpdir}/tts_resp_{i}.json"
    wav_file = f"{tmpdir}/chunk_{i}.wav"

    with open(req_file, "w") as f:
        json.dump(payload, f)

    result = subprocess.run([
        "curl", "-s", "-X", "POST",
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        "-H", f"Authorization: Bearer {token}",
        "-H", "x-goog-user-project: geotab-geoff",
        "-H", "Content-Type: application/json",
        "-d", f"@{req_file}"
    ], capture_output=True, text=True)

    resp = json.loads(result.stdout)
    if "error" in resp:
        print(f"TTS ERROR on chunk {i}: {resp['error']}")
        sys.exit(1)

    audio = base64.b64decode(resp["audioContent"])
    with open(wav_file, "wb") as f:
        f.write(audio)
    wav_files.append(wav_file)
    print(f"  Chunk {i+1}/{len(chunks)}: {len(chunk)} chars → {len(audio)} bytes")

# Concatenate WAV files using ffmpeg
list_file = f"{tmpdir}/wav_list.txt"
with open(list_file, "w") as f:
    for wf in wav_files:
        f.write(f"file '{wf}'\n")

subprocess.run([
    "ffmpeg", "-y", "-f", "concat", "-safe", "0",
    "-i", list_file, "-c", "copy", f"{tmpdir}/speech.wav"
], capture_output=True)

size = os.path.getsize(f"{tmpdir}/speech.wav")
print(f"Combined audio: {size} bytes")
PYEOF
fi

# Step 3: Send to local lipsync container
AUDIO_SIZE=$(stat -c%s "$TMPDIR/speech.wav")
echo "Sending to lipsync ($AUDIO_SIZE bytes audio)..."
curl -s -X POST "$LOCAL_LIPSYNC" \
  -F "image=@$GEOFF_IMAGE" \
  -F "audio=@$TMPDIR/speech.wav" \
  --max-time 600 \
  -o "$TMPDIR/lipsync_response.json"

# Local container returns JSON with video_url — download the video
VIDEO_URL=$(python3 -c "import json; print(json.load(open('$TMPDIR/lipsync_response.json'))['video_url'])")
echo "Downloading video from $VIDEO_URL..."
curl -s -o "$OUTPUT_MP4" "$VIDEO_URL"

VIDEO_SIZE=$(stat -c%s "$OUTPUT_MP4")
echo "Done: $OUTPUT_MP4 ($VIDEO_SIZE bytes)"
