import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setLoadingMsg("Deine Küche wird vorbereitet...");

    setTimeout(() => setLoadingMsg("Rezepte werden geladen... 🍳"), 800);

    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden">
      {/* Full-screen background image — Lucias echte Küche */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('/images/kueche.png')`,
          backgroundPosition: "center 40%",
        }}
      />
      {/* Warm overlay — Küche bleibt erkennbar */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a0e]/65 via-[#2a1a0a]/50 to-[#3d2a10]/40" />

      {/* Glassmorphism card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        {/* Logo */}
        <div className="text-center mb-6">
          <h1 className="font-script text-5xl text-white drop-shadow-lg leading-tight">
            Lucias Küche
          </h1>
          <p className="text-green-100/90 text-sm font-serif italic mt-1 drop-shadow">
            Deine persönliche Rezeptküche
          </p>
        </div>

        {/* Glass card */}
        <div
          className="rounded-3xl p-8 border border-white/20 shadow-2xl"
          style={{
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {loading ? (
            <div className="flex flex-col items-center py-10 gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
                style={{ background: "rgba(255,255,255,0.15)" }}
              >
                <span className="text-3xl">🍳</span>
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <p className="font-serif text-white text-lg">{loadingMsg}</p>
              </div>
              <p className="text-sm text-white/70">Einen Moment bitte...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="text-center mb-2">
                <h2 className="font-serif text-xl font-semibold text-white">
                  Willkommen zurück 👋
                </h2>
                <p className="text-white/70 text-sm mt-1">
                  Meld dich an und entdecke deine Rezepte.
                </p>
              </div>

              {error && (
                <div
                  className="rounded-xl p-4 text-sm flex items-start gap-2 border border-red-300/30"
                  style={{ background: "rgba(239,68,68,0.18)", backdropFilter: "blur(8px)" }}
                >
                  <span className="text-lg flex-shrink-0">😕</span>
                  <div>
                    <p className="font-medium text-white">Hm, das hat nicht geklappt.</p>
                    <p className="mt-0.5 text-white/80">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-white/90">E-Mail-Adresse</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="lucia@beispiel.de"
                  className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none transition-shadow border border-white/25 placeholder-white/40 text-white"
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    backdropFilter: "blur(8px)",
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-white/90">Passwort</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-4 py-3.5 pr-12 rounded-xl text-sm focus:outline-none transition-shadow border border-white/25 placeholder-white/40 text-white"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      backdropFilter: "blur(8px)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl font-semibold text-sm transition-all shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
                style={{
                  background: "linear-gradient(135deg, #3d6849 0%, #4A7C59 50%, #5a9169 100%)",
                  color: "white",
                  minHeight: "48px",
                }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Einloggen
              </button>

              <p className="text-center text-xs text-white/50 pt-1">
                Lucias Küche ist ein geschlossenes System. 🔒
              </p>
            </form>
          )}
        </div>

        {/* Footer quote */}
        <p className="text-center font-script text-white/60 text-lg mt-6 drop-shadow">
          "Kochen ist Liebe, die man essen kann."
        </p>
      </div>
    </div>
  );
}
