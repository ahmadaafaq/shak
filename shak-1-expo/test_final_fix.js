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

  const text = "Transcript: My name is Paradhusar and I am living in Purana Shahr.";
  
  console.log(`Testing with Transcript: prefix: "${text}"...`);
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: text,
      config: {
        responseModalities: ["audio"],
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
        ]
      },
    });
    console.log(`  FinishReason: ${response.candidates?.[0]?.finishReason}`);
    console.log(`  Has Content: ${!!response.candidates?.[0]?.content}`);
  } catch (e) {
    console.log(`  CATCHED ERROR: ${e.message}`);
  }
}
run();
