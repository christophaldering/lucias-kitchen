import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle, Utensils } from "lucide-react";

const API_BASE = "/api";

interface InviteInfo {
  groupName: string;
  groupImageUrl: string | null;
  inviterName: string;
  invitedEmail: string;
}

type PageState = "loading" | "ready" | "submitting" | "done" | "error";

export default function InviteAccept({ token, onLoggedIn }: { token: string; onLoggedIn: (jwt: string) => void }) {
  const [state, setState] = useState<PageState>("loading");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/invite/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.message ?? "Ungültiger Einladungslink.");
          setState("error");
          return;
        }
        const data = await res.json();
        setInfo(data);
        setState("ready");
      })
      .catch(() => {
        setErrorMsg("Verbindungsfehler. Bitte versuche es später erneut.");
        setState("error");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!displayName.trim()) {
      setFormError("Bitte gib deinen Namen ein.");
      return;
    }
    if (password.length < 6) {
      setFormError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    if (password !== passwordConfirm) {
      setFormError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setState("submitting");
    try {
      const res = await fetch(`${API_BASE}/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim(), password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.message ?? "Ein Fehler ist aufgetreten.");
        setState("ready");
        return;
      }

      const data = await res.json();
      localStorage.setItem("lk_auth_token", data.token);
      setState("done");
      setTimeout(() => onLoggedIn(data.token), 1500);
    } catch {
      setFormError("Verbindungsfehler. Bitte versuche es erneut.");
      setState("ready");
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(160deg, #f9efe0 0%, #f5e8d0 50%, #f2e4c8 100%)" }}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#4A7C59]/10 flex items-center justify-center animate-pulse">
            <Utensils className="w-8 h-8 text-[#4A7C59]" />
          </div>
          <p className="font-script text-2xl text-[#4A7C59]">Einladung wird geladen...</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #f9efe0 0%, #f5e8d0 50%, #f2e4c8 100%)" }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="font-serif text-xl font-semibold mb-2 text-gray-900">Einladung ungültig</h2>
          <p className="text-sm text-gray-600 mb-6">{errorMsg}</p>
          <p className="text-xs text-gray-400">Bitte wende dich an die Person, die dich eingeladen hat, um einen neuen Link zu erhalten.</p>
        </div>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #f9efe0 0%, #f5e8d0 50%, #f2e4c8 100%)" }}>
        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#4A7C59]/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-[#4A7C59]" />
          </div>
          <h2 className="font-serif text-xl font-semibold mb-2 text-[#4A7C59]">Willkommen!</h2>
          <p className="text-sm text-gray-600">Du bist jetzt Mitglied in <strong>{info?.groupName}</strong>. Du wirst gleich weitergeleitet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #f9efe0 0%, #f5e8d0 50%, #f2e4c8 100%)" }}>
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
        <div
          className="px-6 py-6 text-center text-white"
          style={{ background: "linear-gradient(135deg, #1e3d2a 0%, #2a5438 60%, #3d6849 100%)" }}
        >
          <h1 className="font-script text-3xl mb-1">Lucias Küche 🍳</h1>
          <p className="text-green-200 text-sm">Du wurdest eingeladen!</p>
        </div>

        <div className="p-6">
          <div className="bg-[#4A7C59]/5 rounded-xl p-4 mb-5 text-center">
            <p className="text-sm text-gray-700">
              <strong className="text-[#C1693A]">{info?.inviterName}</strong> lädt dich ein, der Gruppe
            </p>
            <p className="font-serif text-lg font-semibold text-[#4A7C59] mt-1">{info?.groupName}</p>
            <p className="text-sm text-gray-600 mt-1">beizutreten.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Dein Anzeigename <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="z.B. Max Mustermann"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Passwort wählen <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mindestens 6 Zeichen"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Passwort bestätigen <span className="text-red-500">*</span>
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Passwort wiederholen"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
              />
            </div>

            {formError && (
              <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg">{formError}</p>
            )}

            <button
              type="submit"
              disabled={state === "submitting"}
              className="w-full py-3 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {state === "submitting" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Wird eingerichtet...</>
              ) : (
                "Beitreten & loslegen"
              )}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400 mt-4">
            Deine E-Mail: <strong>{info?.invitedEmail}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
