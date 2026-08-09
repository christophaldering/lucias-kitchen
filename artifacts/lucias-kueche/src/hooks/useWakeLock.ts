import { useEffect, useRef, useState } from "react";

type NavWithWakeLock = Navigator & {
  wakeLock: { request(type: "screen"): Promise<WakeLockSentinel> };
};

/**
 * Hält das Display wach, solange der Hook mit `active = true` gemountet ist.
 * Kein Fehler, keine Meldung wenn die API fehlt — der Hook tut dann still nichts.
 * Gibt `isActive` zurück: true wenn der Lock gerade gehalten wird.
 */
export function useWakeLock(active: boolean): boolean {
  const lockRef = useRef<WakeLockSentinel | null>(null);
  const [isActive, setIsActive] = useState(false);
  const supported =
    typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    if (!active || !supported) return;

    let cancelled = false;

    async function acquire() {
      // Bereits gehalten — nicht doppelt anfordern
      if (lockRef.current && !lockRef.current.released) return;
      try {
        const sentinel = await (navigator as NavWithWakeLock).wakeLock.request(
          "screen",
        );
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        lockRef.current = sentinel;
        setIsActive(true);
        sentinel.addEventListener("release", () => {
          if (!cancelled) setIsActive(false);
        });
      } catch (err) {
        console.warn("[Wake Lock] konnte nicht angefordert werden:", err);
      }
    }

    function onVisibilityChange() {
      // Browser gibt den Lock beim Tab-Wechsel frei — beim Zurückkehren neu anfordern
      if (document.visibilityState === "visible") {
        lockRef.current = null;
        acquire();
      }
    }

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (lockRef.current && !lockRef.current.released) {
        lockRef.current.release().catch(() => {});
      }
      lockRef.current = null;
      setIsActive(false);
    };
  }, [active, supported]);

  return isActive;
}
