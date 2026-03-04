import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
}

export async function translateAudio(base64Audio: string, mimeType: string): Promise<TranslationResult> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType,
          },
        },
        {
          text: "Detect language and translate to English. Return JSON.",
        },
      ],
    },
    config: {
      responseModalities: ["TEXT"],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          originalText: {
            type: Type.STRING,
            description: "Transcription in original language",
          },
          translatedText: {
            type: Type.STRING,
            description: "English translation",
          },
          detectedLanguage: {
            type: Type.STRING,
            description: "Detected language name",
          },
        },
        required: ["originalText", "translatedText", "detectedLanguage"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Empty response from AI");
  }

  try {
    return JSON.parse(text) as TranslationResult;
  } catch (e) {
    console.error("Failed to parse translation response:", text);
    throw new Error("Translation failed to parse JSON");
  }
}

export interface SpeechResponse {
  data: string;
  mimeType: string;
}

export async function generateSpeech(text: string): Promise<SpeechResponse> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
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

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const base64Audio = part?.inlineData?.data;
  const mimeType = part?.inlineData?.mimeType || 'audio/pcm';

  if (!base64Audio) {
    throw new Error("Failed to generate speech");
  }
  return { data: base64Audio, mimeType };
}
