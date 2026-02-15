import speech from '@google-cloud/speech';

const speechClient = new speech.SpeechClient();

export async function transcribeAudio(audioBuffer, language = 'en-US') {
  const [response] = await speechClient.recognize({
    audio: { content: audioBuffer.toString('base64') },
    config: {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: language,
      model: 'latest_long',
      enableAutomaticPunctuation: true,
      useEnhanced: true,
    },
  });

  const transcript = response.results
    .map((r) => r.alternatives[0]?.transcript || '')
    .join(' ');

  return transcript;
}
