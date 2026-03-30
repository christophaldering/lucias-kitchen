import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const API_BASE = "/api";

type Status = "loading" | "success" | "error" | "expired" | "used";

export default function ConfirmDelete({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    let cancelled = false;
    async function confirm() {
      try {
        const res = await fetch(`${API_BASE}/recipes/confirm-delete?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (res.ok) {
          setStatus("success");
        } else {
          const data = await res.json().catch(() => ({}));
          if (data.error === "token_expired") {
            setStatus("expired");
            setMessage(data.message ?? "Dieser Link ist abgelaufen.");
          } else if (data.error === "token_used") {
            setStatus("used");
            setMessage(data.message ?? "Dieser Link wurde bereits verwendet.");
          } else {
            setStatus("error");
            setMessage(data.message ?? "Ein Fehler ist aufgetreten.");
          }
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Verbindungsfehler. Bitte versuche es erneut.");
        }
      }
    }
    confirm();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (status !== "loading") {
      const interval = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            window.location.href = "/?admin=1";
            return 0;
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [status]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(160deg, #f9efe0 0%, #f5e8d0 50%, #f2e4c8 100%)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <h1 className="font-script text-3xl text-[#4A7C59] mb-6">Lucias Küche 🍳</h1>

        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-[#4A7C59] animate-spin mx-auto mb-4" />
            <p className="text-base font-medium text-gray-700">Bestätigung wird verarbeitet…</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Alle Rezepte gelöscht</h2>
            <p className="text-sm text-gray-500 mb-4">
              Alle Rezepte wurden erfolgreich und unwiderruflich gelöscht.
            </p>
            <p className="text-xs text-gray-400">
              Du wirst in {countdown} Sekunde{countdown !== 1 ? "n" : ""} weitergeleitet…
            </p>
          </>
        )}

        {(status === "expired" || status === "used") && (
          <>
            <AlertTriangle className="w-14 h-14 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Link ungültig</h2>
            <p className="text-sm text-gray-500 mb-4">{message}</p>
            <p className="text-xs text-gray-400 mb-3">
              Du wirst in {countdown} Sekunde{countdown !== 1 ? "n" : ""} weitergeleitet…
            </p>
            <button
              onClick={() => { window.location.href = "/?admin=1"; }}
              className="w-full py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
            >
              Zur App
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Fehler</h2>
            <p className="text-sm text-gray-500 mb-4">{message || "Ein unerwarteter Fehler ist aufgetreten."}</p>
            <p className="text-xs text-gray-400">
              Du wirst in {countdown} Sekunde{countdown !== 1 ? "n" : ""} weitergeleitet…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
