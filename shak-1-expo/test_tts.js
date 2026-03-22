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

  console.log(`Testing model: ${modelName} with speechConfig...`);
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: "Hello, this is a test with a specific voice." }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });
    console.log("  SUCCESS! Result candidates:", response.candidates?.length);
    if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        console.log("  Got audio data!");
    } else {
        console.log("  No audio data in response.");
    }
  } catch (e) {
    console.log(`  FAILED with speechConfig: ${e.message}`);
    
    console.log("Retrying WITHOUT speechConfig but with AUDIO modality...");
    try {
        const response2 = await ai.models.generateContent({
          model: modelName,
          contents: [{ parts: [{ text: "Hello again." }] }],
          config: {
            responseModalities: ["AUDIO"],
          },
        });
        console.log("  SUCCESS WITHOUT speechConfig!");
    } catch (e2) {
        console.log("  FAILED AGAIN:", e2.message);
    }
  }
}
run();
