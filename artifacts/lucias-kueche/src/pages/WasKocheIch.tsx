import { useState, useEffect, useRef, useCallback } from "react";
import {
  Lightbulb, Camera, X, Plus, Loader2, ChefHat, Clock,
  CheckCircle2, AlertCircle, UploadCloud, RotateCcw,
  MessageCircle, Send, Package, AlertTriangle,
  ChevronDown, ChevronUp, Trash2,
} from "lucide-react";
import type { Recipe } from "@/types/recipe";
import RecipeModal from "@/components/RecipeModal";
import { useAuth } from "@/contexts/AuthContext";
import { authFetch, authHeaders } from "@/lib/authFetch";

const API_BASE = "/api";

const MOOD_OPTIONS = [
  { label: "Pasta", value: "Pasta", emoji: "🍝" },
  { label: "Fisch", value: "Fisch", emoji: "🐟" },
  { label: "Vegetarisch", value: "Vegetarisch", emoji: "🌿" },
  { label: "Geflügel", value: "Geflügel", emoji: "🍗" },
  { label: "Fleisch", value: "Fleisch", emoji: "🥩" },
  { label: "Schnell (< 30 Min)", value: "schnell", emoji: "⚡" },
  { label: "Mittel (< 1 Std)", value: "mittel", emoji: "⏱️" },
  { label: "Aufwändig", value: "aufwändig", emoji: "👨‍🍳" },
];

type MoodState = "neutral" | "liked" | "disliked";

interface SuggestedRecipe extends Recipe {
  matchScore: number;
  ingredientMatches: number;
}

const CATEGORY_EMOJIS: Record<string, string> = {
  Fisch: "🐟",
  Geflügel: "🍗",
  Fleisch: "🥩",
  Vegetarisch: "🌿",
  Pasta: "🍝",
};

type ExpiryPriority = "today" | "week" | "good";
type StorageLocation = "fridge" | "freezer" | "pantry";

interface PantryItem {
  id?: number;
  ingredientName: string;
  expiryPriority: ExpiryPriority;
  isDefault: number;
  storageLocation: StorageLocation;
  expiryDate?: string | null;
}

const LOCATION_LABELS: Record<StorageLocation, string> = {
  fridge: "🧊 Kühlschrank",
  freezer: "❄️ Gefrierschrank",
  pantry: "🫙 Speisekammer",
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "🥦 Gemüse": ["möhre", "karotte", "zucchini", "paprika", "brokkoli", "spinat", "tomate", "zwiebel", "lauch", "sellerie", "gurke", "salat", "erbsen", "bohnen", "blumenkohl", "kohl", "rübe", "fenchel", "spargel", "artischocke", "avocado", "kürbis", "pilz", "champignon", "grünkohl", "chinakohl", "pak choi", "mangold", "rucola"],
  "🥩 Fleisch & Fisch": ["hähnchen", "hühnchen", "rind", "schwein", "lamm", "pute", "lachs", "thunfisch", "garnele", "scampi", "forelle", "hecht", "hackfleisch", "wurst", "schinken", "speck", "steak", "filet", "schnitzel", "fisch", "meeresfrüchte", "tintenfish", "seelachs"],
  "🥛 Milch & Käse": ["milch", "sahne", "butter", "käse", "joghurt", "quark", "frischkäse", "mozzarella", "parmesan", "feta", "ricotta", "crème fraîche", "schmand", "kefir"],
  "🌾 Getreide & Teig": ["mehl", "nudeln", "pasta", "reis", "brot", "brötchen", "haferflocken", "grieß", "couscous", "quinoa", "linsen", "kichererbsen", "penne", "spaghetti", "lasagne", "tagliatelle", "spätzle", "knödel"],
  "🫙 Gewürze & Öle": ["salz", "pfeffer", "öl", "olivenöl", "essig", "senf", "ketchup", "soja", "knoblauch", "ingwer", "chili", "paprikapulver", "kurkuma", "oregano", "basilikum", "thymian", "rosmarin", "lorbeer", "zimt", "muskat", "currypulver", "majoran", "dill", "petersilie", "schnittlauch"],
};

type LocationSuggestions = Record<string, Record<string, string[]>>;

const QUICK_SUGGESTIONS: LocationSuggestions = {
  fridge: {
    "🥦 Gemüse": ["Möhre", "Paprika", "Tomate", "Brokkoli", "Zucchini", "Gurke", "Lauch", "Spinat", "Salat", "Champignons", "Zwiebel", "Sellerie", "Fenchel", "Rucola", "Avocado"],
    "🥩 Fleisch & Fisch": ["Hähnchenbrust", "Hackfleisch", "Lachs", "Thunfisch (Dose)", "Schinken", "Speck", "Schweinefilet", "Rindersteaks", "Putenbrust", "Garnelen"],
    "🥛 Milch & Käse": ["Milch", "Butter", "Joghurt", "Sahne", "Mozzarella", "Parmesan", "Feta", "Quark", "Frischkäse", "Crème fraîche", "Eier", "Schmand", "Käse"],
    "🌾 Getreide & Teig": ["Brot", "Brötchen", "Tortilla", "Blätterteig", "Pizzateig"],
    "🫙 Gewürze & Öle": ["Senf", "Ketchup", "Mayonnaise", "Sojasoße", "Sriracha", "Worcestershiresoße", "Zitronensaft", "Pesto"],
    "🍳 Sonstiges": ["Eier", "Orangensaft", "Apfelsaft", "Hummus", "Aufschnitt", "Oliven"],
  },
  freezer: {
    "🥦 Gemüse": ["Erbsen (TK)", "Mais (TK)", "Spinat (TK)", "Brokkoli (TK)", "Bohnen (TK)", "Blumenkohl (TK)", "Möhren (TK)", "Rote Bete (TK)", "Edamame (TK)"],
    "🥩 Fleisch & Fisch": ["Hähnchenbrust (TK)", "Hackfleisch (TK)", "Lachs (TK)", "Garnelen (TK)", "Fischfilet (TK)", "Putenbrust (TK)", "Schweinebauch (TK)", "Rindfleisch (TK)"],
    "🥛 Milch & Käse": ["Butter (TK)", "Rahm (TK)"],
    "🌾 Getreide & Teig": ["Pizzaboden (TK)", "Brot (TK)", "Brötchen (TK)", "Spätzle (TK)", "Gnocchi (TK)", "Blätterteig (TK)"],
    "🫙 Gewürze & Öle": ["Petersilie (TK)", "Basilikum (TK)", "Schnittlauch (TK)", "Kräuterbutter (TK)"],
    "🍳 Sonstiges": ["Vanilleeis", "Pommes (TK)", "Maultaschen (TK)", "Pierogies (TK)", "Beeren-Mix (TK)", "Mango (TK)"],
  },
  pantry: {
    "🥦 Gemüse": ["Tomaten (Dose)", "Bohnen (Dose)", "Kichererbsen (Dose)", "Linsen (Dose)", "Mais (Dose)", "Artischocken (Dose)", "Oliven (Glas)", "Paprika (Glas)", "Getrocknete Tomaten"],
    "🥩 Fleisch & Fisch": ["Thunfisch (Dose)", "Sardinen (Dose)", "Makrele (Dose)", "Anchovis (Glas)", "Corned Beef (Dose)"],
    "🥛 Milch & Käse": ["Kokosmilch (Dose)", "Kondensmilch (Dose)", "Milchpulver"],
    "🌾 Getreide & Teig": ["Nudeln", "Reis", "Mehl", "Haferflocken", "Couscous", "Quinoa", "Linsen", "Kichererbsen", "Paniermehl", "Grieß", "Polenta", "Bulgur"],
    "🫙 Gewürze & Öle": ["Olivenöl", "Sonnenblumenöl", "Essig", "Salz", "Pfeffer", "Paprikapulver", "Kurkuma", "Oregano", "Basilikum (trocken)", "Thymian", "Rosmarin", "Zimt", "Muskat", "Currypulver", "Chili", "Knoblauchpulver", "Zwiebelpulver"],
    "🍳 Sonstiges": ["Zucker", "Honig", "Ahornsirup", "Backpulver", "Natron", "Vanillezucker", "Hefe", "Sojasauce", "Worcestershiresoße", "Brühwürfel", "Tomatenmark", "Passierte Tomaten"],
  },
};

function getCategoryForIngredient(name: string): string {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return "🍳 Sonstiges";
}

function getEffectivePriority(item: PantryItem): ExpiryPriority {
  if (item.expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(item.expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 2) return "today";
    if (daysLeft <= 7) return "week";
    return "good";
  }
  return (item.expiryPriority as ExpiryPriority) ?? "good";
}

const PRIORITY_COLORS: Record<ExpiryPriority, string> = {
  today: "bg-red-100 text-red-700 border-red-300",
  week: "bg-amber-100 text-amber-700 border-amber-300",
  good: "bg-[#f5ede0] text-[#7a4a2a] border-[#e8d5c0]",
};

const PRIORITY_INDICATOR: Record<ExpiryPriority, string> = {
  today: "🔴",
  week: "🟡",
  good: "🟢",
};

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

function RecipeSuggestionCard({
  recipe,
  onClick,
  expiringUsed,
}: {
  recipe: SuggestedRecipe;
  onClick: () => void;
  expiringUsed?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const emoji = CATEGORY_EMOJIS[recipe.category] ?? "🍽️";

  const diffColor =
    recipe.difficulty === "simpel"
      ? "bg-green-100 text-green-700"
      : recipe.difficulty === "normal"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";

  return (
    <div
      className="bg-white rounded-2xl border border-border overflow-hidden cursor-pointer relative"
      style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.10)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className="relative w-full overflow-hidden" style={{ paddingTop: "60%" }}>
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300"
            style={{ transform: hovered ? "scale(1.04)" : "scale(1)" }}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-5xl"
            style={{ background: "linear-gradient(135deg, #f5ede0, #f0e0c8)" }}
          >
            {emoji}
          </div>
        )}
        <div className="absolute top-2.5 left-2.5">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full text-white shadow"
            style={{ background: "rgba(45,82,64,0.85)", backdropFilter: "blur(4px)" }}
          >
            {emoji} {recipe.category}
          </span>
        </div>
        {recipe.ingredientMatches > 0 && (
          <div className="absolute top-2.5 right-2.5">
            <span
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full text-white shadow"
              style={{ background: "rgba(193,105,58,0.88)", backdropFilter: "blur(4px)" }}
            >
              <CheckCircle2 className="w-3 h-3" />
              {recipe.ingredientMatches} Zutat{recipe.ingredientMatches !== 1 ? "en" : ""}
            </span>
          </div>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="font-serif font-semibold text-foreground leading-snug mb-2 line-clamp-2 text-sm">
          {recipe.title}
        </h3>
        {expiringUsed != null && expiringUsed > 0 && (
          <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1 mb-2">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            Nutzt {expiringUsed} Zutat{expiringUsed !== 1 ? "en" : ""}, die bald ablaufen ⚠️
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${diffColor}`}>
            <ChefHat className="w-3 h-3" />
            {recipe.difficulty}
          </span>
          {recipe.totalTime && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {recipe.totalTime.replace("ca. ", "")}
            </span>
          )}
        </div>
      </div>

      {hovered && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-2xl transition-all"
          style={{ background: "rgba(45,82,64,0.88)" }}
        >
          <span className="text-white font-semibold text-sm px-5 py-2.5 border-2 border-white rounded-xl hover:bg-white hover:text-[#2d5240] transition-colors">
            Details ansehen →
          </span>
        </div>
      )}
    </div>
  );
}


export default function WasKocheIch() {
  const { token } = useAuth();

  const [allIngredients, setAllIngredients] = useState<string[]>([]);
  const [loadingIngredients, setLoadingIngredients] = useState(true);

  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(new Set());
  const [ingredientSearch, setIngredientSearch] = useState("");

  const [moodStates, setMoodStates] = useState<Record<string, MoodState>>({});

  const [suggestions, setSuggestions] = useState<SuggestedRecipe[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedRecipe, setSelectedRecipe] = useState<SuggestedRecipe | null>(null);

  // === Concept A: Chat ===
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatChips, setChatChips] = useState<string[]>([]);
  const [chatRounds, setChatRounds] = useState(0);
  const [chatActive, setChatActive] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // === Storage Location Tabs ===
  const [activeLocation, setActiveLocation] = useState<StorageLocation>("fridge");
  const [activeCategory, setActiveCategory] = useState("all");
  const [openChipEditor, setOpenChipEditor] = useState<number | null>(null);
  const [defaultSectionOpen, setDefaultSectionOpen] = useState(false);
  const [quickSelectCategory, setQuickSelectCategory] = useState<string | null>(null);

  // === Photo Scan Modal ===
  const [photoScanResult, setPhotoScanResult] = useState<{
    toAdd: string[];
    toRemove: PantryItem[];
    toAddChecked: Set<string>;
    toRemoveChecked: Set<number>;
  } | null>(null);

  // === Concept B: Fridge Scan ===
  const [fridgeLoading, setFridgeLoading] = useState(false);
  const [fridgeError, setFridgeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track which ingredients come from pantry defaults (shown with gray/subtle style)
  const [pantryDefaultIngredients, setPantryDefaultIngredients] = useState<Set<string>>(new Set());

  // === Concept C: Was muss weg? ===
  const [wasteModeActive, setWasteModeActive] = useState(false);
  const [ingredientPriorities, setIngredientPriorities] = useState<Record<string, ExpiryPriority>>({});

  // === Concept D: Pantry ===
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [pantryLoading, setPantryLoading] = useState(false);
  const [pantryNewItem, setPantryNewItem] = useState("");
  const [pantryDirty, setPantryDirty] = useState(false);
  const [pantrySaving, setPantrySaving] = useState(false);
  const [pantryToast, setPantryToast] = useState<string | null>(null);
  const [pantryToastIngredient, setPantryToastIngredient] = useState<string | null>(null);

  // === Load ingredients ===
  useEffect(() => {
    fetch(`${API_BASE}/ingredients`)
      .then((r) => r.json())
      .then((data) => setAllIngredients(data.ingredients ?? []))
      .catch(() => setAllIngredients([]))
      .finally(() => setLoadingIngredients(false));
  }, []);

  // === Load pantry + cooking history analysis ===
  useEffect(() => {
    if (!token) return;
    setPantryLoading(true);
    authFetch(`${API_BASE}/pantry`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const rawItems = data.items ?? [];
        const items: PantryItem[] = rawItems.map((i: PantryItem) => ({
          ...i,
          storageLocation: (i.storageLocation ?? "fridge") as StorageLocation,
        }));
        setPantryItems(items);

        // Apply pantry defaults to selectedIngredients as baseline (gray/subtle style)
        const defaults = items.filter((i) => i.isDefault === 1);
        if (defaults.length > 0) {
          const defaultNames = new Set(defaults.map((i) => i.ingredientName));
          setPantryDefaultIngredients(defaultNames);
          setSelectedIngredients((prev) => {
            const next = new Set(prev);
            defaults.forEach((i) => next.add(i.ingredientName));
            return next;
          });
          setAllIngredients((prev) => {
            const combined = new Set([...prev, ...defaults.map((i) => i.ingredientName)]);
            return Array.from(combined).sort((a, b) => a.localeCompare(b, "de"));
          });
        }

        // Add all non-default items to selectedIngredients
        const nonDefaults = items.filter((i) => i.isDefault === 0);
        if (nonDefaults.length > 0) {
          setSelectedIngredients((prev) => {
            const next = new Set(prev);
            nonDefaults.forEach((i) => next.add(i.ingredientName));
            return next;
          });
          setAllIngredients((prev) => {
            const combined = new Set([...prev, ...nonDefaults.map((i) => i.ingredientName)]);
            return Array.from(combined).sort((a, b) => a.localeCompare(b, "de"));
          });
        }

        // Restore persisted expiry priorities and add those ingredients to selectedIngredients
        const priorities: Record<string, ExpiryPriority> = {};
        const expiryIngredients: string[] = [];
        items.forEach((item) => {
          if (item.isDefault === 0 && item.expiryPriority && item.expiryPriority !== "good") {
            priorities[item.ingredientName] = item.expiryPriority as ExpiryPriority;
            expiryIngredients.push(item.ingredientName);
          }
        });
        if (Object.keys(priorities).length > 0) {
          setIngredientPriorities(priorities);
          setAllIngredients((prev) => {
            const combined = new Set([...prev, ...expiryIngredients]);
            return Array.from(combined).sort((a, b) => a.localeCompare(b, "de"));
          });
          // Auto-activate waste mode if there are persisted expiry items
          setWasteModeActive(true);
        }
      })
      .catch(() => {})
      .finally(() => setPantryLoading(false));

    // Cooking history analysis: after 10+ entries, suggest frequent ingredients as pantry defaults
    Promise.all([
      authFetch(`${API_BASE}/cooking-log/ingredient-frequency`, { headers: authHeaders() }).then((r) => r.json()),
      authFetch(`${API_BASE}/pantry`, { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([freqData, pantryData]) => {
        const logCount: number = freqData.count ?? 0;
        if (logCount < 10) return;
        const topIngredients: Array<{ name: string; count: number }> = freqData.topIngredients ?? [];
        if (topIngredients.length === 0) return;
        const existingNames = new Set(
          (pantryData.items as PantryItem[] ?? []).map((i: PantryItem) => i.ingredientName.toLowerCase())
        );
        // Find the most frequent ingredient not yet in pantry
        const suggestion = topIngredients.find((ing) => !existingNames.has(ing.name.toLowerCase()));
        if (suggestion) {
          // Capitalize first letter for display
          const displayName = suggestion.name.charAt(0).toUpperCase() + suggestion.name.slice(1);
          setPantryToast(`${displayName} hast du fast immer – soll ich das als Standard speichern?`);
          setPantryToastIngredient(displayName);
        }
      })
      .catch(() => {});
  }, [token]);

  // === Auto-scroll chat ===
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);


  const toggleIngredient = (name: string) => {
    setSelectedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const addIngredientByName = async (name: string, location: StorageLocation) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const alreadyExists = pantryItems.some(
      (i) => i.ingredientName.toLowerCase() === trimmed.toLowerCase() && i.storageLocation === location
    );
    if (alreadyExists) return;
    setSelectedIngredients((prev) => new Set([...prev, trimmed]));
    if (!allIngredients.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
      setAllIngredients((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b, "de")));
    }
    if (token) {
      try {
        const res = await authFetch(`${API_BASE}/pantry`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            ingredientName: trimmed,
            expiryPriority: "good",
            isDefault: 0,
            storageLocation: location,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setPantryItems((prev) => {
            const exists = prev.some((i) => i.id === data.item?.id);
            if (exists) return prev;
            return [...prev, { ...data.item, storageLocation: data.item?.storageLocation ?? location }];
          });
        }
      } catch {
      }
    }
  };

  const removeIngredientByName = async (name: string, location: StorageLocation) => {
    const item = pantryItems.find(
      (i) => i.ingredientName.toLowerCase() === name.toLowerCase() && i.storageLocation === location && i.isDefault === 0
    );
    if (!item || !item.id) return;
    await authFetch(`${API_BASE}/pantry/by-id/${item.id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    const remaining = pantryItems.filter((i) => i.id !== item.id);
    setPantryItems(remaining);
    const stillExists = remaining.some(
      (i) => i.ingredientName.toLowerCase() === item.ingredientName.toLowerCase()
    );
    if (!stillExists) {
      setSelectedIngredients((prev) => {
        const next = new Set(prev);
        next.delete(item.ingredientName);
        return next;
      });
    }
  };

  const addIngredient = async () => {
    const trimmed = ingredientSearch.trim();
    if (!trimmed) return;
    setSelectedIngredients((prev) => new Set([...prev, trimmed]));
    if (!allIngredients.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
      setAllIngredients((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b, "de")));
    }
    setIngredientSearch("");
    if (token) {
      try {
        const res = await authFetch(`${API_BASE}/pantry`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            ingredientName: trimmed,
            expiryPriority: "good",
            isDefault: 0,
            storageLocation: activeLocation,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setPantryItems((prev) => {
            const exists = prev.some((i) => i.id === data.item?.id);
            if (exists) return prev;
            return [...prev, { ...data.item, storageLocation: data.item?.storageLocation ?? activeLocation }];
          });
        }
      } catch {
      }
    }
  };

  // === Photo upload for location tabs ===
  const handleFridgeUpload = useCallback(async (file: File) => {
    setFridgeLoading(true);
    setFridgeError(null);
    setPhotoScanResult(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
        reader.readAsDataURL(file);
      });
      const mimeType = file.type || "image/jpeg";
      const location = activeLocation;
      const res = await authFetch(`${API_BASE}/extract-fridge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ image: base64, mimeType, location }),
      });
      if (!res.ok) throw new Error("Analyse fehlgeschlagen");
      const data = await res.json();
      const detected: string[] = (data.ingredients ?? []).map((n: string) =>
        n.replace(/\?$/, "").replace(/^evtl\.\s*/i, "").trim()
      ).filter(Boolean);

      // Build toAdd and toRemove sets
      const locationItems = pantryItems.filter((i) => i.storageLocation === location && i.isDefault === 0);
      const locationNames = new Set(locationItems.map((i) => i.ingredientName.toLowerCase()));
      const detectedLower = new Set(detected.map((n) => n.toLowerCase()));

      const toAdd = detected.filter((n) => !locationNames.has(n.toLowerCase()));
      const toRemove = locationItems.filter((i) => !detectedLower.has(i.ingredientName.toLowerCase()));

      setPhotoScanResult({
        toAdd,
        toRemove,
        toAddChecked: new Set(toAdd),
        toRemoveChecked: new Set(),
      });
    } catch {
      setFridgeError("Das Foto konnte nicht analysiert werden. Bitte versuche es erneut.");
    } finally {
      setFridgeLoading(false);
    }
  }, [activeLocation, pantryItems]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFridgeUpload(file);
    e.target.value = "";
  };


  // === Photo scan modal confirm ===
  const handlePhotoScanConfirm = async () => {
    if (!photoScanResult) return;
    const location = activeLocation;
    const toAddItems = photoScanResult.toAdd.filter((n) => photoScanResult.toAddChecked.has(n));
    const toRemoveIds = Array.from(photoScanResult.toRemoveChecked);

    try {
      await Promise.all([
        ...toAddItems.map((name) =>
          authFetch(`${API_BASE}/pantry`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ ingredientName: name, expiryPriority: "good", isDefault: 0, storageLocation: location }),
          }).then((r) => r.ok ? r.json() : null)
        ),
        ...toRemoveIds.map((id) =>
          authFetch(`${API_BASE}/pantry/by-id/${id}`, {
            method: "DELETE",
            headers: { ...authHeaders() },
          })
        ),
      ]);

      // Reload pantry
      const r = await authFetch(`${API_BASE}/pantry`, { headers: authHeaders() });
      const data = await r.json();
      const items: PantryItem[] = (data.items ?? []).map((i: PantryItem) => ({
        ...i,
        storageLocation: (i.storageLocation ?? "fridge") as StorageLocation,
      }));
      const updatedNames = new Set(items.map((i) => i.ingredientName));
      setPantryItems(items);
      setSelectedIngredients((prev) => {
        const next = new Set(prev);
        toAddItems.forEach((n) => next.add(n));
        // Only remove from selectedIngredients if no remaining pantry item has this name
        toRemoveIds.forEach((id) => {
          const removed = photoScanResult.toRemove.find((i) => i.id === id);
          if (removed && !updatedNames.has(removed.ingredientName)) {
            next.delete(removed.ingredientName);
          }
        });
        return next;
      });
    } catch {
    } finally {
      setPhotoScanResult(null);
    }
  };

  // === Delete pantry item by id ===
  const deletePantryItemById = async (id: number) => {
    const item = pantryItems.find((i) => i.id === id);
    await authFetch(`${API_BASE}/pantry/by-id/${id}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    const remaining = pantryItems.filter((i) => i.id !== id);
    setPantryItems(remaining);
    if (item) {
      const stillExists = remaining.some(
        (i) => i.ingredientName.toLowerCase() === item.ingredientName.toLowerCase()
      );
      if (!stillExists) {
        setSelectedIngredients((prev) => {
          const next = new Set(prev);
          next.delete(item.ingredientName);
          return next;
        });
      }
    }
  };

  // === Update pantry item (priority/date) ===
  const updatePantryItem = async (id: number, updates: Partial<Pick<PantryItem, "expiryPriority" | "expiryDate">>) => {
    const item = pantryItems.find((i) => i.id === id);
    if (!item) return;
    const updated = { ...item, ...updates };
    setPantryItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
    authFetch(`${API_BASE}/pantry`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        ingredientName: item.ingredientName,
        expiryPriority: updated.expiryPriority,
        isDefault: item.isDefault,
        storageLocation: item.storageLocation,
        expiryDate: updated.expiryDate ?? null,
      }),
    }).catch(() => {});
  };

  // === Mood cycling ===
  const cycleMood = (value: string) => {
    setMoodStates((prev) => {
      const current: MoodState = prev[value] ?? "neutral";
      const next: MoodState =
        current === "neutral" ? "liked" : current === "liked" ? "disliked" : "neutral";
      return { ...prev, [value]: next };
    });
  };

  const likedMoods = new Set(
    Object.entries(moodStates)
      .filter(([, s]) => s === "liked")
      .map(([v]) => v)
  );
  const dislikedMoods = new Set(
    Object.entries(moodStates)
      .filter(([, s]) => s === "disliked")
      .map(([v]) => v)
  );

  // === Was muss weg? – persist priority to backend ===
  const setPriority = async (ingredient: string, priority: ExpiryPriority) => {
    setIngredientPriorities((prev) => {
      const next = { ...prev };
      if (next[ingredient] === priority) {
        delete next[ingredient];
      } else {
        next[ingredient] = priority;
      }
      return next;
    });
    if (token) {
      const effectivePriority = ingredientPriorities[ingredient] === priority ? "good" : priority;
      const existingPantryItem = pantryItems.find((i) => i.ingredientName === ingredient);
      authFetch(`${API_BASE}/pantry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          ingredientName: ingredient,
          expiryPriority: effectivePriority,
          isDefault: existingPantryItem ? existingPantryItem.isDefault : 0,
          storageLocation: existingPantryItem?.storageLocation ?? activeLocation,
        }),
      }).catch(() => {});
    }
  };

  // Check how many expiring ingredients are used in a recipe
  const countExpiringUsed = (recipe: SuggestedRecipe) => {
    if (!wasteModeActive) return 0;
    const expiringSet = new Set(
      Object.entries(ingredientPriorities)
        .filter(([, p]) => p === "today" || p === "week")
        .map(([name]) => name.toLowerCase())
    );
    let count = 0;
    recipe.ingredients.forEach((ri) => {
      if (expiringSet.has(ri.name.toLowerCase())) count++;
    });
    return count;
  };

  const hasAnyInput =
    selectedIngredients.size > 0 || likedMoods.size > 0 || dislikedMoods.size > 0;

  const resetAll = () => {
    setSelectedIngredients(new Set());
    setMoodStates({});
    setIngredientSearch("");
    setSuggestions([]);
    setHasSearched(false);
    setChatMessages([]);
    setChatActive(false);
    setChatRounds(0);
    setChatChips([]);
    setWasteModeActive(false);
    setIngredientPriorities({});
  };

  const stateRef = useRef({
    selectedIngredients,
    likedMoods: new Set<string>(),
    dislikedMoods: new Set<string>(),
    wasteModeActive,
    ingredientPriorities,
  });

  useEffect(() => {
    stateRef.current = { selectedIngredients, likedMoods, dislikedMoods, wasteModeActive, ingredientPriorities };
  });

  const fetchSuggestions = useCallback(async (overrideIngredients?: string[]) => {
    const { selectedIngredients: si, likedMoods: lm, dislikedMoods: dm, wasteModeActive: wma, ingredientPriorities: ip } = stateRef.current;
    const hasInput = si.size > 0 || lm.size > 0 || dm.size > 0;
    if (!hasInput && !overrideIngredients) return;
    setSuggestLoading(true);
    setHasSearched(true);
    try {
      let ingredients: string[];
      if (overrideIngredients) {
        ingredients = overrideIngredients;
      } else {
        const list: string[] = [];
        si.forEach((ing) => {
          const priority = ip[ing];
          if (wma && priority === "today") {
            list.push(ing, ing, ing);
          } else if (wma && priority === "week") {
            list.push(ing, ing);
          } else {
            list.push(ing);
          }
        });
        ingredients = list;
      }
      const res = await authFetch(`${API_BASE}/recipes/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          ingredients,
          moods: Array.from(lm),
          exclusions: Array.from(dm),
        }),
      });
      if (!res.ok) throw new Error("Fehler beim Laden der Vorschläge");
      const data = await res.json();
      setSuggestions(data.recipes ?? []);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }, []);

  const selectedIngredientsKey = Array.from(selectedIngredients).sort().join(",");
  const likedMoodsKey = Array.from(likedMoods).sort().join(",");
  const dislikedMoodsKey = Array.from(dislikedMoods).sort().join(",");
  const priorityKey = JSON.stringify(ingredientPriorities);

  useEffect(() => {
    const hasInput = selectedIngredients.size > 0 || likedMoods.size > 0 || dislikedMoods.size > 0;
    if (!hasInput) {
      setSuggestions([]);
      setHasSearched(false);
      return;
    }
    const timer = setTimeout(() => fetchSuggestions(), 600);
    return () => clearTimeout(timer);
  }, [selectedIngredientsKey, likedMoodsKey, dislikedMoodsKey, wasteModeActive, priorityKey]);

  // === Concept A: Chat ===
  const startChat = () => {
    setChatMessages([
      {
        role: "assistant",
        content: "Was hast du gerade zuhause? Schreib mir einfach, was du im Kühlschrank oder in der Speisekammer hast – z.B. \"Ich hab noch Hähnchen und ein bisschen Gemüse\".",
      },
    ]);
    setChatActive(true);
    setChatChips(["Hähnchen und Gemüse", "Pasta und Tomaten", "Fisch und Kartoffeln"]);
    setChatRounds(0);
  };

  const MAX_CHAT_ROUNDS = 3;

  const sendChatMessage = async (content: string) => {
    if (!content.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatChips([]);
    setChatLoading(true);

    const newRoundCount = chatRounds + 1;

    try {
      const pantryDefaults = pantryItems
        .filter((i) => i.isDefault === 1)
        .map((i) => i.ingredientName);

      // Force completion after max rounds
      const forceComplete = newRoundCount >= MAX_CHAT_ROUNDS;

      const res = await authFetch(`${API_BASE}/kochidee-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          messages: newMessages,
          pantryIngredients: pantryDefaults,
          forceComplete,
        }),
      });

      if (!res.ok) throw new Error("Chat fehlgeschlagen");
      const data: ChatResponse = await res.json();

      setChatRounds(newRoundCount);

      // If max rounds reached, force completion even if AI didn't set isComplete
      const shouldComplete = data.isComplete || forceComplete;

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: shouldComplete && !data.isComplete ? "Super! Ich habe genug Infos – lass mich passende Rezepte für dich suchen..." : data.message },
      ]);
      setChatChips(shouldComplete ? [] : (data.suggestedChips ?? []));

      if (data.extractedIngredients?.length > 0) {
        setSelectedIngredients((prev) => {
          const next = new Set(prev);
          data.extractedIngredients.forEach((i) => next.add(i));
          return next;
        });
        setAllIngredients((prev) => {
          const combined = new Set([...prev, ...data.extractedIngredients]);
          return Array.from(combined).sort((a, b) => a.localeCompare(b, "de"));
        });
      }

      if (shouldComplete) {
        const profile = data.finalProfile;
        if (profile) {
          setSelectedIngredients((prev) => {
            const merged = new Set(prev);
            pantryDefaultIngredients.forEach((d) => merged.add(d));
            profile.ingredients.forEach((i: string) => merged.add(i));
            return merged;
          });
          const newLiked = new Set(stateRef.current.likedMoods);
          const newDisliked = new Set(stateRef.current.dislikedMoods);
          profile.moods.forEach((m: string) => {
            newLiked.add(m);
            setMoodStates((prev) => ({ ...prev, [m]: "liked" }));
          });
          profile.exclusions.forEach((m: string) => {
            newDisliked.add(m);
            setMoodStates((prev) => ({ ...prev, [m]: "disliked" }));
          });
          const mergedIngredients = new Set([...Array.from(pantryDefaultIngredients), ...profile.ingredients]);
          stateRef.current = {
            ...stateRef.current,
            selectedIngredients: mergedIngredients,
            likedMoods: newLiked,
            dislikedMoods: newDisliked,
          };
          await fetchSuggestions([...mergedIngredients]);
        } else {
          await fetchSuggestions();
        }
        setChatActive(false);
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

  // === Concept D: Pantry save ===
  const savePantry = async () => {
    if (!token) return;
    setPantrySaving(true);
    try {
      const pantryNames = new Set(pantryItems.map((i) => i.ingredientName.toLowerCase()));
      const expiryOnlyItems = Object.entries(ingredientPriorities)
        .filter(([name, p]) => p !== "good" && !pantryNames.has(name.toLowerCase()))
        .map(([name, p]) => ({ ingredientName: name, expiryPriority: p, isDefault: 0 }));
      const allItems = [...pantryItems, ...expiryOnlyItems];
      await authFetch(`${API_BASE}/pantry/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ items: allItems }),
      });
      setPantryDirty(false);
    } catch {
    } finally {
      setPantrySaving(false);
    }
  };

  const addPantryItem = () => {
    const trimmed = pantryNewItem.trim();
    if (!trimmed) return;
    if (pantryItems.some((i) => i.ingredientName.toLowerCase() === trimmed.toLowerCase())) return;
    setPantryItems((prev) => [
      ...prev,
      { ingredientName: trimmed, expiryPriority: "good", isDefault: 1 },
    ]);
    setPantryNewItem("");
    setPantryDirty(true);
  };

  const removePantryItem = (name: string) => {
    setPantryItems((prev) => prev.filter((i) => i.ingredientName !== name));
    setPantryDefaultIngredients((d) => {
      const dn = new Set(d);
      dn.delete(name);
      return dn;
    });
    setPantryDirty(true);
  };

  const togglePantryDefault = (name: string) => {
    setPantryItems((prev) => {
      const updated = prev.map((i) =>
        i.ingredientName === name ? { ...i, isDefault: i.isDefault === 1 ? 0 : 1 } : i
      );
      const newDefaults = new Set(updated.filter((i) => i.isDefault === 1).map((i) => i.ingredientName));
      setPantryDefaultIngredients(newDefaults);
      const item = updated.find((i) => i.ingredientName === name);
      if (item && item.isDefault === 1) {
        setSelectedIngredients((sel) => {
          const next = new Set(sel);
          next.add(name);
          return next;
        });
      }
      return updated;
    });
    setPantryDirty(true);
  };

  const filteredIngredients = allIngredients.filter((ing) => {
    if (selectedIngredients.has(ing)) return false;
    if (!ingredientSearch.trim()) return true;
    return ing.toLowerCase().includes(ingredientSearch.trim().toLowerCase());
  });

  const canAdd = ingredientSearch.trim().length > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-5 h-5 text-[#4A7C59]" />
        </div>
        <div className="flex-1">
          <h1 className="font-serif font-bold text-xl text-foreground leading-snug">Was koche ich heute?</h1>
          <p className="text-xs text-muted-foreground">Wähle Zutaten, Stimmung – oder chatte mit der KI</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWasteModeActive((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border transition-all ${
              wasteModeActive
                ? "bg-red-500 text-white border-red-500 shadow-sm"
                : "bg-white text-foreground border-border hover:bg-red-50 hover:border-red-300"
            }`}
          >
            🚨 Was muss weg?
          </button>
          {hasAnyInput && (
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-[#f5ede0]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* === Concept A: Chat === */}
      <section className="bg-white rounded-2xl border border-border p-5" style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.07)" }}>
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-4 h-4 text-[#4A7C59]" />
          <h2 className="font-serif font-semibold text-base text-foreground">💬 KI-Assistent fragen</h2>
        </div>

        {!chatActive ? (
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-3">
                Schreib einfach was du zuhause hast – die KI extrahiert Zutaten und stellt gezielte Rückfragen.
              </p>
              <button
                onClick={startChat}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-medium hover:bg-[#2d5240] transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Assistent starten
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="space-y-3 max-h-72 overflow-y-auto mb-3 pr-1">
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
              <div className="flex flex-wrap gap-1.5 mb-2">
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

            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(chatInput); }}
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
                onClick={() => { setChatActive(false); setChatMessages([]); setChatChips([]); }}
                className="px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-[#f5ede0] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">Runde {chatRounds} / max. 3</p>
          </div>
        )}
      </section>

      {/* === Lagerort-Tabs: Das habe ich zuhause === */}
      <section className="bg-white rounded-2xl border border-border p-5" style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.07)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif font-semibold text-base text-foreground">🥦 Das habe ich zuhause</h2>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-4 bg-[#f5ede0] rounded-xl p-1">
          {(["fridge", "freezer", "pantry"] as StorageLocation[]).map((loc) => (
            <button
              key={loc}
              onClick={() => { setActiveLocation(loc); setActiveCategory("all"); setOpenChipEditor(null); setQuickSelectCategory(null); }}
              className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeLocation === loc
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {LOCATION_LABELS[loc]}
            </button>
          ))}
        </div>

        {/* Category filter bar */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 no-scrollbar">
          {["all", "🥦 Gemüse", "🥩 Fleisch & Fisch", "🥛 Milch & Käse", "🌾 Getreide & Teig", "🫙 Gewürze & Öle", "🍳 Sonstiges"].map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                if (cat === "all") {
                  setQuickSelectCategory(null);
                } else {
                  setQuickSelectCategory((prev) => (prev === cat ? null : cat));
                }
              }}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                activeCategory === cat
                  ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                  : "bg-white text-muted-foreground border-border hover:border-[#4A7C59]/30"
              }`}
            >
              {cat === "all" ? "Alle" : cat}
              {cat !== "all" && quickSelectCategory === cat && (
                <span className="ml-1 opacity-70">▲</span>
              )}
              {cat !== "all" && quickSelectCategory !== cat && activeCategory === cat && (
                <span className="ml-1 opacity-70">▼</span>
              )}
            </button>
          ))}
        </div>

        {/* Quick-select panel */}
        {quickSelectCategory && quickSelectCategory !== "all" && (() => {
          const suggestions = QUICK_SUGGESTIONS[activeLocation]?.[quickSelectCategory] ?? [];
          if (suggestions.length === 0) return null;
          return (
            <div className="mb-3 p-3 bg-[#f0f4f1] rounded-xl border border-[#4A7C59]/20">
              <p className="text-xs font-medium text-[#4A7C59] mb-2">
                Schnell hinzufügen – {quickSelectCategory}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((item) => {
                  const matchingItem = pantryItems.find(
                    (p) => p.ingredientName.toLowerCase() === item.toLowerCase() && p.storageLocation === activeLocation
                  );
                  const inPantry = !!matchingItem;
                  const isDefault = matchingItem?.isDefault === 1;
                  return (
                    <button
                      key={item}
                      disabled={isDefault}
                      onClick={() => {
                        if (inPantry && !isDefault) {
                          removeIngredientByName(item, activeLocation);
                        } else if (!inPantry) {
                          addIngredientByName(item, activeLocation);
                        }
                      }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        isDefault
                          ? "bg-[#4A7C59]/40 text-white border-[#4A7C59]/40 cursor-default"
                          : inPantry
                          ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                          : "bg-white text-foreground border-border hover:border-[#4A7C59]/50"
                      }`}
                    >
                      {inPantry && <span className="text-[10px]">✓</span>}
                      {item}
                      {isDefault && <span className="text-[10px] opacity-70">★</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Ingredients list for active location */}
        {pantryLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            Vorrat wird geladen…
          </div>
        ) : (
          <>
            {(() => {
              const locationItems = pantryItems.filter(
                (i) => i.storageLocation === activeLocation && i.isDefault === 0
              );
              const defaultItems = pantryItems.filter(
                (i) => i.storageLocation === activeLocation && i.isDefault === 1
              );
              const filtered = locationItems.filter((item) => {
                if (ingredientSearch.trim()) {
                  return item.ingredientName.toLowerCase().includes(ingredientSearch.trim().toLowerCase());
                }
                if (activeCategory === "all") return true;
                return getCategoryForIngredient(item.ingredientName) === activeCategory;
              });

              return (
                <>
                  {/* Chip list */}
                  {filtered.length === 0 && locationItems.length > 0 && ingredientSearch.trim() ? (
                    <p className="text-xs text-muted-foreground py-2 italic">
                      Keine Treffer für „{ingredientSearch.trim()}"
                    </p>
                  ) : filtered.length === 0 && !ingredientSearch.trim() && activeCategory === "all" ? (
                    <p className="text-xs text-muted-foreground py-2 italic">
                      Noch nichts hier – füge Zutaten über das Suchfeld oder per Foto hinzu.
                    </p>
                  ) : null}

                  {filtered.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {filtered.map((item) => {
                        const effectivePriority = getEffectivePriority(item);
                        const isEditorOpen = openChipEditor === item.id;
                        const wasteOverride = wasteModeActive ? ingredientPriorities[item.ingredientName] : undefined;
                        const displayPriority = wasteOverride ?? effectivePriority;
                        return (
                          <div key={item.id ?? item.ingredientName} className="relative">
                            <button
                              onClick={() => setOpenChipEditor(isEditorOpen ? null : (item.id ?? null))}
                              className={`flex items-center gap-1 min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${PRIORITY_COLORS[displayPriority]}`}
                            >
                              <span>{PRIORITY_INDICATOR[displayPriority]}</span>
                              <span>{item.ingredientName}</span>
                              {item.expiryDate && (
                                <span className="opacity-70 text-[10px]">
                                  {new Date(item.expiryDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                                </span>
                              )}
                            </button>
                            {isEditorOpen && (
                              <div className="absolute left-0 top-full mt-1 z-30 bg-white rounded-xl border border-border shadow-lg p-3 w-56">
                                <p className="text-xs font-semibold text-foreground mb-2">{item.ingredientName}</p>
                                <div className="flex gap-1 mb-2">
                                  {(["good", "week", "today"] as ExpiryPriority[]).map((p) => (
                                    <button
                                      key={p}
                                      onClick={() => {
                                        updatePantryItem(item.id!, { expiryPriority: p });
                                        setIngredientPriorities((prev) => ({ ...prev, [item.ingredientName]: p }));
                                      }}
                                      className={`flex-1 px-1.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                        (item.expiryPriority ?? "good") === p
                                          ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                                          : "bg-white text-muted-foreground border-border hover:border-[#4A7C59]/30"
                                      }`}
                                    >
                                      {p === "good" ? "🟢 Gut" : p === "week" ? "🟡 Woche" : "🔴 Heute!"}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="date"
                                  value={item.expiryDate ?? ""}
                                  onChange={(e) => updatePantryItem(item.id!, { expiryDate: e.target.value || null })}
                                  className="w-full px-2 py-1.5 rounded-lg border border-border text-xs bg-[#fdfaf6] focus:outline-none focus:ring-1 focus:ring-[#4A7C59]/30 mb-2"
                                />
                                <button
                                  onClick={() => {
                                    if (item.id) deletePantryItemById(item.id);
                                    setOpenChipEditor(null);
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-medium hover:bg-red-100 transition-colors"
                                >
                                  Entfernen
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Standard-Vorrat section */}
                  {defaultItems.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <button
                        onClick={() => setDefaultSectionOpen((v) => !v)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 font-medium"
                      >
                        <span>★ Standard-Vorrat – immer da</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${defaultSectionOpen ? "rotate-180" : ""}`} />
                      </button>
                      {defaultSectionOpen && (
                        <div className="flex flex-wrap gap-1.5">
                          {defaultItems.map((item) => (
                            <span
                              key={item.id ?? item.ingredientName}
                              className="px-2.5 py-1 min-h-[36px] flex items-center rounded-full text-xs font-medium bg-[#f0f4f1] text-[#4A7C59]/70 border border-[#4A7C59]/10"
                            >
                              ★ {item.ingredientName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}

        {/* Search + Add */}
        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={ingredientSearch}
            onChange={(e) => setIngredientSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (canAdd) {
                  addIngredient();
                }
              }
            }}
            placeholder={`Zutat zu ${LOCATION_LABELS[activeLocation]} hinzufügen…`}
            className="flex-1 px-3 py-2 rounded-xl border border-border bg-[#fdfaf6] text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
          />
          <button
            onClick={addIngredient}
            disabled={!canAdd}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#4A7C59] text-white text-sm font-medium hover:bg-[#2d5240] disabled:opacity-40 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {ingredientSearch.trim() && filteredIngredients.length === 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Drücke Enter oder + um „{ingredientSearch.trim()}" zu {LOCATION_LABELS[activeLocation]} hinzuzufügen.
          </p>
        )}

        {wasteModeActive && (
          <p className="text-xs text-muted-foreground mt-2">🔴 Heute · 🟡 Diese Woche · 🟢 Noch gut – Tippe auf eine Zutat um den Status zu ändern</p>
        )}

        {/* Photo upload area */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">📷 Foto des {LOCATION_LABELS[activeLocation].replace(/^.*? /, "")} analysieren:</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute("capture");
                  fileInputRef.current.setAttribute("capture", "environment");
                  fileInputRef.current.click();
                }
              }}
              disabled={fridgeLoading}
              className="flex items-center gap-2 px-3 py-2 bg-[#6b5ca5] text-white rounded-xl text-xs font-medium hover:bg-[#5a4c8e] disabled:opacity-50 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              Foto aufnehmen
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute("capture");
                  fileInputRef.current.click();
                }
              }}
              disabled={fridgeLoading}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-border text-foreground rounded-xl text-xs font-medium hover:bg-[#f5ede0] disabled:opacity-50 transition-colors"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Bild hochladen
            </button>
          </div>
          {fridgeLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6b5ca5]" />
              Foto wird analysiert…
            </div>
          )}
          {fridgeError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {fridgeError}
            </div>
          )}
        </div>
      </section>

      {/* Photo Scan Confirmation Modal */}
      {photoScanResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#6b5ca5] text-white px-5 py-4 rounded-t-2xl flex items-center justify-between">
              <h3 className="font-semibold text-sm">📷 Foto-Ergebnis – {LOCATION_LABELS[activeLocation]}</h3>
              <button onClick={() => setPhotoScanResult(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {photoScanResult.toAdd.length === 0 && photoScanResult.toRemove.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine neuen Zutaten erkannt und alle vorhandenen sichtbar.
                </p>
              )}

              {photoScanResult.toAdd.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#4A7C59] mb-2">Neu erkannt 🆕</p>
                  <div className="space-y-1">
                    {photoScanResult.toAdd.map((name) => (
                      <label key={name} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={photoScanResult.toAddChecked.has(name)}
                          onChange={(e) => {
                            setPhotoScanResult((prev) => {
                              if (!prev) return prev;
                              const next = new Set(prev.toAddChecked);
                              if (e.target.checked) next.add(name); else next.delete(name);
                              return { ...prev, toAddChecked: next };
                            });
                          }}
                          className="accent-[#4A7C59]"
                        />
                        <span className="text-sm text-foreground">{name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {photoScanResult.toRemove.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 mb-2">Nicht mehr sichtbar 👀</p>
                  <div className="space-y-1">
                    {photoScanResult.toRemove.map((item) => (
                      <label key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={photoScanResult.toRemoveChecked.has(item.id!)}
                          onChange={(e) => {
                            setPhotoScanResult((prev) => {
                              if (!prev) return prev;
                              const next = new Set(prev.toRemoveChecked);
                              if (e.target.checked) next.add(item.id!); else next.delete(item.id!);
                              return { ...prev, toRemoveChecked: next };
                            });
                          }}
                          className="accent-red-500"
                        />
                        <span className="text-sm text-foreground">{item.ingredientName}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handlePhotoScanConfirm}
                  className="flex-1 px-4 py-2.5 bg-[#6b5ca5] text-white rounded-xl text-sm font-medium hover:bg-[#5a4c8e] transition-colors"
                >
                  Übernehmen
                </button>
                <button
                  onClick={() => setPhotoScanResult(null)}
                  className="px-4 py-2.5 border border-border text-sm rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Mood Filter */}
      <section className="bg-white rounded-2xl border border-border p-5" style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.07)" }}>
        <h2 className="font-serif font-semibold text-base text-foreground mb-1">💭 Meine Stimmung</h2>
        <p className="text-xs text-muted-foreground mb-4">Einmal klicken = Lust drauf, zweimal = kein Bock, nochmal = neutral</p>

        <div className="flex flex-wrap gap-2">
          {MOOD_OPTIONS.map((opt) => {
            const state: MoodState = moodStates[opt.value] ?? "neutral";
            const isLiked = state === "liked";
            const isDisliked = state === "disliked";

            let cardClass =
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all select-none cursor-pointer ";

            if (isLiked) {
              cardClass += "bg-[#4A7C59] text-white border-[#4A7C59] shadow-sm";
            } else if (isDisliked) {
              cardClass += "bg-red-500 text-white border-red-500 shadow-sm";
            } else {
              cardClass += "bg-white text-foreground border-border hover:border-[#4A7C59]/40 hover:bg-[#4A7C59]/5";
            }

            return (
              <button
                key={opt.value}
                onClick={() => cycleMood(opt.value)}
                className={cardClass}
              >
                <span>{opt.emoji}</span>
                {opt.label}
                {isLiked && <span className="ml-0.5 text-xs font-bold">✓</span>}
                {isDisliked && <span className="ml-0.5 text-xs font-bold">✗</span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* Cooking history toast suggestion */}
      {pantryToast && pantryToastIngredient && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3" style={{ boxShadow: "0 2px 8px rgba(120,70,30,0.07)" }}>
          <span className="text-lg flex-shrink-0">🤖</span>
          <div className="flex-1">
            <p className="text-sm text-amber-800 font-medium mb-2">{pantryToast}</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const ingredient = pantryToastIngredient;
                  setPantryItems((prev) => {
                    if (prev.some((i) => i.ingredientName.toLowerCase() === ingredient.toLowerCase())) return prev;
                    return [...prev, { ingredientName: ingredient, expiryPriority: "good", isDefault: 1 }];
                  });
                  setPantryDirty(true);
                  setPantryToast(null);
                  setPantryToastIngredient(null);
                }}
                className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-medium hover:bg-amber-600 transition-colors"
              >
                Ja, als Standard speichern
              </button>
              <button
                onClick={() => { setPantryToast(null); setPantryToastIngredient(null); }}
                className="px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-xl text-xs font-medium hover:bg-amber-50 transition-colors"
              >
                Nein, danke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === Concept D: Pantry === */}
      {token && (
        <section className="bg-white rounded-2xl border border-border p-5" style={{ boxShadow: "0 2px 12px rgba(120,70,30,0.07)" }}>
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setPantryOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#7a4a2a]" />
              <h2 className="font-serif font-semibold text-base text-foreground">🥫 Mein Vorrat</h2>
              {pantryItems.length > 0 && (
                <span className="text-xs text-muted-foreground">({pantryItems.length} Zutaten gespeichert)</span>
              )}
            </div>
            {pantryOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {pantryOpen && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-3">
                Speichere hier, was du immer zuhause hast. Standard-Zutaten werden beim Laden dezent angezeigt und der KI bekannt gemacht.
              </p>

              {pantryLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Vorrat wird geladen…
                </div>
              ) : (
                <>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={pantryNewItem}
                      onChange={(e) => setPantryNewItem(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addPantryItem(); }}
                      placeholder="Zutat hinzufügen (z.B. Olivenöl, Salz, Mehl)"
                      className="flex-1 px-3 py-2 rounded-xl border border-border bg-[#fdfaf6] text-sm focus:outline-none focus:ring-2 focus:ring-[#7a4a2a]/30"
                    />
                    <button
                      onClick={addPantryItem}
                      disabled={!pantryNewItem.trim()}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#7a4a2a] text-white text-sm font-medium hover:bg-[#5a3520] disabled:opacity-40 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {pantryItems.filter((i) => i.isDefault === 1).length > 0 && (
                    <div className="space-y-1.5 mb-3 max-h-52 overflow-y-auto">
                      {pantryItems.filter((i) => i.isDefault === 1).map((item) => (
                        <div key={item.ingredientName} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#fdfaf6] border border-border">
                          <span className="flex-1 text-sm">{item.ingredientName}</span>
                          <button
                            onClick={() => togglePantryDefault(item.ingredientName)}
                            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                              item.isDefault === 1
                                ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                                : "bg-white text-muted-foreground border-border hover:border-[#4A7C59]/30"
                            }`}
                            title={item.isDefault === 1 ? "Standard (immer da)" : "Kein Standard"}
                          >
                            {item.isDefault === 1 ? "Standard ✓" : "Standard?"}
                          </button>
                          <button
                            onClick={() => removePantryItem(item.ingredientName)}
                            className="text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {pantryItems.length === 0 && (
                    <p className="text-xs text-muted-foreground italic py-2">
                      Noch nichts gespeichert. Füge Grundzutaten hinzu wie Öl, Salz, Mehl, Knoblauch.
                    </p>
                  )}

                  {pantryDirty && (
                    <button
                      onClick={savePantry}
                      disabled={pantrySaving}
                      className="flex items-center gap-2 px-4 py-2 bg-[#7a4a2a] text-white rounded-xl text-sm font-medium hover:bg-[#5a3520] disabled:opacity-60 transition-colors"
                    >
                      {pantrySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Vorrat speichern
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Section 4: Results */}
      {(hasAnyInput || hasSearched) && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-serif font-semibold text-base text-foreground">🍽️ Passende Rezepte</h2>
            {suggestLoading && <Loader2 className="w-4 h-4 animate-spin text-[#4A7C59]" />}
            {wasteModeActive && Object.values(ingredientPriorities).some((p) => p === "today" || p === "week") && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                🚨 Dringende Zutaten priorisiert
              </span>
            )}
          </div>

          {!suggestLoading && hasSearched && suggestions.length === 0 && (
            <div className="text-center py-10 bg-white rounded-2xl border border-border">
              <p className="text-3xl mb-3">🔍</p>
              <p className="font-serif text-base text-foreground mb-1">Kein passendes Rezept gefunden</p>
              <p className="text-sm text-muted-foreground">
                Probiere weniger Ausschlüsse oder wähle andere Zutaten aus.
              </p>
            </div>
          )}

          {!suggestLoading && suggestions.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {suggestions.map((recipe) => (
                <RecipeSuggestionCard
                  key={recipe.id}
                  recipe={recipe}
                  onClick={() => setSelectedRecipe(recipe)}
                  expiringUsed={countExpiringUsed(recipe)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {selectedRecipe && (
        <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />
      )}
    </div>
  );
}
