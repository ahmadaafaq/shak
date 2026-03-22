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
    "I am living in Purana Shahr.",
    "My name is John and I am living in New York.",
    "hello",
    "Purana Shahr"
  ];
  
  for (const text of tests) {
    console.log(`Testing variation: "${text}"...`);
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: text,
        config: {
          responseModalities: ["audio"],
        },
      });
      console.log(`  FinishReason: ${response.candidates?.[0]?.finishReason}`);
      console.log(`  Has Content: ${!!response.candidates?.[0]?.content}`);
    } catch (e) {
      console.log(`  CATCHED ERROR: ${e.message}`);
    }
  }
}
run();
