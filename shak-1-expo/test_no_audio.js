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

  const text = "My name is Paradhusar and I am living in Purana Shahr.";
  
  console.log(`Deep testing response for: "${text}"...`);
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: ["audio"],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });
    
    console.log("Response Keys:", Object.keys(response));
    if (response.candidates) {
        console.log("Num Candidates:", response.candidates.length);
        const c = response.candidates[0];
        console.log("Candidate 0 Keys:", Object.keys(c));
        if (c.content) {
            console.log("Content Keys:", Object.keys(c.content));
            if (c.content.parts) {
                console.log("Num Parts:", c.content.parts.length);
                const p = c.content.parts[0];
                console.log("Part 0 Keys:", Object.keys(p));
                if (p.inlineData) {
                    console.log("inlineData mimeType:", p.inlineData.mimeType);
                    console.log("inlineData data length:", p.inlineData.data?.length);
                } else if (p.text) {
                    console.log("Part 0 has TEXT instead of AUDIO:", p.text);
                }
            }
        }
    }
  } catch (e) {
    console.log(`  CATCHED ERROR: ${e.message}`);
  }
}
run();
