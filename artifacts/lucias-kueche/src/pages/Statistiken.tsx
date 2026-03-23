import { recipes } from "@/data/recipes";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = [
  "#4A7C59",
  "#C1693A",
  "#7BA05B",
  "#D4956A",
  "#5B8E7D",
  "#E8A96B",
];

function buildCategoryData() {
  const counts: Record<string, number> = {};
  recipes.forEach((r) => {
    r.categories.forEach((cat) => {
      counts[cat] = (counts[cat] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildTimeData() {
  const buckets = [
    { label: "≤30 Min", min: 0, max: 30 },
    { label: "31–45 Min", min: 31, max: 45 },
    { label: "46–60 Min", min: 46, max: 60 },
    { label: ">60 Min", min: 61, max: Infinity },
  ];
  return buckets.map((b) => ({
    name: b.label,
    Rezepte: recipes.filter((r) => r.time > b.min - 1 && r.time <= b.max).length,
  }));
}

const catData = buildCategoryData();
const timeData = buildTimeData();

const top3 = [...recipes].sort((a, b) => b.rating - a.rating).slice(0, 3);

const insights = [
  "Du liebst Sahnesaucen 🥛",
  "Fisch steht bei dir hoch im Kurs 🐟",
  "Du kochst am liebsten Gerichte unter 45 Minuten ⏱️",
  "Schmelzkäse ist dein Geheimzutat ✨",
  "Vegetarisches passt immer öfter auf den Tisch 🌿",
];

export default function Statistiken() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <h2 className="font-serif text-2xl font-semibold text-foreground">
        📊 Statistiken & Muster
      </h2>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
          <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
            🍽️ Lieblingsküche
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={catData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
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

        {/* Bar chart */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
          <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
            ⏱️ Schnell vs. aufwendig
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={timeData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="Rezepte" fill="#4A7C59" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 3 */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h3 className="font-serif font-semibold text-lg mb-4 text-foreground">
          ⭐ Am häufigsten gekocht (Favoriten)
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
              <span className="text-2xl">{r.emoji}</span>
              <p className="font-serif font-semibold text-sm text-foreground leading-snug">
                {r.title}
              </p>
              <div className="flex gap-0.5 mt-auto">
                {Array.from({ length: r.rating }).map((_, j) => (
                  <span key={j} className="text-amber-400 text-xs">★</span>
                ))}
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

      {/* Teaser */}
      <div className="sticky-note rounded-xl p-5 text-center">
        <p className="font-script text-xl text-amber-900">
          Dies sind erst 13 von ~500 Rezepten – die KI freut sich auf mehr! 🍳
        </p>
        <p className="text-sm text-amber-700 mt-2 font-sans">
          Neue Rezepte können jederzeit ergänzt werden.
        </p>
      </div>
    </div>
  );
}
