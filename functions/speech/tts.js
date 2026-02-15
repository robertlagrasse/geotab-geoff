import textToSpeech from '@google-cloud/text-to-speech';
import { getStorage } from 'firebase-admin/storage';

const ttsClient = new textToSpeech.TextToSpeechClient();

export async function synthesizeSpeech(text, fileId, language = 'en-US') {
  // Add SSML markup for natural coaching delivery
  const ssml = textToSsml(text);

  const voiceConfig = {
    'en-US': { languageCode: 'en-US', name: 'en-US-Neural2-D', ssmlGender: 'MALE' },
    'es-ES': { languageCode: 'es-ES', name: 'es-ES-Neural2-B', ssmlGender: 'MALE' },
    'es-MX': { languageCode: 'es-MX', name: 'es-MX-Neural2-B', ssmlGender: 'MALE' },
  };

  const [response] = await ttsClient.synthesizeSpeech({
    input: { ssml },
    voice: voiceConfig[language] || voiceConfig['en-US'],
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.92,
      pitch: -1.5,
      volumeGainDb: 2.0,
    },
  });

  // Upload to Cloud Storage
  const bucket = getStorage().bucket('geotab-geoff-assets');
  const fileName = `audio/${fileId}.mp3`;
  const file = bucket.file(fileName);

  await file.save(response.audioContent, {
    metadata: { contentType: 'audio/mpeg' },
  });

  return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}

function textToSsml(text) {
  // Add pauses before data points (numbers, percentages, times)
  let ssml = text
    .replace(/(\d+\.?\d*\s*(mph|%|miles|seconds|minutes|hours|am|pm))/gi, '<break time="300ms"/>$1')
    .replace(/(\d{1,2}:\d{2}\s*(am|pm)?)/gi, '<break time="300ms"/>$1');

  return `<speak>${ssml}</speak>`;
}
