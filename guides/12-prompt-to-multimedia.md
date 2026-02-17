# Prompt to Multimedia in 5 Minutes: When Your Tools Are Already Built

## The Story

One prompt:

> "Get the audio from this meme video. There's a geotab.png in this dir. There's also a pic of Geoff. Create a video that shows geotab.png and says something like 'I'm Geotab, the most powerful fleet management software on the planet.' Then cut to the pic of Geoff lipsyncing the 'My name is Jeff' audio you extracted from the meme video."

Five minutes later: a [9-second YouTube Short](https://youtube.com/shorts/GTz1UZnx7T8) is uploaded.

## What Actually Happened

The AI (Claude Code) executed this pipeline:

```
1. yt-dlp         → Download meme video audio from YouTube
2. ffprobe        → Analyze audio waveform (5.18 seconds)
3. Python/struct   → RMS energy analysis at 100ms resolution
                     → Found speech at 2.8-3.8 seconds
4. ffmpeg         → Trim audio to just the "my name is Jeff" clip
5. gcloud + curl  → Cloud TTS: generate Geotab intro narration
6. curl           → Send meme audio + geoff.png to Wav2Lip container
                     → Receive lip-synced MP4
7. ffmpeg         → Create Part 1: geotab.png + TTS as static video
8. ffmpeg         → Concatenate Part 1 + lip-synced Part 2
9. ffmpeg         → Extract verification frames for review
```

Nine tools. Zero manual intervention. One natural language prompt.

## Why This Was Possible

### The Tools Were Already Built

Every service in this pipeline existed before the prompt:

- **yt-dlp** was already installed
- **Cloud TTS** was already authenticated and configured
- **Wav2Lip container** was already running locally on the GPU
- **ffmpeg** was already available

The AI didn't build any tools. It composed existing tools into a new pipeline.

### The AI Understood the Domain

Claude had context from the entire conversation:
- It knew `geoff.png` was the avatar image used by the lipsync pipeline
- It knew `geotab.png` was a MyGeotab dashboard screenshot
- It knew the local lipsync container was at `localhost:8787/lipsync`
- It knew Cloud TTS used `en-US-Neural2-D` with specific voice settings
- It knew the lipsync output was a JSON response with a `video_url` field

The AI didn't need instructions for each step — it had the working knowledge from building the production pipeline.

### The Human Provided the Creative Direction

The prompt specified:
- **The concept:** Geotab intro → cut to Geoff meme
- **The source material:** a specific YouTube video
- **The structure:** two-part video with a cut
- **The tone:** meme, humor, social media

The AI handled execution. The human handled creative direction.

## The Pattern: Composable AI Pipelines

Once you have individual AI/media services working, the cost of composing them into new outputs drops to near zero:

```
Existing tools:          New composition:
├── TTS                  "Make a video where X says Y,
├── Lipsync               then cuts to Z saying W"
├── ffmpeg
├── yt-dlp               → 5 minutes, one prompt
└── Cloud APIs
```

### Other Compositions We Could Build From the Same Tools

- **Conference talk intro:** Geoff introduces himself, explains the platform
- **Tutorial series:** Geoff narrates each architecture component
- **Customer demo:** Geoff walks through a specific fleet's data
- **Social media clips:** Short-form content for each feature
- **Multilingual versions:** Swap TTS voice/language, same pipeline

Each of these is a single prompt away. The infrastructure cost is the same ~$0.004 per video.

## How to Build Composable Pipelines

### Step 1: Get Individual Tools Working First

Don't try to compose before each piece works independently:

```
✅ Cloud TTS generates audio from text → verify
✅ Wav2Lip generates video from audio + image → verify
✅ ffmpeg trims, concatenates, and formats video → verify
✅ yt-dlp downloads audio from YouTube → verify

Now compose them.
```

### Step 2: Use Containers for Complex Dependencies

Wav2Lip requires CUDA, PyTorch, and specific model weights. Don't install these on your dev machine — run them in a container:

```bash
docker run -d --gpus all \
  -p 8787:7861 \
  -v /data:/data \
  your-lipsync-image
```

The container exposes a simple HTTP API. Everything else just calls it.

### Step 3: Keep APIs Stateless

Each service should accept inputs and return outputs with no shared state:

```
POST /lipsync
  Input: image file + audio file
  Output: video file (or URL)

POST /tts
  Input: text + voice config
  Output: audio bytes

No sessions. No state. Just transform inputs to outputs.
```

Stateless services compose naturally. Stateful services create ordering dependencies.

### Step 4: Let the AI Discover the Composition

Once your tools are working and documented (or the AI has seen them in context), you can describe the desired output and let the AI figure out the pipeline:

```
Human: "Make a video where Geoff explains the escalation system,
        with the MyGeotab screenshot as a background for the intro."

AI: [figures out: TTS for narration → lipsync for Geoff segment →
     ffmpeg to composite screenshot background → concatenate parts]
```

You don't need to specify the pipeline. You specify the output.

## The Economics

| What | Cost |
|------|------|
| Cloud TTS for 30 seconds of narration | $0.008 |
| Wav2Lip for 30 seconds of video | $0.01 |
| YouTube Short upload | Free |
| **Total per social media clip** | **~$0.02** |

Compare to hiring a video editor or using motion graphics software. The cost difference is 1000x. The speed difference is even larger.

## What This Means for Content Creation

Traditional content pipeline:
```
Idea → Script → Record → Edit → Export → Upload
       1 day    1 day   1 day   1 hr    10 min
       Total: 3+ days
```

AI-composed pipeline:
```
Idea → Prompt → AI composes → Verify → Upload
       30 sec   5 minutes     2 min    10 min
       Total: ~10 minutes
```

The bottleneck shifts from production to creative direction. "What should we make?" becomes harder than "How do we make it?"

## Lessons

1. **Build tools first, compose later.** Each service should work independently before you try to chain them.

2. **Keep the AI in context.** The more the AI knows about your existing tools, the better it composes them. Long-running conversations with Claude Code build this context naturally.

3. **The human provides creative direction.** "My name's Geoff" as a concept is human creativity. The 9-tool pipeline to execute it is AI capability. Both are needed.

4. **Verification is fast.** Extract frames, check audio levels, watch the output. The AI can do this too — it extracted verification frames and checked them visually.

5. **Infrastructure is the moat.** Anyone can prompt an AI to "make a video." The teams that can actually execute it are the ones with working TTS, lipsync, and composition tools already deployed. The prompt is the easy part. The pipeline is the hard part.
