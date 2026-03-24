import { useAuth } from "@/contexts/AuthContext";
import { BookOpen, Plus, Link, CalendarDays, ShoppingCart, BarChart3, ArrowRight } from "lucide-react";

interface ActionCard {
  id: string;
  icon: React.ReactNode;
  emoji: string;
  title: string;
  description: string;
  tab?: string;
}

const CARDS: ActionCard[] = [
  {
    id: "rezepte",
    icon: <BookOpen className="w-8 h-8" />,
    emoji: "📖",
    title: "Rezepte entdecken",
    description: "Stöbere durch deine persönliche Rezeptsammlung und entdecke alte Lieblinge.",
    tab: "rezepte",
  },
  {
    id: "neu",
    icon: <Plus className="w-8 h-8" />,
    emoji: "✍️",
    title: "Neues Rezept erstellen",
    description: "Halte ein neues Lieblingsrezept fest und füge es deiner Sammlung hinzu.",
    tab: "rezepte",
  },
  {
    id: "importieren",
    icon: <Link className="w-8 h-8" />,
    emoji: "🌐",
    title: "Rezept von Website importieren",
    description: "Kopiere einfach die URL und lass die KI das Rezept automatisch importieren.",
    tab: "rezepte",
  },
  {
    id: "wochenplan",
    icon: <CalendarDays className="w-8 h-8" />,
    emoji: "📅",
    title: "Wochenmenü planen",
    description: "Plane deine Mahlzeiten für die Woche und behalte den Überblick.",
    tab: "wochenplan",
  },
  {
    id: "einkaufsliste",
    icon: <ShoppingCart className="w-8 h-8" />,
    emoji: "🛒",
    title: "Einkaufsliste erstellen",
    description: "Generiere automatisch eine sortierte Einkaufsliste aus deinem Wochenplan.",
    tab: "wochenplan",
  },
  {
    id: "statistiken",
    icon: <BarChart3 className="w-8 h-8" />,
    emoji: "📊",
    title: "Meine Küchen-Statistiken",
    description: "Entdecke Muster in deiner Küche – was du am liebsten kochst und wie oft.",
    tab: "statistiken",
  },
];

interface OnboardingProps {
  onNavigate: (tab: string) => void;
}

export default function Onboarding({ onNavigate }: OnboardingProps) {
  const { user, completeOnboarding } = useAuth();

  const handleCardClick = async (card: ActionCard) => {
    await completeOnboarding();
    if (card.tab) {
      onNavigate(card.tab);
    }
  };

  const handleOverview = async () => {
    await completeOnboarding();
    onNavigate("rezepte");
  };

  const firstName = user?.displayName?.split(" ")[0] ?? "Lucia";

  return (
    <div className="min-h-screen bg-[#FDF6EC] py-12 px-4">
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
              <div className="w-10 h-10 rounded-xl bg-[#4A7C59]/10 text-[#4A7C59] flex items-center justify-center mb-3 group-hover:bg-[#4A7C59] group-hover:text-white transition-colors">
                {card.icon}
              </div>
              <h3 className="font-serif font-semibold text-lg text-foreground mb-2 leading-snug">
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
            className="inline-flex items-center gap-2 text-[#4A7C59] font-semibold hover:text-[#3d6849] transition-colors group"
          >
            Alles auf einen Blick → Zur Übersicht
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
