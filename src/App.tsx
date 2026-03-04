/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Languages,
  Globe,
  MessageSquare,
  ChevronRight,
  Settings,
  Info
} from 'lucide-react';
import { translateAudio, generateSpeech, TranslationResult, SpeechResponse } from './services/geminiService';
import { cn } from './lib/utils';

interface HistoryItem extends TranslationResult {
  id: string;
  timestamp: number;
  audioUrl?: string;
}

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentTranslation, setCurrentTranslation] = useState<TranslationResult | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [realtimeTranscript, setRealtimeTranscript] = useState<string>("");
  const [selectedLang, setSelectedLang] = useState<string>("en-US");

  const languages = [
    { code: 'en-US', name: 'English' },
    { code: 'es-ES', name: 'Spanish' },
    { code: 'fr-FR', name: 'French' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'de-DE', name: 'German' },
    { code: 'ar-SA', name: 'Arabic' },
    { code: 'zh-CN', name: 'Mandarin' },
  ];

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const liveSessionRef = useRef<any>(null);

  // Global audio management
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const [isSpeechSupported, setIsSpeechSupported] = useState(true);

  // Initialize Audio Context for visualization
  const initAudioContext = async (stream: MediaStream) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const source = audioContextRef.current.createMediaStreamSource(stream);
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;
    source.connect(analyserRef.current);

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const updateLevel = () => {
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average / 128); // Normalize to 0-1
      }
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      initAudioContext(stream);

      // Reset states
      setRealtimeTranscript("");
      setCurrentTranslation(null);
      setCurrentAudioUrl(null);
      setIsGeneratingVoice(false);
      setError(null);

      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
        'audio/aac',
        'audio/wav'
      ];

      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';

      const mediaRecorder = new MediaRecorder(stream, supportedMimeType ? { mimeType: supportedMimeType } : {});
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const finalMimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: finalMimeType });
        await handleAudioProcessing(audioBlob);
        stream.getTracks().forEach(track => track.stop());
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setAudioLevel(0);
      };

      // Real-time transcription using browser Speech Recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        console.log("SpeechRecognition API found, using lang:", selectedLang);
        setIsSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = selectedLang;

        recognition.onstart = () => {
          console.log("Speech recognition session started");
        };

        recognition.onresult = (event: any) => {
          console.log("Speech recognition result received", event.results);
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              setRealtimeTranscript(prev => prev + event.results[i][0].transcript + " ");
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          if (interimTranscript) {
            setRealtimeTranscript(interimTranscript);
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech Recognition Error Event:", event);
          if (event.error === 'not-allowed') {
            setError("Microphone access denied for speech recognition. Please check browser permissions.");
          } else if (event.error === 'network') {
            setError("Network error during speech recognition.");
          }
        };

        recognition.onend = () => {
          console.log("Speech recognition ended");
        };

        try {
          recognition.start();
          (mediaRecorder as any).recognition = recognition;
        } catch (e) {
          console.error("Failed to start speech recognition:", e);
        }
      } else {
        console.warn("Speech Recognition API not supported in this browser.");
        setIsSpeechSupported(false);
      }

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Please allow microphone access to use the translator.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if ((mediaRecorderRef.current as any).recognition) {
        (mediaRecorderRef.current as any).recognition.stop();
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleAudioProcessing = async (blob: Blob) => {
    if (blob.size < 100) {
      setStatusMessage("Audio too short. Please try again.");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage("Analyzing audio...");
    try {
      const base64Audio = await blobToBase64(blob);

      // 1. Translate Audio using Gemini
      setStatusMessage("Translating...");
      const result = await translateAudio(base64Audio, blob.type || 'audio/webm');
      setCurrentTranslation(result);
      setIsProcessing(false); // Show result immediately to user
      setStatusMessage(null);

      // 2. Generate Speech if not muted
      let finalAudioUrl = '';
      if (!isMuted && result.translatedText) {
        setIsGeneratingVoice(true);
        try {
          setStatusMessage("Generating voice...");
          // Add a timeout to prevent infinite loading
          const ttsPromise = generateSpeech(result.translatedText);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Voice generation timed out")), 15000)
          );

          const ttsResponse = await Promise.race([ttsPromise, timeoutPromise]) as SpeechResponse;

          let ttsBlob: Blob;
          if (ttsResponse.mimeType.includes('pcm')) {
            ttsBlob = pcmToWav(ttsResponse.data);
          } else {
            ttsBlob = await (await fetch(`data:${ttsResponse.mimeType};base64,${ttsResponse.data}`)).blob();
          }

          finalAudioUrl = URL.createObjectURL(ttsBlob);
          setCurrentAudioUrl(finalAudioUrl);
          setStatusMessage(null);

          // Play automatically after generation
          if (finalAudioUrl) {
            await togglePlayback(finalAudioUrl);
          }
        } catch (ttsErr: any) {
          console.error("TTS Error:", ttsErr);
          setStatusMessage(ttsErr.message || "Voice generation failed.");
          setTimeout(() => setStatusMessage(null), 3000);
        } finally {
          setIsGeneratingVoice(false);
        }
      }

      // 3. Add to history
      const newItem: HistoryItem = {
        ...result,
        id: `trans-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        audioUrl: finalAudioUrl || undefined
      };
      setHistory(prev => [newItem, ...prev]);
    } catch (err: any) {
      console.error("Processing error:", err);
      setError(err.message || "An unexpected error occurred");
      setStatusMessage(null);
      setIsProcessing(false);
      setIsGeneratingVoice(false); // Ensure this is cleared too
    }
  };

  // Mute effect: reactively mute/unmute existing audio when isMuted changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const stopCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onpause = null;
      audioRef.current.onplay = null;
      audioRef.current = null;
    }
    setPlayingUrl(null);
  }, []);

  const togglePlayback = useCallback(async (url: string) => {
    // If this URL is already playing, pause it
    if (playingUrl === url && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      return;
    }

    // If the same URL is paused, resume it
    if (playingUrl === url && audioRef.current && audioRef.current.paused) {
      try {
        await audioRef.current.play();
      } catch (err) {
        console.error("Audio resume failed:", err);
      }
      return;
    }

    // Otherwise stop current and start new
    stopCurrentAudio();

    const audio = new Audio(url);
    audio.muted = isMuted;
    audioRef.current = audio;

    audio.onplay = () => setPlayingUrl(url);
    audio.onpause = () => setPlayingUrl(null);
    audio.onended = () => {
      setPlayingUrl(null);
      audioRef.current = null;
    };

    try {
      await audio.play();
    } catch (err) {
      console.error("Audio playback failed:", err);
      setStatusMessage("Tap play to hear translation");
      setTimeout(() => setStatusMessage(null), 3000);
      audioRef.current = null;
    }
  }, [playingUrl, isMuted, stopCurrentAudio]);

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col max-w-md mx-auto relative overflow-hidden">
      {/* Header */}
      <header className="p-6 flex flex-col gap-4 border-b border-white/5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-neon-green flex items-center justify-center text-black">
              <Languages size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Shak<span className="text-neon-green">Translate</span></h1>
          </div>
          <div className="flex gap-4">
            <button className="text-white/40 hover:text-white transition-colors">
              <Settings size={20} />
            </button>
            <button className="text-white/40 hover:text-white transition-colors">
              <Info size={20} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setSelectedLang(lang.code)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-all whitespace-nowrap",
                selectedLang === lang.code
                  ? "bg-neon-green text-black font-bold"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              )}
            >
              {lang.name}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {/* Status / Current Translation */}
        <div className="min-h-[200px] flex flex-col justify-center items-center text-center space-y-4">
          <AnimatePresence mode="wait">
            {!currentTranslation && !isRecording && !isProcessing && (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-white/40"
              >
                <Globe size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium">Tap the mic to start translating</p>
                <p className="text-sm">Supports Spanish, French, Italian, German, Arabic, Mandarin</p>
              </motion.div>
            )}

            {isRecording && (
              <motion.div
                key="recording-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 w-full"
              >
                <div className="flex items-center justify-center gap-1 h-8">
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={`bar-${i}`}
                      animate={{
                        height: [8, 8 + (audioLevel * 40 * Math.random()), 8],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.2,
                        delay: i * 0.05
                      }}
                      className="w-1 bg-neon-green rounded-full"
                    />
                  ))}
                </div>

                {realtimeTranscript && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/5 p-4 rounded-xl border border-white/10 max-w-xs mx-auto"
                  >
                    <p className="text-white/60 text-sm italic leading-relaxed">
                      {realtimeTranscript}
                      <motion.span
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="inline-block w-1 h-4 bg-neon-green ml-1 align-middle"
                      />
                    </p>
                  </motion.div>
                )}

                {!isSpeechSupported && (
                  <p className="text-white/20 text-[10px] uppercase tracking-tighter">Real-time transcription not supported in this browser</p>
                )}

                <p className="text-neon-green font-mono text-sm tracking-widest uppercase">Listening...</p>
              </motion.div>
            )}

            {isProcessing && (
              <motion.div
                key="processing-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="relative w-12 h-12 mx-auto">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-full h-full border-2 border-neon-green/20 border-t-neon-green rounded-full"
                  />
                </div>
                <p className="text-white/60 font-mono text-sm tracking-widest uppercase">Processing...</p>
              </motion.div>
            )}

            {statusMessage && !isRecording && (
              <motion.p
                key="status-message"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-white/40 font-mono text-xs tracking-widest uppercase"
              >
                {statusMessage}
              </motion.p>
            )}

            {error && !isRecording && (
              <motion.div
                key="error-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-500 text-xs"
              >
                <p className="font-bold mb-1 uppercase tracking-wider">Error</p>
                <p>{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-2 text-[10px] underline uppercase tracking-widest opacity-60 hover:opacity-100"
                >
                  Dismiss
                </button>
              </motion.div>
            )}

            {currentTranslation && !isRecording && !isProcessing && !error && (
              <motion.div
                key="translation-result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full space-y-6"
              >
                <div className="bg-dark-surface p-5 rounded-2xl neon-border text-left relative group">
                  <div className="absolute -top-3 left-4 px-2 bg-dark-bg text-[10px] font-mono text-neon-green uppercase tracking-wider">
                    {currentTranslation.detectedLanguage}
                  </div>
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <p className="text-white/60 text-sm italic mb-2">"{currentTranslation.originalText}"</p>
                      <p className="text-lg font-medium leading-tight">{currentTranslation.translatedText}</p>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      <button
                        disabled={!currentAudioUrl || isGeneratingVoice}
                        onClick={() => currentAudioUrl && togglePlayback(currentAudioUrl)}
                        className={cn(
                          "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl border-4 border-dark-bg",
                          currentAudioUrl && !isGeneratingVoice
                            ? "bg-neon-green text-black hover:scale-110 shadow-neon-green/40 active:scale-95"
                            : "bg-white/5 text-white/10 cursor-not-allowed border-white/5"
                        )}
                      >
                        {isGeneratingVoice ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                            className="w-6 h-6 border-2 border-white/10 border-t-white rounded-full"
                          />
                        ) : (currentAudioUrl && playingUrl === currentAudioUrl ? (
                          <Pause size={32} />
                        ) : (
                          <Play size={32} />
                        ))}
                      </button>
                      <span className={cn(
                        "text-[10px] font-mono uppercase tracking-widest font-bold",
                        currentAudioUrl && !isGeneratingVoice ? "text-neon-green" : "text-white/20"
                      )}>
                        {isGeneratingVoice ? "Loading..." : (playingUrl === currentAudioUrl ? "Pause" : "Play Voice")}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* History */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono text-white/40 uppercase tracking-widest flex items-center gap-2">
              <MessageSquare size={14} /> Recent Translations
            </h2>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="text-xs text-white/20 hover:text-white/60 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="space-y-3">
            {history.map((item) => (
              <motion.div
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={item.id}
                className="bg-dark-surface/50 p-4 rounded-xl border border-white/5 flex items-start gap-4 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-neon-green/60 uppercase">{item.detectedLanguage}</span>
                    <span className="text-[10px] text-white/20">•</span>
                    <span className="text-[10px] text-white/20">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-sm font-medium truncate">{item.translatedText}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => item.audioUrl && togglePlayback(item.audioUrl)}
                    disabled={!item.audioUrl}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                      item.audioUrl
                        ? "bg-neon-green/10 text-neon-green hover:bg-neon-green hover:text-black"
                        : "bg-white/5 text-white/10 cursor-not-allowed"
                    )}
                  >
                    {item.audioUrl && playingUrl === item.audioUrl
                      ? <Pause size={16} />
                      : <Play size={16} />}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>

      {/* Controls */}
      <div className="p-8 bg-gradient-to-t from-dark-bg via-dark-bg to-transparent">
        <div className="flex items-center justify-between gap-6">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              isMuted ? "bg-red-500/10 text-red-500" : "bg-white/5 text-white/60 hover:text-white"
            )}
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>

          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center transition-all relative z-10",
                isRecording
                  ? "bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)]"
                  : "bg-neon-green text-black shadow-[0_0_30px_rgba(57,255,20,0.4)]"
              )}
            >
              {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
            </motion.button>

            {isRecording && (
              <motion.div
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="absolute inset-0 bg-red-500 rounded-full z-0"
              />
            )}
          </div>

          <button
            onClick={() => {
              stopCurrentAudio();
              setCurrentTranslation(null);
              setCurrentAudioUrl(null);
              setHistory([]);
            }}
            className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/60 hover:text-white transition-all"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      {/* Background Accents */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -right-[10%] w-[40%] h-[40%] bg-neon-green/5 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] bg-neon-green/5 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}

const pcmToWav = (base64: string, sampleRate: number = 24000): Blob => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const buffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + bytes.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(36, 'data');
  view.setUint32(40, bytes.length, true);

  for (let i = 0; i < bytes.length; i++) {
    view.setUint8(44 + i, bytes[i]);
  }

  return new Blob([buffer], { type: 'audio/wav' });
};
