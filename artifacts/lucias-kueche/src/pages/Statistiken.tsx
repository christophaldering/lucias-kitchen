import { useRecipes } from "@/hooks/useRecipes";
import { useKcalHistory } from "@/hooks/useNutritionSummary";
import { useCookingLog } from "@/hooks/useCookingLog";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Loader2, Flame } from "lucide-react";
import type { Recipe } from "@/types/recipe";
import { useState, useEffect, useRef } from "react";

function useCountUp(target: number, duration = 1200): number {
  const [count, setCount] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    startRef.current = null;
    const animate = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return count;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

const COLORS = ["#4A7C59", "#C1693A", "#7BA05B", "#D4956A", "#5B8E7D", "#E8A96B"];

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟", Geflügel: "🍗", Fleisch: "🥩", Vegetarisch: "🌿", Pasta: "🍝",
};

function buildCategoryData(recipes: Recipe[]) {
  const counts: Record<string, number> = {};
  recipes.forEach((r) => {
    counts[r.category] = (counts[r.category] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function parseTotalMinutes(totalTime: string | null): number {
  if (!totalTime) return Infinity;
  const match = totalTime.match(/(\d+)/g);
  if (!match) return Infinity;
  const nums = match.map(Number);
  if (nums.length === 1) return nums[0];
  return nums[0] * 60 + (nums[1] ?? 0);
}

function buildTimeData(recipes: Recipe[]) {
  const buckets = [
    { label: "≤30 Min", check: (m: number) => m <= 30 },
    { label: "31–45 Min", check: (m: number) => m > 30 && m <= 45 },
    { label: "46–60 Min", check: (m: number) => m > 45 && m <= 60 },
    { label: ">60 Min", check: (m: number) => m > 60 },
  ];
  return buckets.map((b) => ({
    name: b.label,
    Rezepte: recipes.filter((r) => b.check(parseTotalMinutes(r.totalTime))).length,
  }));
}

function buildDifficultyData(recipes: Recipe[]) {
  const counts: Record<string, number> = {};
  recipes.forEach((r) => {
    counts[r.difficulty] = (counts[r.difficulty] || 0) + 1;
  });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

const RATING_SCORE: Record<string, number> = {
  "sehr lecker": 2,
  "lecker": 1,
};

function getTopRecipes(recipes: Recipe[], n = 3) {
  return [...recipes]
    .sort((a, b) => {
      const ratingDiff = (RATING_SCORE[b.rating ?? ""] ?? 0) - (RATING_SCORE[a.rating ?? ""] ?? 0);
      if (ratingDiff !== 0) return ratingDiff;
      return (b.cookedCount ?? 0) - (a.cookedCount ?? 0);
    })
    .slice(0, n);
}

const insights = [
  "Du liebst Sahnesaucen 🥛",
  "Fisch steht bei dir hoch im Kurs 🐟",
  "Du kochst am liebsten Gerichte unter 45 Minuten ⏱️",
  "Schmelzkäse ist dein Geheimzutat ✨",
  "Vegetarisches passt immer öfter auf den Tisch 🌿",
];

function RecipesHeroCard({ count }: { count: number }) {
  const animated = useCountUp(count);
  return (
    <div
      className="rounded-2xl shadow-md p-6 text-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #2d5240 0%, #4A7C59 60%, #7BA05B 100%)" }}
    >
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: "radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />
      <p className="text-4xl mb-2 relative">📖</p>
      <p className="font-serif font-bold text-white relative" style={{ fontSize: "3.5rem", lineHeight: 1 }}>
        {animated}
      </p>
      <p className="text-sm font-medium text-white/80 mt-2 relative">Rezepte in deiner Küche</p>
    </div>
  );
}

export default function Statistiken() {
  const { recipes, loading, error } = useRecipes();
  const { history: kcalHistory, loading: kcalLoading } = useKcalHistory(4);
  const { entries: logEntries, loading: logLoading } = useCookingLog();

  if (loading) {
    return (
      <div className="flex flex-col items-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-[#4A7C59]" />
        <p className="font-serif text-lg">Statistiken werden geladen…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="font-serif text-lg text-foreground">{error}</p>
      </div>
    );
  }

  const catData = buildCategoryData(recipes);
  const timeData = buildTimeData(recipes);
  const diffData = buildDifficultyData(recipes);
  const top3 = getTopRecipes(recipes, 3);

  const veryDeliciousCount = recipes.filter((r) => r.rating === "sehr lecker").length;
  const sehrLeckerPct = recipes.length ? Math.round((veryDeliciousCount / recipes.length) * 100) : 0;
  const avgIngredients = recipes.length
    ? Math.round(recipes.reduce((s, r) => s + r.ingredients.length, 0) / recipes.length)
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-28 space-y-10">
      <h2 className="font-serif text-2xl font-semibold text-foreground">
        📊 Statistiken & Muster
      </h2>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="col-span-2 sm:col-span-4">
          <RecipesHeroCard count={recipes.length} />
        </div>
        {[
          { label: "\"Sehr lecker\"", value: `${sehrLeckerPct}%`, emoji: "⭐" },
          { label: "Ø Zutaten", value: avgIngredients, emoji: "🛒" },
          { label: "Kategorien", value: catData.length, emoji: "🍽️" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-border shadow-sm p-4 text-center">
            <p className="text-2xl mb-1">{s.emoji}</p>
            <p className="font-serif text-2xl font-bold text-[#4A7C59]">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie chart – categories */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
          <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
            🍽️ Lieblingsküche
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
              <Pie
                data={catData}
                cx="50%"
                cy="50%"
                outerRadius={70}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {catData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart – time */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
          <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
            ⏱️ Schnell vs. aufwendig
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={timeData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="Rezepte" fill="#4A7C59" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart – difficulty */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6 md:col-span-2">
          <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
            👩‍🍳 Schwierigkeitsgrad
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={diffData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={60} />
              <Tooltip />
              <Bar dataKey="value" name="Rezepte" fill="#C1693A" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 3 */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
          ⭐ Favoriten
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {top3.map((r, i) => (
            <div
              key={r.id}
              className={`rounded-xl p-4 flex flex-col gap-2 ${
                i === 0
                  ? "bg-amber-50 border-2 border-amber-300"
                  : i === 1
                  ? "bg-gray-50 border-2 border-gray-200"
                  : "bg-orange-50 border-2 border-orange-200"
              }`}
            >
              <div className="text-3xl">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
              <span className="text-2xl">{CATEGORY_EMOJIS[r.category] ?? "🍽️"}</span>
              <p className="font-serif font-semibold text-sm text-foreground leading-snug">
                {r.title}
              </p>
              <div className="flex flex-col gap-1 mt-auto">
                {r.rating && (
                  <span className="text-xs font-medium text-amber-700">
                    {r.rating === "sehr lecker" ? "⭐⭐ sehr lecker" : "⭐ lecker"}
                  </span>
                )}
                {r.cookedCount != null && r.cookedCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    🍳 {r.cookedCount}× gekocht
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kochprofil */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
          👩‍🍳 Lucias Kochprofil
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {insights.map((insight, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-xl bg-[#4A7C59]/5 border border-[#4A7C59]/10"
            >
              <span className="text-xl">{insight.match(/\p{Emoji}/u)?.[0] ?? "💡"}</span>
              <span className="text-sm text-foreground font-medium">
                {insight.replace(/\p{Emoji}/gu, "").trim()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Kcal-Verlauf der letzten 4 Wochen */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4 text-foreground flex items-center gap-2">
          <Flame className="w-5 h-5 text-[#C1693A]" />
          Kcal-Verlauf (letzte 4 Wochen)
        </h3>
        {kcalLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Wird geladen…</span>
          </div>
        ) : kcalHistory.every((w) => w.totalKcal === 0) ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Noch keine Kcal-Daten aus dem Wochenplan vorhanden.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={kcalHistory} margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value: number) => [`${value.toLocaleString("de-DE")} kcal`, "Gesamt-Kcal"]}
                  labelFormatter={(label) => `Woche ${label}`}
                />
                <Bar dataKey="totalKcal" name="Kcal" fill="#C1693A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Basierend auf geplanten Rezepten mit Kcal-Angabe im Wochenplan.
            </p>
          </>
        )}
      </div>

      {/* Koch-Tagebuch */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
          📓 Mein Koch-Tagebuch
        </h3>
        {logLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="w-5 h-5 animate-spin text-[#4A7C59]" />
            <span className="text-sm">Einträge werden geladen…</span>
          </div>
        ) : logEntries.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">🍳</p>
            <p className="font-serif text-base text-foreground font-medium">Noch keine Kocheinträge</p>
            <p className="text-sm text-muted-foreground mt-1">
              Klicke im Rezept-Modal auf „Heute gekocht", um deinen ersten Eintrag zu erstellen.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {logEntries.map((entry) => (
              <div key={entry.id} className="flex gap-4 p-3 rounded-xl bg-[#4A7C59]/5 border border-[#4A7C59]/10">
                {entry.photoUrl && (
                  <img
                    src={entry.photoUrl}
                    alt="Foto"
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#4A7C59] bg-[#4A7C59]/10 px-2 py-0.5 rounded-full">
                      {formatDate(entry.date)}
                    </span>
                    <span className="text-sm font-semibold text-foreground truncate">
                      {entry.recipeTitle ?? "Unbekanntes Rezept"}
                    </span>
                  </div>
                  {entry.comment && (
                    <p className="text-sm text-foreground mt-1.5 leading-snug">{entry.comment}</p>
                  )}
                  {!entry.comment && (
                    <p className="text-sm text-muted-foreground mt-1.5 italic">Kein Kommentar</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Teaser */}
      <div className="sticky-note rounded-xl p-5 text-center">
        <p className="font-script text-xl text-amber-900">
          {recipes.length} Rezepte – und mit dem PDF-Upload wird die Sammlung noch größer! 🍳
        </p>
        <p className="text-sm text-amber-700 mt-2 font-sans">
          Neue Rezepte können jederzeit über das PDF-Upload ergänzt werden.
        </p>
      </div>
    </div>
  );
}
