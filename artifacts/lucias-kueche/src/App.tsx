import { useState, useRef, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Utensils, CalendarDays, BarChart3, Settings, LogOut, ChevronDown, User, BookOpen, Lightbulb, House } from "lucide-react";
import MeineRezepte from "@/pages/MeineRezepte";
import Wochenplan from "@/pages/Wochenplan";
import Statistiken from "@/pages/Statistiken";
import Admin from "@/pages/Admin";
import Profil from "@/pages/Profil";
import Login from "@/pages/Login";
import Onboarding from "@/pages/Onboarding";
import WasKocheIch from "@/pages/WasKocheIch";
import MeineKueche from "@/pages/MeineKueche";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";
import { BulkImportProgressBar } from "@/components/BulkImportProgressBar";
import { useNotifications } from "@/hooks/useNotifications";
import { useIncomingSuggestions } from "@/hooks/useRecipeSuggestions";

const queryClient = new QueryClient();

type Tab = "rezepte" | "wochenplan" | "statistiken" | "admin" | "profil" | "was-koche-ich" | "meine-kueche";

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  let time: string;
  if (hour < 12) time = "Morgen";
  else if (hour < 18) time = "Tag";
  else time = "Abend";
  const first = name.split(" ")[0] ?? name;
  return `Guten ${time}, ${first}!`;
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
        className="flex items-center gap-2 rounded-full pl-2 pr-1 py-1 hover:bg-white/10 transition-colors min-h-[48px]"
      >
        <div className="hidden sm:flex flex-col items-end text-right">
          <span className="text-xs text-green-100 leading-none">{getGreeting(user?.displayName ?? "Lucia")} 👩‍🍳</span>
        </div>
        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/40 flex-shrink-0">
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
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-foreground hover:bg-[#4A7C59]/5 transition-colors min-h-[48px]"
            >
              <User className="w-4 h-4 text-muted-foreground" />
              Mein Profil
            </button>
            <button
              onClick={() => { onNavigate("admin"); setOpen(false); }}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-foreground hover:bg-[#4A7C59]/5 transition-colors min-h-[48px]"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              Admin
            </button>
          </div>
          <div className="border-t border-border py-1">
            <button
              onClick={() => { logout(); setOpen(false); }}
              className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors min-h-[48px]"
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

function BottomNav({ activeTab, onTabChange, unreadCount }: { activeTab: Tab; onTabChange: (tab: Tab) => void; unreadCount: number }) {
  const NAV_TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "rezepte", label: "Rezepte", icon: <BookOpen className="w-5 h-5" /> },
    { id: "was-koche-ich", label: "Kochidee", icon: <Lightbulb className="w-5 h-5" /> },
    { id: "wochenplan", label: "Wochenplan", icon: <CalendarDays className="w-5 h-5" /> },
    { id: "meine-kueche", label: "Meine Küche", icon: <House className="w-5 h-5" />, badge: unreadCount },
    { id: "statistiken", label: "Statistiken", icon: <BarChart3 className="w-5 h-5" /> },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/20 bottom-nav"
      style={{
        background: "linear-gradient(135deg, #1e3d2a 0%, #2a5438 50%, #1e3d2a 100%)",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
      }}
    >
      <div className="flex items-stretch max-w-lg mx-auto">
        {NAV_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 relative transition-colors min-h-[56px]"
              style={{ minHeight: "56px" }}
            >
              {isActive && (
                <span
                  className="absolute inset-x-3 top-1 h-0.5 rounded-full"
                  style={{ background: "linear-gradient(90deg, #d4855a, #e8a87a)" }}
                />
              )}
              <span className={`relative transition-all ${isActive ? "text-[#e8a87a] scale-110" : "text-green-300/70"}`}>
                {tab.icon}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-semibold tracking-wide transition-colors leading-none ${
                  isActive ? "text-[#e8a87a]" : "text-green-400/60"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function AppShell() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("rezepte");
  const [openRecipeId, setOpenRecipeId] = useState<number | null>(null);
  const [adminInitialTab, setAdminInitialTab] = useState<string | null>(null);
  const [recipesInitialSortOrder, setRecipesInitialSortOrder] = useState<string | null>(null);
  const { data: notifications = [] } = useNotifications();
  const notificationUnreadCount = notifications.filter((n) => !n.readAt).length;
  const { suggestions: incomingSuggestions } = useIncomingSuggestions();
  const pendingSuggestionsCount = incomingSuggestions.filter((s) => s.status === "pending").length;
  const unreadCount = notificationUnreadCount + pendingSuggestionsCount;

  function handleOpenRecipeFromNotification(recipeId: number) {
    setActiveTab("rezepte");
    setOpenRecipeId(recipeId);
  }

  function handleBulkImportDone() {
    setActiveTab("rezepte");
    setRecipesInitialSortOrder("neueste");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(160deg, #f9efe0 0%, #f5e8d0 50%, #f2e4c8 100%)" }}>
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
      <header
        className="sticky top-0 z-40 text-white"
        style={{
          background: "linear-gradient(135deg, #1e3d2a 0%, #2a5438 60%, #3d6849 100%)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.18)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between py-2">
            <button
              onClick={() => setActiveTab("rezepte")}
              className="flex items-center gap-2 group"
            >
              <h1 className="font-script text-3xl leading-none text-white group-hover:text-green-100 transition-colors">
                Lucias Küche 🍳
              </h1>
            </button>
            <div className="flex items-center gap-1">
              <NotificationBell onOpenRecipe={handleOpenRecipeFromNotification} onNavigate={(tab) => setActiveTab(tab as Tab)} onBulkImportDone={handleBulkImportDone} />
              <AvatarDropdown onNavigate={(tab) => setActiveTab(tab)} />
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-screen pb-24" style={{ minHeight: "calc(100vh - 56px)" }}>
        {activeTab === "rezepte" && <MeineRezepte onNavigate={(tab) => setActiveTab(tab as Tab)} initialOpenRecipeId={openRecipeId} onRecipeOpened={() => setOpenRecipeId(null)} initialSortOrder={recipesInitialSortOrder} onSortOrderApplied={() => setRecipesInitialSortOrder(null)} />}
        {activeTab === "was-koche-ich" && <WasKocheIch />}
        {activeTab === "wochenplan" && <Wochenplan onNavigate={(tab) => setActiveTab(tab as Tab)} />}
        {activeTab === "statistiken" && <Statistiken />}
        {activeTab === "admin" && <Admin initialTab={adminInitialTab ?? "categories"} />}
        {activeTab === "profil" && <Profil />}
        {activeTab === "meine-kueche" && <MeineKueche onOpenRecipe={(recipeId) => { setActiveTab("rezepte"); setOpenRecipeId(recipeId); }} />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} unreadCount={unreadCount} />
      <BulkImportProgressBar onNavigateToImport={() => {
        setActiveTab("admin");
        setAdminInitialTab("bulk-import");
      }} />
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
