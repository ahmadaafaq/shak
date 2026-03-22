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

  console.log(`Testing with contents as string...`);
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: "Hello world",
      config: {
        responseModalities: ["AUDIO"],
      },
    });
    console.log(`  SUCCESS!`);
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }
}
run();
