/**
 * KochideeChat — eigenständige Chat-Komponente für den KI-Assistent.
 *
 * Zwei Modi:
 *  - "tab"     → WasKocheIch: Pantry-Daten werden übergeben und an die API geschickt.
 *                onChatComplete wird aufgerufen, wenn das Profil fertig ist.
 *  - "overlay" → MeineRezepte: Keine Pantry-Daten, kein Kontext-Laden.
 *                Nach Abschluss werden Rezeptvorschläge direkt im Chat angezeigt.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle, Send, X, Loader2, ChefHat, Clock, CheckCircle2,
} from "lucide-react";
import { authFetch, authHeaders } from "@/lib/authFetch";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = "/api";
const MAX_CHAT_ROUNDS = 3;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  message: string;
  extractedIngredients: string[];
  suggestedChips: string[];
  isComplete: boolean;
  finalProfile: { ingredients: string[]; moods: string[]; exclusions: string[] } | null;
}

interface KochideeContext {
  pantry: Array<{
    name: string;
    location: string;
    isDefault: boolean;
    urgency: "today" | "soon" | "good";
    expiryDate?: string | null;
  }>;
  recentlyCooked: Array<{ title: string; date: string }>;
  weekPlan: Array<{ title: string; date: string }>;
  frequentRecipes: Array<{ title: string; category: string; cookedCount: number }>;
  topRatedRecipes: Array<{ title: string; category: string; rating: string | null }>;
}

interface PantryItem {
  id?: number;
  ingredientName: string;
  isDefault: number;
}

interface SuggestedRecipe {
  id: number;
  title: string;
  category: string;
  difficulty: string;
  totalTime?: string | null;
  imageUrl?: string | null;
  matchScore?: number;
  ingredientMatches?: number;
}

export interface KochideeChatCompleteParams {
  profile: { ingredients: string[]; moods: string[]; exclusions: string[] };
  extractedIngredients: string[];
}

export interface KochideeChatProps {
  mode: "tab" | "overlay";
  /** Tab-Modus: Pantry-Einträge aus WasKocheIch */
  pantryItems?: PantryItem[];
  pantryDefaultIngredients?: Set<string>;
  /** Tab-Modus: wird aufgerufen, wenn das Chat-Profil fertig ist */
  onChatComplete?: (params: KochideeChatCompleteParams) => void;
  /** Öffnet ein Rezept (beide Modi) */
  onRecipeClick: (id: number) => void;
  /** Overlay: Schliessen-Callback */
  onClose?: () => void;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟",
  Geflügel: "🍗",
  Fleisch: "🥩",
  Vegetarisch: "🌿",
  Pasta: "🍝",
};

export default function KochideeChat({
  mode,
  pantryItems = [],
  pantryDefaultIngredients = new Set(),
  onChatComplete,
  onRecipeClick,
  onClose,
}: KochideeChatProps) {
  const { token } = useAuth();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatChips, setChatChips] = useState<string[]>([]);
  const [chatRounds, setChatRounds] = useState(0);
  const [chatActive, setChatActive] = useState(false);
  const [chatContext, setChatContext] = useState<KochideeContext | null>(null);
  const [chatContextLoading, setChatContextLoading] = useState(false);
  const [surpriseMode, setSurpriseMode] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [chatCompleted, setChatCompleted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Kontext nur im Tab-Modus laden
  const loadChatContext = useCallback(async (): Promise<KochideeContext | null> => {
    if (mode === "overlay") return null;
    if (chatContext) return chatContext;
    if (!token) return null;
    setChatContextLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/kochidee-context`, { headers: authHeaders() });
      if (!res.ok) return null;
      const data: KochideeContext = await res.json();
      setChatContext(data);
      return data;
    } catch {
      return null;
    } finally {
      setChatContextLoading(false);
    }
  }, [token, chatContext, mode]);

  // Im Overlay-Modus: keine Pantry-Standardzutaten übergeben
  const getPantryDefaults = () => {
    if (mode === "overlay") return [];
    return pantryItems.filter((i) => i.isDefault === 1).map((i) => i.ingredientName);
  };

  const resetChat = () => {
    setChatActive(false);
    setChatMessages([]);
    setChatChips([]);
    setChatRounds(0);
    setSuggestions([]);
    setSurpriseMode(false);
    setChatInput("");
    setChatCompleted(false);
  };

  // Nach Abschluss: Tab → Callback; Overlay → Rezepte laden
  const handleComplete = async (
    profile: { ingredients: string[]; moods: string[]; exclusions: string[] },
    extractedIngredients: string[],
  ) => {
    if (mode === "tab") {
      setChatActive(false);
      onChatComplete?.({ profile, extractedIngredients });
    } else {
      // Overlay-Modus: sofort Abschluss-State setzen, Rezepte via smart-search laden
      setChatActive(false);
      setChatCompleted(true);
      setSuggestLoading(true);
      try {
        const res = await authFetch(`${API_BASE}/recipes/smart-search`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ profile }),
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.recipes ?? []);
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }
  };

  const startChat = async (withSurprise = false) => {
    setSurpriseMode(withSurprise);
    setSuggestions([]);
    const ctx = await loadChatContext();

    if (withSurprise) {
      setChatMessages([{ role: "assistant", content: "🎲 Lass mich dir eine Überraschung vorschlagen..." }]);
      setChatActive(true);
      setChatChips([]);
      setChatRounds(0);

      const pantryDefaults = getPantryDefaults();
      setChatLoading(true);
      try {
        const res = await authFetch(`${API_BASE}/kochidee-chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Überrasch mich! Schlag mir etwas völlig Neues vor." }],
            pantryIngredients: pantryDefaults,
            forceComplete: false,
            surpriseMode: true,
            context: ctx,
          }),
        });
        if (!res.ok) throw new Error("Chat fehlgeschlagen");
        const data: ChatResponse = await res.json();
        setChatMessages([
          { role: "user", content: "Überrasch mich! Schlag mir etwas völlig Neues vor." },
          { role: "assistant", content: data.message },
        ]);
        setChatChips(data.suggestedChips ?? []);
        setChatRounds(1);
      } catch {
        setChatMessages([{ role: "assistant", content: "Entschuldigung, da ist etwas schiefgelaufen. Versuche es nochmal." }]);
      } finally {
        setChatLoading(false);
      }
    } else {
      const initialMessage =
        mode === "overlay"
          ? "Was möchtest du heute kochen? Beschreib mir einfach deine Idee \u2013 z.B. 'etwas mit Kartoffeln' oder 'schnell, vegetarisch, herzhaft'."
          : "Was hast du gerade zuhause? Schreib mir einfach, was du im K\u00fchlschrank oder in der Speisekammer hast \u2013 z.B. 'H\u00e4hnchen und ein bisschen Gem\u00fcse'.";
      const initialChips =
        mode === "overlay"
          ? ["Etwas mit Kartoffeln", "Vegetarisch, < 30 Min", "Herzhaft und schnell", "Pasta ohne Fleisch"]
          : ["Hähnchen und Gemüse", "Pasta und Tomaten", "Fisch und Kartoffeln"];

      setChatMessages([{ role: "assistant", content: initialMessage }]);
      setChatActive(true);
      setChatChips(initialChips);
      setChatRounds(0);
    }
  };

  const sendChatMessage = async (content: string) => {
    if (!content.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatChips([]);
    setChatLoading(true);

    const newRoundCount = chatRounds + 1;
    const forceComplete = newRoundCount >= MAX_CHAT_ROUNDS;
    const pantryDefaults = getPantryDefaults();

    try {
      const res = await authFetch(`${API_BASE}/kochidee-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          messages: newMessages,
          pantryIngredients: pantryDefaults,
          forceComplete,
          surpriseMode,
          context: chatContext,
        }),
      });
      if (!res.ok) throw new Error("Chat fehlgeschlagen");
      const data: ChatResponse = await res.json();

      setChatRounds(newRoundCount);
      const shouldComplete = data.isComplete || forceComplete;

      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            shouldComplete && !data.isComplete
              ? "Super! Ich habe genug Infos – lass mich passende Rezepte für dich suchen..."
              : data.message,
        },
      ]);
      setChatChips(shouldComplete ? [] : (data.suggestedChips ?? []));

      if (shouldComplete) {
        const profile = data.finalProfile ?? {
          ingredients: data.extractedIngredients ?? [],
          moods: [],
          exclusions: [],
        };
        await handleComplete(profile, data.extractedIngredients ?? []);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Entschuldigung, da ist etwas schiefgelaufen. Versuche es nochmal." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // ─── Ladeanimation (nach Chat-Abschluss, Rezepte werden gesucht) ─────────────
  if (chatCompleted && suggestLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
        <p className="font-serif text-sm">Ich suche passende Rezepte…</p>
      </div>
    );
  }

  // ─── Rezeptvorschläge (nach Abschluss, Treffer gefunden) ─────────────────────
  if (chatCompleted && !suggestLoading && suggestions.length > 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h3 className="font-serif font-semibold text-base text-foreground">✨ Passende Rezepte</h3>
          <div className="flex gap-2">
            <button
              onClick={resetChat}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl border border-border hover:bg-[#f5ede0] transition-colors"
            >
              Neu starten
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl border border-border text-muted-foreground hover:bg-[#f5ede0] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="overflow-y-auto flex-1 grid grid-cols-2 gap-3 content-start">
          {suggestions.map((recipe) => {
            const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";
            return (
              <button
                key={recipe.id}
                onClick={() => onRecipeClick(recipe.id)}
                className="bg-white rounded-2xl border border-border overflow-hidden text-left hover:shadow-md transition-all active:scale-95"
                style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.10)" }}
              >
                <div className="relative w-full overflow-hidden" style={{ paddingTop: "56%" }}>
                  {recipe.imageUrl ? (
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-4xl"
                      style={{ background: "linear-gradient(135deg, #f5ede0, #f0e0c8)" }}
                    >
                      {emoji}
                    </div>
                  )}
                  <span
                    className="absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full text-white shadow"
                    style={{ background: "rgba(45,82,64,0.85)" }}
                  >
                    {emoji} {recipe.category}
                  </span>
                  {(recipe.ingredientMatches ?? 0) > 0 && (
                    <span
                      className="absolute top-2 right-2 flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full text-white shadow"
                      style={{ background: "rgba(193,105,58,0.88)" }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {recipe.ingredientMatches}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <h4 className="font-serif font-semibold text-foreground text-xs leading-snug line-clamp-2 mb-1.5">
                    {recipe.title}
                  </h4>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        recipe.difficulty === "simpel"
                          ? "bg-green-100 text-green-700"
                          : recipe.difficulty === "normal"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      <ChefHat className="w-2.5 h-2.5 inline mr-0.5" />
                      {recipe.difficulty}
                    </span>
                    {recipe.totalTime && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Clock className="w-2.5 h-2.5" />
                        {recipe.totalTime.replace("ca. ", "")}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Keine Treffer / Fehler (nach Abschluss, 0 Ergebnisse) ──────────────────
  if (chatCompleted && !suggestLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
        <span className="text-4xl">🔍</span>
        <div>
          <p className="font-serif font-semibold text-foreground mb-1">Dazu habe ich leider nichts gefunden</p>
          <p className="text-xs text-muted-foreground">Versuch es mit anderen Zutaten oder einem neuen Gespräch.</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={resetChat}
            className="px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-medium hover:bg-[#2d5240] transition-colors"
          >
            Nochmal versuchen
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-border text-sm rounded-xl text-muted-foreground hover:bg-[#f5ede0] transition-colors"
            >
              Schliessen
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Startbildschirm + aktiver Chat ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {!chatActive ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {mode === "overlay"
              ? "Beschreibe was du heute kochen möchtest – die KI stellt gezielte Rückfragen und sucht dann passende Rezepte."
              : "Schreib einfach was du zuhause hast – die KI extrahiert Zutaten und stellt gezielte Rückfragen."}
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => startChat(false)}
              disabled={chatContextLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-medium hover:bg-[#2d5240] transition-colors disabled:opacity-60"
            >
              {chatContextLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageCircle className="w-4 h-4" />
              )}
              Assistent starten
            </button>
            <button
              onClick={() => startChat(true)}
              disabled={chatContextLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#c1693a] text-white rounded-xl text-sm font-medium hover:bg-[#a0542e] transition-colors disabled:opacity-60"
            >
              {chatContextLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span className="text-base leading-none">🎲</span>
              )}
              Überrasch mich
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="space-y-3 flex-1 overflow-y-auto mb-3 pr-1">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#4A7C59] text-white rounded-br-sm"
                      : "bg-[#f5ede0] text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#f5ede0] px-4 py-2.5 rounded-2xl rounded-bl-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-[#4A7C59]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {chatChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 flex-shrink-0">
              {chatChips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => sendChatMessage(chip)}
                  disabled={chatLoading}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#4A7C59]/10 text-[#4A7C59] border border-[#4A7C59]/20 hover:bg-[#4A7C59]/20 transition-colors disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 flex-shrink-0">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChatMessage(chatInput);
              }}
              placeholder="Antworte der KI…"
              disabled={chatLoading}
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-[#fdfaf6] text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 disabled:opacity-60"
            />
            <button
              onClick={() => sendChatMessage(chatInput)}
              disabled={!chatInput.trim() || chatLoading}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#4A7C59] text-white text-sm font-medium hover:bg-[#2d5240] disabled:opacity-40 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              onClick={resetChat}
              className="px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-[#f5ede0] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 flex-shrink-0">
            Runde {chatRounds} / max. 3
          </p>
        </div>
      )}
    </div>
  );
}
