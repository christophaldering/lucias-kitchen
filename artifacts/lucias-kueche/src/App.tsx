import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Utensils, CalendarDays, BarChart3, BookOpen } from "lucide-react";
import MeineRezepte from "@/pages/MeineRezepte";
import Wochenplan from "@/pages/Wochenplan";
import Statistiken from "@/pages/Statistiken";

const queryClient = new QueryClient();

type Tab = "rezepte" | "wochenplan" | "statistiken";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "rezepte", label: "Meine Rezepte", icon: <BookOpen className="w-4 h-4" /> },
  { id: "wochenplan", label: "Wochenplan & Einkaufsliste", icon: <CalendarDays className="w-4 h-4" /> },
  { id: "statistiken", label: "Statistiken", icon: <BarChart3 className="w-4 h-4" /> },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("rezepte");

  return (
    <QueryClientProvider client={queryClient}>
      {/* Header */}
      <header className="bg-[#4A7C59] text-white shadow-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <h1 className="font-script text-3xl leading-none">Lucias Küche 🍳</h1>
              <p className="text-green-200 text-xs mt-0.5 font-sans">
                Bewährte Lieblingsrezepte – mit Herz gekocht seit Jahren
              </p>
            </div>
            <Utensils className="w-7 h-7 text-green-200 hidden sm:block" />
          </div>

          {/* Nav tabs */}
          <nav className="flex gap-1 overflow-x-auto pb-0 -mb-px scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? "bg-[#FDF6EC] text-[#4A7C59] border-[#FDF6EC]"
                    : "text-green-100 border-transparent hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="min-h-screen" style={{ backgroundColor: "#FDF6EC" }}>
        {activeTab === "rezepte" && <MeineRezepte />}
        {activeTab === "wochenplan" && <Wochenplan />}
        {activeTab === "statistiken" && <Statistiken />}
      </main>

      {/* Footer */}
      <footer className="bg-[#4A7C59]/10 border-t border-border py-4 text-center">
        <p className="font-script text-lg text-[#4A7C59]">
          Mit Liebe gekocht 🍴
        </p>
      </footer>
    </QueryClientProvider>
  );
}

export default App;
