import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight } from "lucide-react";

interface ActionCard {
  id: string;
  emoji: string;
  title: string;
  description: string;
  tab: string;
}

const CARDS: ActionCard[] = [
  {
    id: "kochen",
    emoji: "🍳",
    title: "Ich möchte kochen",
    description: "Öffne deine Rezeptbibliothek und such dir etwas Leckeres aus.",
    tab: "rezepte",
  },
  {
    id: "ueberraschung",
    emoji: "🎲",
    title: "Überrasch mich!",
    description: "Lass die KI entscheiden – bekomme einen kreativen Kochvorschlag.",
    tab: "was-koche-ich",
  },
  {
    id: "kuehlschrank",
    emoji: "🥦",
    title: "Was hab ich zuhause?",
    description: "Schau nach, was du vorrätig hast und lass dich inspirieren.",
    tab: "was-koche-ich",
  },
  {
    id: "wochenplan",
    emoji: "📅",
    title: "Ich plane die Woche",
    description: "Plane deine Mahlzeiten für die nächsten Tage und behalte den Überblick.",
    tab: "wochenplan",
  },
  {
    id: "suchen",
    emoji: "🔍",
    title: "Ich suche ein Rezept",
    description: "Finde gezielt ein Rezept nach Name, Zutat oder Kategorie.",
    tab: "rezepte",
  },
  {
    id: "gemeinsam",
    emoji: "👨‍👩‍👧",
    title: "Mit Familie/Freunden kochen",
    description: "Teile Rezepte, plane gemeinsam und koche zusammen.",
    tab: "meine-kueche",
  },
];

interface OnboardingProps {
  onNavigate: (tab: string) => void;
}

export default function Onboarding({ onNavigate }: OnboardingProps) {
  const { user, completeOnboarding } = useAuth();

  const handleCardClick = async (card: ActionCard) => {
    await completeOnboarding();
    onNavigate(card.tab);
  };

  const handleOverview = async () => {
    await completeOnboarding();
    onNavigate("rezepte");
  };

  const firstName = user?.displayName?.split(" ")[0] ?? "Lucia";

  return (
    <div className="min-h-screen py-12 px-4 pb-28" style={{ background: "linear-gradient(160deg, #f9efe0 0%, #f5e8d0 50%, #f2e4c8 100%)" }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#4A7C59]/10 mb-5 text-4xl">
            🎉
          </div>
          <h1 className="font-script text-5xl text-[#4A7C59] mb-3">
            Willkommen in deiner Küche, {firstName}!
          </h1>
          <p className="font-serif text-lg text-muted-foreground max-w-xl mx-auto">
            Schön, dass du da bist. Was möchtest du heute in Lucias Küche tun?
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {CARDS.map((card) => (
            <button
              key={card.id}
              onClick={() => handleCardClick(card)}
              className="group text-left bg-white rounded-2xl border border-border p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 hover:border-[#4A7C59]/40"
            >
              <div className="text-4xl mb-4">{card.emoji}</div>
              <h3 className="font-serif font-semibold text-lg text-foreground mb-2 leading-snug group-hover:text-[#4A7C59] transition-colors">
                {card.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {card.description}
              </p>
            </button>
          ))}
        </div>

        {/* Overview link */}
        <div className="text-center">
          <button
            onClick={handleOverview}
            className="inline-flex items-center gap-2 text-[#4A7C59] font-semibold hover:text-[#3d6849] transition-colors group text-sm"
          >
            Alles auf einen Blick
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
