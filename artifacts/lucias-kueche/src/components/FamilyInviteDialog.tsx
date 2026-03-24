import { useState } from "react";
import { X, Loader2, UserPlus, CheckCircle, Heart } from "lucide-react";
import { useGroups } from "@/hooks/useGroups";

interface Props {
  onClose: () => void;
}

type Step = "form" | "success";

interface SuccessInfo {
  email: string;
  inviteType: "user" | "email_only";
}

export default function FamilyInviteDialog({ onClose }: Props) {
  const { familyInvite } = useGroups();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await familyInvite(email.trim());
      setSuccessInfo({ email: email.trim(), inviteType: result.inviteType ?? "email_only" });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Einladung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-[#C1693A]" />
            <h2 className="font-serif text-lg font-semibold">Familienmitglied einladen</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {step === "form" && (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Gib die E-Mail-Adresse eines Familienmitglieds ein. Sie werden sofort in deine Familiengruppe eingeladen.
            </p>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                E-Mail-Adresse <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="z.B. mama@beispiel.de"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
                required
                autoFocus
              />
              {error && (
                <p className="mt-1.5 text-xs text-red-600">{error}</p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 border border-border rounded-xl text-sm hover:bg-secondary transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="flex-1 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Einladen
              </button>
            </div>
          </form>
        )}

        {step === "success" && successInfo && (
          <div className="p-6 space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[#4A7C59]/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-[#4A7C59]" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold mb-1">Einladung versandt!</h3>
              {successInfo.inviteType === "user" ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{successInfo.email}</span> wurde direkt in deine Familiengruppe aufgenommen und kann sofort loslegen.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Einladung für <span className="font-medium text-foreground">{successInfo.email}</span> gespeichert – sie können Lucias Küche beitreten und erscheinen dann in deiner Gruppe.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground bg-[#4A7C59]/5 rounded-xl p-3">
              Du findest das eingeladene Mitglied unter „Meine Küche" → Gruppen in deiner Familiengruppe.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
            >
              Fertig
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
