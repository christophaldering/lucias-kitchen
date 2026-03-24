import { useState } from "react";
import { Eye, EyeOff, ChefHat, Loader2 } from "lucide-react";
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
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left side – kitchen atmosphere */}
      <div className="hidden md:flex md:w-1/2 relative flex-col justify-center items-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, #2d5a3d 0%, #4A7C59 40%, #7BA05B 70%, #C1693A 100%)" }}>

        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 80%, #fff 1px, transparent 1px),
              radial-gradient(circle at 80% 20%, #fff 1px, transparent 1px),
              radial-gradient(circle at 50% 50%, #fff 0.5px, transparent 0.5px)`,
            backgroundSize: "60px 60px, 80px 80px, 30px 30px"
          }} />

        <div className="relative z-10 text-center px-12 max-w-lg">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/20 flex items-center justify-center shadow-2xl backdrop-blur">
              <ChefHat className="w-12 h-12 text-white" />
            </div>
            <h1 className="font-script text-6xl text-white mb-3 drop-shadow-lg">
              Lucias Küche
            </h1>
            <p className="text-green-100 text-xl font-serif italic">
              Deine persönliche Rezeptküche
            </p>
          </div>

          <div className="bg-white/15 backdrop-blur rounded-2xl p-6 border border-white/20 shadow-xl">
            <p className="font-script text-2xl text-white leading-relaxed">
              "Kochen ist Liebe, die man essen kann."
            </p>
            <p className="text-green-200 text-sm mt-3 font-sans">
              — Bewährte Lieblingsrezepte, mit Herz gekocht seit Jahren
            </p>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-4 text-center">
            {[
              { emoji: "🍝", label: "Pasta" },
              { emoji: "🐟", label: "Fisch" },
              { emoji: "🍗", label: "Geflügel" },
            ].map(item => (
              <div key={item.label} className="bg-white/10 rounded-xl p-3 backdrop-blur">
                <div className="text-2xl mb-1">{item.emoji}</div>
                <div className="text-white text-xs font-medium">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="font-script text-white/60 text-lg">Mit Liebe gekocht 🍴</p>
        </div>
      </div>

      {/* Mobile hero */}
      <div className="md:hidden h-32 relative flex items-center justify-center overflow-hidden"
        style={{ background: "linear-gradient(135deg, #2d5a3d 0%, #4A7C59 60%, #C1693A 100%)" }}>
        <div className="text-center">
          <h1 className="font-script text-4xl text-white drop-shadow">Lucias Küche 🍳</h1>
          <p className="text-green-200 text-sm font-serif italic">Deine persönliche Rezeptküche</p>
        </div>
      </div>

      {/* Right side – login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-[#FDF6EC]">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center md:text-left">
            <h2 className="font-serif text-3xl font-semibold text-foreground mb-2">
              Willkommen zurück! 👋
            </h2>
            <p className="text-muted-foreground">
              Meld dich an und entdecke deine Rezepte.
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-16 gap-4">
              <div className="w-16 h-16 rounded-full bg-[#4A7C59]/10 flex items-center justify-center animate-pulse">
                <ChefHat className="w-8 h-8 text-[#4A7C59]" />
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#4A7C59]" />
                <p className="font-serif text-lg text-foreground">{loadingMsg}</p>
              </div>
              <p className="text-sm text-muted-foreground">Einen Moment bitte...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm flex items-start gap-2">
                  <span className="text-lg flex-shrink-0">😕</span>
                  <div>
                    <p className="font-medium">Hm, das hat nicht geklappt.</p>
                    <p className="mt-0.5">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">E-Mail-Adresse</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="lucia@beispiel.de"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/40 transition-shadow"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Passwort</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/40 transition-shadow"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-[#4A7C59] text-white rounded-xl font-semibold text-sm hover:bg-[#3d6849] transition-colors shadow-md hover:shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Einloggen
              </button>

              <p className="text-center text-xs text-muted-foreground pt-2">
                Lucias Küche ist ein geschlossenes System. 🔒
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
