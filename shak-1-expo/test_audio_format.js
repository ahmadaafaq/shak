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

  const formats = ["audio/wav", "audio/mp3", "audio/mpeg"];

  for (const fmt of formats) {
    console.log(`Testing format: ${fmt}...`);
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{ parts: [{ text: "Test format." }] }],
        config: {
          responseModalities: ["AUDIO"],
          responseMimeType: fmt,
        },
      });
      
      const part = response.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData) {
          console.log(`  SUCCESS! MimeType returned: ${part.inlineData.mimeType}`);
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          console.log(`  Header (first 4 bytes): ${buffer.slice(0, 4).toString('utf8')}`);
      } else {
          console.log("  No audio data in response.");
      }
    } catch (e) {
      console.log(`  FAILED with ${fmt}: ${e.message}`);
    }
  }
}
run();
