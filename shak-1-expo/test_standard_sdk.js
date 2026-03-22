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
  
  console.log(`Testing with getGenerativeModel...`);
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });
    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: "Hello from getGenerativeModel!" }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });
    console.log(`  SUCCESS! Got audio data: ${!!response.response.candidates?.[0]?.content?.parts?.[0]?.inlineData}`);
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }
}
run();
