import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  withSpring
} from 'react-native-reanimated';

import { translateAudio, generateSpeech, TranslationResult } from './src/services/geminiService';
import { useAudioRecorder } from './src/hooks/useAudioRecorder';

interface HistoryItem extends TranslationResult {
  id: string;
  timestamp: number;
  audioUrl?: string; // base64 string for audio
}

const LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'de-DE', name: 'German' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'zh-CN', name: 'Mandarin' },
];

export default function App() {
  const [selectedLang, setSelectedLang] = useState('en-US');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentTranslation, setCurrentTranslation] = useState<TranslationResult | null>(null);
  const [currentAudioBase64, setCurrentAudioBase64] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const silenceCallbackRef = useRef<(() => void) | undefined>(undefined);

  const { isRecording, startRecording, stopRecording, audioLevel } = useAudioRecorder(
    () => {
      if (silenceCallbackRef.current) silenceCallbackRef.current();
    }
  );

  // Audio Playback
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingBase64, setPlayingBase64] = useState<string | null>(null);

  async function playAudio(base64: string) {
    if (isMuted) return;

    try {
      // Stop current sound if any
      if (sound) {
         await sound.stopAsync();
         await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${base64}` },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setPlayingBase64(base64);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingBase64(null);
        }
      });
    } catch (e) {
      console.error("Playback failed", e);
      setStatusMessage("Failed to play audio");
      setTimeout(() => setStatusMessage(null), 3000);
    }
  }

  const togglePlayback = useCallback(async (base64: string) => {
    // If we're currently playing THIS audio, stop it
    if (playingBase64 === base64 && sound) {
      await sound.stopAsync();
      setPlayingBase64(null);
      return;
    }
    // Otherwise play it
    await playAudio(base64);
  }, [playingBase64, sound, isMuted]);

  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  // Recording Actions
  const handleRecordPress = async () => {
    // Note: since isRecording is referenced from scope, and useAudioRecorder doesn't expose a state-ref, 
    // it's safest to let useAudioRecorder handle auto-stopping internally, or we can just pass
    // a callback that uses the latest scope.
    if (isRecording) {
      try {
        const { base64, mimeType } = await stopRecording();
        handleAudioProcessing(base64, mimeType);
      } catch(e) {
        console.warn("Stopping Error", e);
      }
    } else {
      setError(null);
      setStatusMessage(null);
      setCurrentTranslation(null);
      setCurrentAudioBase64(null);
      await startRecording();
    }
  };

  const handleSilenceDetected = useCallback(async () => {
      if (isRecording) {
        try {
          const { base64, mimeType } = await stopRecording();
          handleAudioProcessing(base64, mimeType);
        } catch(e) {
          console.warn("Stopping Error", e);
        }
      }
  }, [stopRecording, isRecording]);
  
  useEffect(() => {
    silenceCallbackRef.current = handleSilenceDetected;
  }, [handleSilenceDetected]);

  const handleAudioProcessing = async (base64Audio: string, mimeType: string) => {
    if (!base64Audio || base64Audio.length < 100) {
      setStatusMessage("Audio too short. Please try again.");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatusMessage("Translating...");

    try {
      // 1. Translate
      const langObj = LANGUAGES.find(l => l.code === selectedLang);
      const expectedLangName = langObj ? langObj.name : "English";
      const result = await translateAudio(base64Audio, mimeType, expectedLangName);
      
      if (result.isIgnored) {
        setIsProcessing(false);
        setStatusMessage("Ignored: Language mismatch");
        setTimeout(() => setStatusMessage(null), 3000);
        return; // Skip generation and history addition for ignored audio
      }

      setCurrentTranslation(result);
      setIsProcessing(false);
      setStatusMessage(null);

      // 2. Generate Voice
      let newAudioBase64 = null;
      if (!isMuted && result.translatedText) {
        setIsGeneratingVoice(true);
        setStatusMessage("Generating voice...");
        try {
          // Add timeout to not freeze UI indefinitely
           const ttsPromise = generateSpeech(result.translatedText);
           const timeoutPromise = new Promise((_, reject) =>
             setTimeout(() => reject(new Error("Voice generation timed out")), 30000)
           );

           const ttsResponse = await Promise.race([ttsPromise, timeoutPromise]) as {data: string, mimeType: string};
           
           // React Native expo-av can play base64 directly
           newAudioBase64 = ttsResponse.data;
           setCurrentAudioBase64(newAudioBase64);
           setStatusMessage(null);

           // Auto play
           await playAudio(newAudioBase64);

        } catch (ttsErr: any) {
          console.error("TTS Error", ttsErr);
          setStatusMessage(ttsErr.message || "Voice generation failed");
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
        audioUrl: newAudioBase64 || undefined
      };
      setHistory(prev => [newItem, ...prev]);

    } catch (err: any) {
      console.error("Processing error:", err);
      setError(err.message || "An unexpected error occurred");
      setStatusMessage(null);
      setIsProcessing(false);
      setIsGeneratingVoice(false);
    }
  };


  // --- Animations ---
  const pulseAnim = useSharedValue(1);
  useEffect(() => {
    if (isRecording) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 1000, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.in(Easing.ease) })
        ),
        -1, // infinite
        false
      );
    } else {
      pulseAnim.value = withTiming(1, { duration: 300 });
    }
  }, [isRecording]);

  const pulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseAnim.value }],
      opacity: isRecording ? 1 - (pulseAnim.value - 1) * 1.5 : 0,
    };
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Background accents */}
      <View style={styles.topGlow} />
      <View style={styles.bottomGlow} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.logoIcon}>
            <Feather name="globe" size={20} color="#000" />
          </View>
          <Text style={styles.titleText}>
            Shak<Text style={styles.titleTextHighlight}>Translate</Text>
          </Text>
        </View>
        <View style={styles.headerIcons}>
          <Feather name="settings" size={20} color="rgba(255,255,255,0.4)" style={styles.headerIcon} />
          <Feather name="info" size={20} color="rgba(255,255,255,0.4)" style={styles.headerIcon} />
        </View>
      </View>

      {/* Languages Banner */}
      <View style={styles.langListWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langList}>
          {LANGUAGES.map(lang => (
            <TouchableOpacity
              key={lang.code}
              style={[styles.langPill, selectedLang === lang.code && styles.langPillSelected]}
              onPress={() => setSelectedLang(lang.code)}
            >
              <Text style={[styles.langPillText, selectedLang === lang.code && styles.langPillTextSelected]}>
                {lang.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        
        {/* Idle/Empty */}
        {!currentTranslation && !isRecording && !isProcessing && !error && (
          <View style={styles.centerBox}>
            <Feather name="globe" size={48} color="rgba(255,255,255,0.2)" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyTitle}>Tap the mic to start translating</Text>
            <Text style={styles.emptySub}>Supports Spanish, French, Italian, German, Arabic, Mandarin</Text>
          </View>
        )}

        {/* Recording State */}
        {isRecording && (
          <View style={styles.centerBox}>
            <View style={styles.barsContainer}>
              {[...Array(6)].map((_, i) => (
                <View 
                  key={i} 
                  style={[
                    styles.audioBar,
                    { height: 16 + Math.random() * (audioLevel || 0.1) * 80 }
                  ]} 
                />
              ))}
            </View>
            <Text style={styles.statusTextPrimary}>LISTENING...</Text>
          </View>
        )}

        {/* Processing State */}
        {isProcessing && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#39FF14" />
            <Text style={[styles.statusTextSecondary, { marginTop: 16 }]}>PROCESSING...</Text>
          </View>
        )}

        {/* Status messages while not doing major states */}
        {statusMessage && !isRecording && !isProcessing && (
          <View style={styles.centerBox}>
            <Text style={[styles.statusTextSecondary]}>{statusMessage.toUpperCase()}</Text>
          </View>
        )}

        {/* Error */}
        {error && !isRecording && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>ERROR</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Text style={styles.errorDismiss}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Translation Card */}
        {currentTranslation && !isRecording && !isProcessing && !error && (
          <View style={styles.translationCard}>
            <View style={styles.langBadge}>
              <Text style={styles.langBadgeText}>{currentTranslation.detectedLanguage}</Text>
             </View>
             <View style={styles.translationRow}>
               <View style={styles.translationTextCol}>
                 <Text style={styles.originalText}>"{currentTranslation.originalText}"</Text>
                 <Text style={styles.translatedText}>{currentTranslation.translatedText}</Text>
               </View>
               <View style={styles.translationActionCol}>
                 <TouchableOpacity 
                   disabled={!currentAudioBase64 || isGeneratingVoice}
                   onPress={() => currentAudioBase64 && togglePlayback(currentAudioBase64)}
                   style={[
                     styles.playBtnLarge,
                     (!currentAudioBase64 || isGeneratingVoice) && styles.playBtnLargeDisabled
                   ]}
                 >
                   {isGeneratingVoice ? (
                      <ActivityIndicator size="small" color="#fff" />
                   ) : (
                      <Feather 
                        name={(playingBase64 === currentAudioBase64 && playingBase64 !== null) ? "pause" : "play"} 
                        size={24} 
                        color={(!currentAudioBase64 || isGeneratingVoice) ? "rgba(255,255,255,0.4)" : "#000"} 
                      />
                   )}
                 </TouchableOpacity>
                 <Text style={styles.playBtnLabel}>
                   {isGeneratingVoice ? "LOADING" : ((playingBase64 === currentAudioBase64 && playingBase64 !== null) ? "PAUSE" : "PLAY")}
                 </Text>
               </View>
             </View>
          </View>
        )}

        {/* History Area */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <View style={styles.historyHeader}>
              <View style={{flexDirection:'row', alignItems:'center'}}>
                <Feather name="message-square" size={14} color="rgba(255,255,255,0.4)" />
                <Text style={styles.historyTitle}> RECENT TRANSLATIONS</Text>
              </View>
              <TouchableOpacity onPress={() => setHistory([])}>
                <Text style={styles.historyClear}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{paddingBottom: 20}} showsVerticalScrollIndicator={false}>
              {history.map(item => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyCardContent}>
                    <View style={styles.historyCardMeta}>
                      <Text style={styles.historyCardLang}>{item.detectedLanguage}</Text>
                      <Text style={styles.historyCardDot}> • </Text>
                      <Text style={styles.historyCardTime}>
                        {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </Text>
                    </View>
                    <Text style={styles.historyCardText} numberOfLines={1}>{item.translatedText}</Text>
                  </View>
                  <TouchableOpacity 
                    disabled={!item.audioUrl}
                    onPress={() => item.audioUrl && togglePlayback(item.audioUrl)}
                    style={[
                      styles.historyPlayBtn,
                      !item.audioUrl && { backgroundColor: 'rgba(255,255,255,0.05)' }
                    ]}
                  >
                    <Feather 
                      name={(playingBase64 === item.audioUrl && playingBase64 !== null) ? "pause" : "play"} 
                      size={14} 
                      color={item.audioUrl ? "#39FF14" : "rgba(255,255,255,0.2)"} 
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

      </View>

      {/* Controls Container */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity 
          style={[styles.sideBtn, isMuted && styles.sideBtnWarn]}
          onPress={() => setIsMuted(!isMuted)}
        >
          <Feather name={isMuted ? "volume-x" : "volume-2"} size={20} color={isMuted ? "#ef4444" : "rgba(255,255,255,0.6)"} />
        </TouchableOpacity>

        <View style={styles.micWrapper}>
          {isRecording && <Animated.View style={[styles.micPulseRing, pulseStyle]} />}
          <TouchableOpacity 
            style={[styles.micBtn, isRecording && styles.micBtnRecording]}
            onPress={handleRecordPress}
            activeOpacity={0.8}
          >
            <Feather name={isRecording ? "mic-off" : "mic"} size={32} color={isRecording ? "#fff" : "#000"} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.sideBtn}
          onPress={() => {
            if(sound) sound.stopAsync();
            setPlayingBase64(null);
            setCurrentTranslation(null);
            setCurrentAudioBase64(null);
            setHistory([]);
          }}
        >
          <Feather name="rotate-ccw" size={20} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  topGlow: {
    position: 'absolute',
    top: -100, right: -100,
    width: 300, height: 300,
    borderRadius: 150,
    backgroundColor: '#39FF14',
    opacity: 0.05,
  },
  bottomGlow: {
    position: 'absolute',
    bottom: -100, left: -100,
    width: 300, height: 300,
    borderRadius: 150,
    backgroundColor: '#39FF14',
    opacity: 0.05,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    width: 32, height: 32,
    borderRadius: 8,
    backgroundColor: '#39FF14',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  titleText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  titleTextHighlight: {
    color: '#39FF14',
  },
  headerIcons: {
    flexDirection: 'row',
  },
  headerIcon: {
    marginLeft: 16,
  },
  langListWrapper: {
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  langList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  langPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 4,
  },
  langPillSelected: {
    backgroundColor: '#39FF14',
  },
  langPillText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  langPillTextSelected: {
    color: '#000',
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  centerBox: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  emptySub: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 14,
    textAlign: 'center',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    marginBottom: 20,
  },
  audioBar: {
    width: 6,
    backgroundColor: '#39FF14',
    borderRadius: 3,
    marginHorizontal: 4,
  },
  statusTextPrimary: {
    color: '#39FF14',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 3,
  },
  statusTextSecondary: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 3,
  },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 16,
    padding: 16,
  },
  errorTitle: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
  },
  errorDismiss: {
    color: '#ef4444',
    fontSize: 10,
    textDecorationLine: 'underline',
    marginTop: 12,
    letterSpacing: 1,
    opacity: 0.8,
  },
  translationCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.3)',
    padding: 20,
    marginBottom: 24,
    position: 'relative',
  },
  langBadge: {
    position: 'absolute',
    top: -10,
    left: 20,
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 8,
  },
  langBadgeText: {
    color: '#39FF14',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  translationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  translationTextCol: {
    flex: 1,
    paddingRight: 16,
  },
  originalText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  translatedText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 24,
  },
  translationActionCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnLarge: {
    width: 64, height: 64,
    borderRadius: 32,
    backgroundColor: '#39FF14',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 4,
    borderColor: '#0A0A0A',
  },
  playBtnLargeDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  playBtnLabel: {
    color: '#39FF14',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    letterSpacing: 1,
  },
  historySection: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  historyTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  historyClear: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
  },
  historyCard: {
    backgroundColor: 'rgba(26,26,26,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  historyCardContent: {
    flex: 1,
    marginRight: 12,
  },
  historyCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyCardLang: {
    color: 'rgba(57,255,20,0.6)',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textTransform: 'uppercase',
  },
  historyCardDot: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
  },
  historyCardTime: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
  },
  historyCardText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  historyPlayBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(57,255,20,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 40,
  },
  sideBtn: {
    width: 48, height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideBtnWarn: {
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  micWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micPulseRing: {
    position: 'absolute',
    width: 80, height: 80,
    borderRadius: 40,
    backgroundColor: '#ef4444',
  },
  micBtn: {
    width: 80, height: 80,
    borderRadius: 40,
    backgroundColor: '#39FF14',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#39FF14',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  micBtnRecording: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
  },
});
