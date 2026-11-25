import {useCallback, useEffect, useRef, useState} from 'react';

export function useVoiceGuidance(initialEnabled = true) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [rate, setRate] = useState(1.0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;
  const lastSpokenRef = useRef<string>('');

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, force = false) => {
      if (!isSupported || (!enabled && !force)) return;
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) return;
      if (!force && clean === lastSpokenRef.current) return;

      lastSpokenRef.current = clean;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [enabled, isSupported, rate]
  );

  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  return {
    enabled,
    setEnabled,
    rate,
    setRate,
    isSpeaking,
    isSupported,
    speak,
    stop,
  };
}
