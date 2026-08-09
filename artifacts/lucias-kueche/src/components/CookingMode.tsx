import { useState, useEffect, useCallback, useRef } from "react";
import type { Recipe } from "@/types/recipe";
import { X, ChevronLeft, ChevronRight, Timer, Play, Pause, RotateCcw, MonitorOff } from "lucide-react";
import { useWakeLock } from "@/hooks/useWakeLock";

interface Props {
  recipe: Recipe;
  onClose: () => void;
}

function parseTimeToSeconds(amount: number, unit: string): number {
  const u = unit.toLowerCase().replace(/\./, "");
  if (u.startsWith("stund") || u === "h") return amount * 3600;
  if (u.startsWith("sek")) return amount;
  return amount * 60;
}

function extractTimers(text: string): Array<{ label: string; seconds: number }> {
  const results: Array<{ label: string; seconds: number }> = [];
  const regex = /(\d+)(?:\s*(?:bis|–|-)\s*\d+)?\s*(Minuten?|Stunden?|Sekunden?|Min\.?|Std\.?|Sek\.?|min\.?|h\b)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];
    const seconds = parseTimeToSeconds(amount, unit);
    if (seconds > 0) {
      results.push({ label: `${match[1]} ${unit}`, seconds });
    }
  }
  return results;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface TimerState {
  totalSeconds: number;
  remaining: number;
  running: boolean;
  label: string;
  finished: boolean;
}

export default function CookingMode({ recipe, onClose }: Props) {
  const steps = recipe.steps as string[];
  const [stepIndex, setStepIndex] = useState(0);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alarmRef = useRef<AudioContext | null>(null);
  const wakeLockActive = useWakeLock(true);

  const currentStep = steps[stepIndex];
  const detectedTimers = extractTimers(currentStep ?? "");


  useEffect(() => {
    if (timer && timer.running && !timer.finished) {
      intervalRef.current = setInterval(() => {
        setTimer((prev) => {
          if (!prev || !prev.running) return prev;
          const next = prev.remaining - 1;
          if (next <= 0) {
            clearInterval(intervalRef.current!);
            playAlarm();
            triggerVibration();
            return { ...prev, remaining: 0, running: false, finished: true };
          }
          return { ...prev, remaining: next };
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timer?.running, timer?.finished]);

  function playAlarm() {
    try {
      const ctx = new AudioContext();
      alarmRef.current = ctx;
      const frequencies = [880, 1100, 880, 1100];
      frequencies.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.3);
        gainNode.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.3);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.3 + 0.25);
        oscillator.start(ctx.currentTime + i * 0.3);
        oscillator.stop(ctx.currentTime + i * 0.3 + 0.25);
      });
    } catch {
      // Audio not available
    }
  }

  function triggerVibration() {
    try {
      if ("vibrate" in navigator) {
        navigator.vibrate([300, 100, 300, 100, 600]);
      }
    } catch {
      // Vibration not available
    }
  }

  function startTimer(totalSeconds: number, label: string) {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTimer({ totalSeconds, remaining: totalSeconds, running: true, label, finished: false });
  }

  function togglePause() {
    setTimer((prev) => prev ? { ...prev, running: !prev.running } : prev);
  }

  function resetTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTimer((prev) => prev ? { ...prev, remaining: prev.totalSeconds, running: false, finished: false } : prev);
  }

  const goNext = useCallback(() => {
    if (stepIndex < steps.length - 1) setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length]);

  const goPrev = useCallback(() => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }, [stepIndex]);

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.touches[0].clientX);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    setTouchStart(null);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, onClose]);

  const progress = ((stepIndex + 1) / steps.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#1a2e1e] text-white select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-green-300 text-sm font-medium truncate">{recipe.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-white/60 text-xs">
              Schritt {stepIndex + 1} von {steps.length}
            </p>
            {wakeLockActive && (
              <span className="flex items-center gap-1 text-white/40 text-xs">
                <MonitorOff className="w-3 h-3" />
                Display bleibt an
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          aria-label="Kochmodus beenden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 flex-shrink-0">
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#C1693A] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStepIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === stepIndex ? "bg-[#C1693A] scale-125" : i < stepIndex ? "bg-green-400" : "bg-white/20"
              }`}
              aria-label={`Schritt ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 overflow-auto">
        <div className="max-w-lg w-full">
          <p className="text-3xl font-serif leading-relaxed text-white text-center">
            {currentStep}
          </p>
        </div>
      </div>

      {/* Timer area */}
      {(detectedTimers.length > 0 || timer) && (
        <div className="flex-shrink-0 px-5 pb-2">
          {/* Timer buttons for detected times */}
          {detectedTimers.length > 0 && !timer && (
            <div className="flex flex-wrap gap-2 justify-center mb-2">
              {detectedTimers.map((t, i) => (
                <button
                  key={i}
                  onClick={() => startTimer(t.seconds, t.label)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#C1693A] hover:bg-[#a85830] rounded-xl text-sm font-semibold transition-colors"
                >
                  <Timer className="w-4 h-4" />
                  Timer: {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Active timer */}
          {timer && (
            <div className={`rounded-2xl p-4 flex items-center justify-between gap-4 ${
              timer.finished ? "bg-[#C1693A]" : "bg-white/10"
            }`}>
              <div>
                <p className="text-xs text-white/60 mb-0.5">{timer.label}</p>
                <p className={`text-4xl font-mono font-bold tabular-nums ${timer.finished ? "text-white animate-pulse" : "text-white"}`}>
                  {formatTime(timer.remaining)}
                </p>
                {timer.finished && (
                  <p className="text-sm font-semibold text-white mt-0.5">Fertig! ✓</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={resetTimer}
                  className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  aria-label="Timer zurücksetzen"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={togglePause}
                  className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  aria-label={timer.running ? "Pause" : "Fortfahren"}
                >
                  {timer.running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                {detectedTimers.length > 0 && (
                  <button
                    onClick={() => {
                      if (intervalRef.current) clearInterval(intervalRef.current);
                      setTimer(null);
                    }}
                    className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                    aria-label="Timer schließen"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Start timer for detected times when timer is active */}
          {timer && detectedTimers.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {detectedTimers.map((t, i) => (
                <button
                  key={i}
                  onClick={() => startTimer(t.seconds, t.label)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Timer className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 px-5 pb-8 pt-3">
        <button
          onClick={goPrev}
          disabled={stepIndex === 0}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-semibold text-sm flex-1 justify-center"
        >
          <ChevronLeft className="w-5 h-5" />
          Zurück
        </button>
        {stepIndex < steps.length - 1 ? (
          <button
            onClick={goNext}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#4A7C59] hover:bg-[#3d6849] transition-colors font-semibold text-sm flex-1 justify-center"
          >
            Weiter
            <ChevronRight className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#C1693A] hover:bg-[#a85830] transition-colors font-semibold text-sm flex-1 justify-center"
          >
            Fertig! ✓
          </button>
        )}
      </div>
    </div>
  );
}
