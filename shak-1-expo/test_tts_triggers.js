import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

const envPath = './.env';
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  env.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^"|"$/g, '');
    }
  });
}

async function run() {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-2.5-flash-preview-tts";

  const tests = [
    "Hello world",
    "Tell me a joke",
    "Translate 'Apple' to Spanish",
    "Write a short poem about AI."
  ];

  for (const text of tests) {
    console.log(`Testing text: "${text}"...`);
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
          },
        },
      });
      console.log(`  SUCCESS!`);
    } catch (e) {
      console.log(`  FAILED: ${e.message}`);
    }
  }
}
run();
