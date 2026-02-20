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
    'ca-ES': { languageCode: 'ca-ES', name: 'ca-ES-Standard-B', ssmlGender: 'FEMALE' },
    'fr-FR': { languageCode: 'fr-FR', name: 'fr-FR-Neural2-B', ssmlGender: 'MALE' },
    'pt-BR': { languageCode: 'pt-BR', name: 'pt-BR-Neural2-B', ssmlGender: 'MALE' },
    'de-DE': { languageCode: 'de-DE', name: 'de-DE-Neural2-B', ssmlGender: 'MALE' },
    'cmn-CN': { languageCode: 'cmn-CN', name: 'cmn-CN-Neural2-B', ssmlGender: 'MALE' },
    'hi-IN': { languageCode: 'hi-IN', name: 'hi-IN-Neural2-B', ssmlGender: 'MALE' },
    'ar-XA': { languageCode: 'ar-XA', name: 'ar-XA-Neural2-A', ssmlGender: 'MALE' },
    'ja-JP': { languageCode: 'ja-JP', name: 'ja-JP-Neural2-C', ssmlGender: 'MALE' },
    'ko-KR': { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C', ssmlGender: 'MALE' },
    'it-IT': { languageCode: 'it-IT', name: 'it-IT-Neural2-C', ssmlGender: 'MALE' },
    'nl-NL': { languageCode: 'nl-NL', name: 'nl-NL-Neural2-B', ssmlGender: 'MALE' },
    'pl-PL': { languageCode: 'pl-PL', name: 'pl-PL-Neural2-B', ssmlGender: 'MALE' },
    'tr-TR': { languageCode: 'tr-TR', name: 'tr-TR-Neural2-B', ssmlGender: 'MALE' },
  };

  // Per-language pitch overrides (semitones, range -20 to +20)
  // Catalan only has a female voice — drop pitch to masculinize it
  const pitchOverride = { 'ca-ES': -6.0 };

  const [response] = await ttsClient.synthesizeSpeech({
    input: { ssml },
    voice: voiceConfig[language] || voiceConfig['en-US'],
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.92,
      pitch: pitchOverride[language] ?? -1.5,
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
