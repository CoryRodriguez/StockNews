import { useCallback, useRef } from "react";

// Generates a short beep using the Web Audio API — no external files needed
export function useAudioAlert() {
  const ctx = useRef<AudioContext | null>(null);

  const beep = useCallback((frequency = 880, duration = 0.15, volume = 0.3) => {
    try {
      if (!ctx.current) ctx.current = new AudioContext();
      const ac = ctx.current;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.frequency.value = frequency;
      osc.type = "sine";
      gain.gain.setValueAtTime(volume, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration);
    } catch {
      // AudioContext may be blocked before user interaction
    }
  }, []);

  const alertScanner = useCallback(() => beep(880, 0.12, 0.25), [beep]);
  const alertNews = useCallback(() => beep(1100, 0.1, 0.2), [beep]);

  return { alertScanner, alertNews };
}
