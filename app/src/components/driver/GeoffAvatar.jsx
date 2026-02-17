import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';

const LIPSYNC_URL = import.meta.env.VITE_LIPSYNC_URL || '';
const TTS_URL = import.meta.env.VITE_TTS_URL || '';

const GeoffAvatar = forwardRef(function GeoffAvatar({ onReady }, ref) {
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [speaking, setSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [lipsyncAvailable, setLipsyncAvailable] = useState(false);

  useEffect(() => {
    // Check if lipsync service is available
    if (LIPSYNC_URL) {
      fetch(`${LIPSYNC_URL}/health`, { signal: AbortSignal.timeout(3000) })
        .then((res) => {
          if (res.ok) setLipsyncAvailable(true);
        })
        .catch(() => {});
    }
    onReady?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    speak: (text, audioUrl, videoUrl) => {
      if (videoUrl) {
        return playBackendVideo(videoUrl);
      }
      if (lipsyncAvailable) {
        return speakWithVideo(text);
      }
      return speakWithAudio(text, audioUrl);
    },
    setMood: () => {},
    stop: () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      setShowVideo(false);
      setSpeaking(false);
      setThinking(false);
    },
  }));

  // Backend-generated lipsync video (pre-rendered via Cloud Function)
  async function playBackendVideo(videoUrl) {
    setSpeaking(true);
    setShowVideo(true);

    const video = videoRef.current;
    if (video) {
      video.src = videoUrl;
      video.onended = () => {
        setShowVideo(false);
        setSpeaking(false);
      };
      video.onerror = () => {
        setShowVideo(false);
        setSpeaking(false);
      };
      video.play().catch(() => {
        setShowVideo(false);
        setSpeaking(false);
      });
    }
  }

  // Default mode: static image + TTS audio
  async function speakWithAudio(text, existingAudioUrl) {
    if (!text?.trim()) return;
    setThinking(true);
    setSpeaking(true);

    try {
      let audioUrl = existingAudioUrl;

      // If no pre-generated audio URL, request TTS
      if (!audioUrl) {
        if (TTS_URL) {
          // Use the ttsProxy Cloud Function endpoint
          const res = await fetch(TTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          if (res.ok) {
            const data = await res.json();
            audioUrl = data.audioUrl;
          }
        }
      }

      setThinking(false);

      if (audioUrl && audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.onended = () => {
          setSpeaking(false);
        };
        audioRef.current.onerror = () => {
          setSpeaking(false);
        };
        await audioRef.current.play().catch(() => {
          setSpeaking(false);
        });
      } else {
        // No audio available — just show speaking briefly then stop
        setTimeout(() => setSpeaking(false), 2000);
      }
    } catch (err) {
      console.error('TTS playback failed:', err);
      setThinking(false);
      setSpeaking(false);
    }
  }

  // Enhanced mode: Wav2Lip video (when GPU service is available)
  async function speakWithVideo(text) {
    if (!text?.trim()) return;
    setThinking(true);
    setSpeaking(true);

    try {
      const res = await fetch(`${LIPSYNC_URL}/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error(`Lipsync service error: ${res.status}`);

      const blob = await res.blob();

      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      setThinking(false);
      setShowVideo(true);

      const video = videoRef.current;
      if (video) {
        video.src = url;
        video.onended = () => {
          setShowVideo(false);
          setSpeaking(false);
        };
        video.onerror = () => {
          setShowVideo(false);
          setSpeaking(false);
        };
        video.play().catch(() => {
          setShowVideo(false);
          setSpeaking(false);
        });
      }
    } catch (err) {
      console.error('Lipsync failed, falling back to audio:', err);
      // Fallback to audio mode
      setShowVideo(false);
      setLipsyncAvailable(false);
      await speakWithAudio(text);
    }
  }

  return (
    <div className="geoff-avatar-video-container">
      <img
        src="/assets/geoff.png"
        alt="Geoff"
        className={`geoff-avatar-img ${showVideo ? 'hidden' : ''} ${speaking && !showVideo ? 'speaking' : ''}`}
      />
      <video
        ref={videoRef}
        className={`geoff-avatar-video ${showVideo ? 'visible' : ''}`}
        playsInline
        muted={false}
      />
      <audio ref={audioRef} />
      {speaking && !showVideo && !thinking && (
        <div className="geoff-speaking-indicator">
          <div className="waveform-bar" />
          <div className="waveform-bar" />
          <div className="waveform-bar" />
          <div className="waveform-bar" />
          <div className="waveform-bar" />
        </div>
      )}
      {thinking && (
        <div className="geoff-thinking-indicator">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </div>
      )}
    </div>
  );
});

export default GeoffAvatar;
