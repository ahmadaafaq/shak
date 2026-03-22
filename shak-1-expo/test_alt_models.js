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
  
  const text = "My name is Paradhusar and I am living in Purana Shahr.";
  const models = ["gemini-1.5-flash", "gemini-2.0-flash"];

  for (const m of models) {
    console.log(`Testing model ${m} with audio modality...`);
    try {
      const response = await ai.models.generateContent({
        model: m,
        contents: text,
        config: {
          responseModalities: ["audio"],
        },
      });
      console.log(`  SUCCESS with ${m}! FinishReason: ${response.candidates?.[0]?.finishReason}`);
    } catch (e) {
      console.log(`  FAILED with ${m}: ${e.message}`);
    }
  }
}
run();
