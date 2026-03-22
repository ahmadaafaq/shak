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
  try {
    const listResult = await ai.models.list();
    // listResult is likely an object with models property or it is an iterator
    const models = listResult.models || [];
    console.log("Found " + models.length + " models.");
    for (const m of models) {
        console.log(m.name + " | v:" + m.version);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
