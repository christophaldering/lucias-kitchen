import { useState, useRef, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Utensils, CalendarDays, BarChart3, BookOpen, Settings, UserCircle, LogOut, ChevronDown, User } from "lucide-react";
import MeineRezepte from "@/pages/MeineRezepte";
import Wochenplan from "@/pages/Wochenplan";
import Statistiken from "@/pages/Statistiken";
import Admin from "@/pages/Admin";
import Profil from "@/pages/Profil";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const queryClient = new QueryClient();

type Tab = "rezepte" | "wochenplan" | "statistiken" | "admin" | "profil";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "rezepte", label: "Meine Rezepte", icon: <BookOpen className="w-4 h-4" /> },
  { id: "wochenplan", label: "Wochenplan & Einkaufsliste", icon: <CalendarDays className="w-4 h-4" /> },
  { id: "statistiken", label: "Statistiken", icon: <BarChart3 className="w-4 h-4" /> },
  { id: "admin", label: "Admin", icon: <Settings className="w-4 h-4" /> },
];

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  let time: string;
  if (hour < 12) time = "Morgen";
  else if (hour < 18) time = "Tag";
  else time = "Abend";
  const first = name.split(" ")[0] ?? name;
  return `Guten ${time}, ${first}! 👩‍🍳`;
}

function AvatarDropdown({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "L";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full pl-2 pr-1 py-1 hover:bg-white/10 transition-colors"
      >
        <div className="hidden sm:flex flex-col items-end text-right">
          <span className="text-xs text-green-100 leading-none">{getGreeting(user?.displayName ?? "Lucia")}</span>
        </div>
        <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/40 flex-shrink-0">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#C1693A] flex items-center justify-center">
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-green-200 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-border overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border bg-[#4A7C59]/5">
            <p className="font-semibold text-sm text-foreground">{user?.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <div className="py-1">
            <button
              onClick={() => { onNavigate("profil"); setOpen(false); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-[#4A7C59]/5 transition-colors"
            >
              <User className="w-4 h-4 text-muted-foreground" />
              Mein Profil
            </button>
            <button
              onClick={() => { onNavigate("admin"); setOpen(false); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-foreground hover:bg-[#4A7C59]/5 transition-colors"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              Einstellungen
            </button>
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={() => { logout(); setOpen(false); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Abmelden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("rezepte");

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDF6EC] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#4A7C59]/10 flex items-center justify-center animate-pulse">
            <Utensils className="w-8 h-8 text-[#4A7C59]" />
          </div>
          <p className="font-script text-2xl text-[#4A7C59]">Lucias Küche wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!user.onboardingCompleted) {
    return <Onboarding onNavigate={(tab) => setActiveTab(tab as Tab)} />;
  }

  return (
    <>
      <header className="bg-[#4A7C59] text-white shadow-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div>
              <h1 className="font-script text-3xl leading-none">Lucias Küche 🍳</h1>
              <p className="text-green-200 text-xs mt-0.5 font-sans hidden sm:block">
                Bewährte Lieblingsrezepte – mit Herz gekocht seit Jahren
              </p>
            </div>
            <AvatarDropdown onNavigate={(tab) => setActiveTab(tab)} />
          </div>

          <nav className="flex gap-1 overflow-x-auto pb-0 -mb-px scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? "bg-[#FDF6EC] text-[#4A7C59] border-[#FDF6EC]"
                    : tab.id === "admin"
                    ? "text-amber-200 border-transparent hover:text-white hover:bg-white/10"
                    : "text-green-100 border-transparent hover:text-white hover:bg-white/10"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => setActiveTab("profil")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 ${
                activeTab === "profil"
                  ? "bg-[#FDF6EC] text-[#4A7C59] border-[#FDF6EC]"
                  : "text-green-100 border-transparent hover:text-white hover:bg-white/10"
              }`}
            >
              <UserCircle className="w-4 h-4" />
              Profil
            </button>
          </nav>
        </div>
      </header>

      <main className="min-h-screen" style={{ backgroundColor: "#FDF6EC" }}>
        {activeTab === "rezepte" && <MeineRezepte />}
        {activeTab === "wochenplan" && <Wochenplan />}
        {activeTab === "statistiken" && <Statistiken />}
        {activeTab === "admin" && <Admin />}
        {activeTab === "profil" && <Profil />}
      </main>

      <footer className="bg-[#4A7C59]/10 border-t border-border py-4 text-center">
        <p className="font-script text-lg text-[#4A7C59]">
          Mit Liebe gekocht 🍴
        </p>
      </footer>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
