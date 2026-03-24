import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRecipes } from "@/hooks/useRecipes";
import { useGroups, type Group } from "@/hooks/useGroups";
import GroupCreateModal from "@/components/GroupCreateModal";
import GroupMembersModal from "@/components/GroupMembersModal";
import {
  Camera, Save, Eye, EyeOff, Loader2, CheckCircle2,
  Users, Plus, Clock, CheckCircle, XCircle, ChevronRight
} from "lucide-react";

function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  el.className = `fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg transition-all ${
    type === "ok" ? "bg-[#4A7C59] text-white" : "bg-red-600 text-white"
  }`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const COOKING_LEVELS = ["Lehrling", "Hobbyköchin", "Profi", "Meisterköchin"];
const COOKING_STYLES = ["Italiana", "Deutsch", "Asiatisch", "Mediterran", "Backen", "Französisch", "Mexikanisch", "Orientalisch"];
const DIETARY_OPTIONS = ["Alles", "Vegetarisch", "Vegan", "Glutenfrei"];

function computePasswordStrength(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

const STRENGTH_LABELS = ["", "Sehr schwach", "Schwach", "Mittel", "Stark", "Sehr stark"];
const STRENGTH_COLORS = ["", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-400", "bg-green-600"];

function computeBadges(recipes: { category: string }[]) {
  const counts: Record<string, number> = {};
  recipes.forEach((r) => { counts[r.category] = (counts[r.category] || 0) + 1; });

  const badges: { label: string; emoji: string }[] = [];

  if ((counts["Pasta"] ?? 0) >= 3) badges.push({ label: "Pasta-Königin", emoji: "🍝" });
  if ((counts["Geflügel"] ?? 0) >= 3) badges.push({ label: "Hähnchen-Fan", emoji: "🍗" });
  if ((counts["Fisch"] ?? 0) >= 3) badges.push({ label: "Fisch-Expertin", emoji: "🐟" });
  if ((counts["Vegetarisch"] ?? 0) >= 3) badges.push({ label: "Grüne Göttin", emoji: "🌿" });
  if ((counts["Fleisch"] ?? 0) >= 3) badges.push({ label: "Grill-Meisterin", emoji: "🥩" });
  if (Object.keys(counts).length >= 4) badges.push({ label: "Weltenbummlerin", emoji: "🌍" });
  if (recipes.length >= 10) badges.push({ label: "Rezept-Sammlerin", emoji: "📖" });
  if (recipes.length >= 20) badges.push({ label: "Kochbuch-Legende", emoji: "👑" });

  if (badges.length === 0) badges.push({ label: "Aufgehender Stern", emoji: "⭐" });

  return badges.slice(0, 3);
}

function AvatarSection({ user, onUpload }: { user: ReturnType<typeof useAuth>["user"]; onUpload: (url: string) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        await onUpload(dataUrl);
        toast("Profilbild gespeichert");
      };
      reader.readAsDataURL(file);
    } catch {
      toast("Fehler beim Hochladen", "err");
    } finally {
      setUploading(false);
    }
  };

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "L";

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="relative">
        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-[#4A7C59]/30 shadow-lg">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#C1693A] flex items-center justify-center">
              <span className="text-white text-3xl font-bold font-serif">{initials}</span>
            </div>
          )}
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#4A7C59] text-white flex items-center justify-center shadow-md hover:bg-[#3d6849] transition-colors disabled:opacity-60"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <h1 className="font-script text-3xl text-[#4A7C59]">{user?.displayName}</h1>
      <p className="text-sm text-muted-foreground">{user?.email}</p>
    </div>
  );
}

export default function Profil() {
  const { user, updateProfile, uploadAvatar, changePassword } = useAuth();
  const { recipes } = useRecipes();
  const { groups, loading: groupsLoading, fetchGroups, joinGroup } = useGroups();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [cookingLevel, setCookingLevel] = useState(user?.cookingLevel ?? "Hobbyköchin");
  const [favoriteCategories, setFavoriteCategories] = useState<string[]>(user?.favoriteCategories ?? []);
  const [dietaryPreference, setDietaryPreference] = useState(user?.dietaryPreference ?? "Alles");
  const [savingProfile, setSavingProfile] = useState(false);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const passwordStrength = computePasswordStrength(newPassword);
  const badges = computeBadges(recipes);

  const topCategory = recipes.length > 0
    ? Object.entries(
        recipes.reduce<Record<string, number>>((acc, r) => {
          acc[r.category] = (acc[r.category] || 0) + 1;
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  const createdAt = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })
    : "–";

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({ displayName, bio, cookingLevel, favoriteCategories, dietaryPreference });
      toast("Profil gespeichert ✓");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Fehler", "err");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast("Passwörter stimmen nicht überein", "err");
      return;
    }
    if (newPassword.length < 6) {
      toast("Neues Passwort muss mindestens 6 Zeichen haben", "err");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
      toast("Passwort geändert ✓");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Fehler", "err");
    } finally {
      setSavingPassword(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setFavoriteCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleJoin = async (group: Group) => {
    try {
      await joinGroup(group.id);
      toast("Gruppe beigetreten ✓");
    } catch {
      toast("Beitritt fehlgeschlagen", "err");
    }
  };

  const activeGroups = groups.filter((g) => g.status === "approved" && g.myMemberStatus === "joined");
  const pendingGroups = groups.filter((g) => g.status === "pending");
  const invitedGroups = groups.filter((g) => g.status === "approved" && g.myMemberStatus === "invited");
  const rejectedGroups = groups.filter((g) => g.status === "rejected");

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-28 space-y-6">
      {showCreateGroup && (
        <GroupCreateModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={fetchGroups}
        />
      )}

      {selectedGroup && (
        <GroupMembersModal
          group={selectedGroup}
          isOwner={selectedGroup.myRole === "owner"}
          onClose={() => setSelectedGroup(null)}
        />
      )}

      {/* Avatar */}
      <div className="bg-white rounded-2xl border border-border shadow-sm">
        <AvatarSection user={user} onUpload={uploadAvatar} />
      </div>

      {/* Personal data */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="font-serif text-lg font-semibold mb-5 flex items-center gap-2">
          👤 Persönliche Daten
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Anzeigename</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">E-Mail-Adresse</label>
            <input
              value={user?.email ?? ""}
              disabled
              className="w-full px-3 py-2 rounded-xl border border-border bg-gray-50 text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Über mich als Köchin</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Erzähl ein bisschen über deine Leidenschaft fürs Kochen..."
              className="w-full px-3 py-2 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30 resize-none"
            />
          </div>
          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-60"
          >
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Speichern
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="font-serif text-lg font-semibold mb-5 flex items-center gap-2">
          🔒 Passwort ändern
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Altes Passwort</label>
            <div className="relative">
              <input
                type={showOldPw ? "text" : "password"}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
              />
              <button type="button" onClick={() => setShowOldPw(!showOldPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showOldPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Neues Passwort</label>
            <div className="relative">
              <input
                type={showNewPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
              />
              <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${i <= passwordStrength ? STRENGTH_COLORS[passwordStrength] : "bg-gray-200"}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{STRENGTH_LABELS[passwordStrength]}</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Neues Passwort bestätigen</label>
            <div className="relative">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 pr-10 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]/30"
              />
              {confirmPassword && newPassword === confirmPassword && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
              )}
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={savingPassword || !oldPassword || !newPassword || !confirmPassword}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#C1693A] text-white rounded-xl text-sm font-semibold hover:bg-[#a8572f] transition-colors disabled:opacity-60"
          >
            {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Passwort ändern
          </button>
        </div>
      </div>

      {/* Cooking personality */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="font-serif text-lg font-semibold mb-5 flex items-center gap-2">
          👩‍🍳 Meine Küchen-Persönlichkeit
        </h2>
        <div className="space-y-6">
          {/* Cooking level */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-3">Koch-Level</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COOKING_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setCookingLevel(level)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-medium border-2 transition-all ${
                    cookingLevel === level
                      ? "bg-[#4A7C59] text-white border-[#4A7C59] shadow-sm"
                      : "bg-white text-foreground border-border hover:border-[#4A7C59]/50"
                  }`}
                >
                  {level === "Lehrling" ? "🌱" : level === "Hobbyköchin" ? "🍳" : level === "Profi" ? "👨‍🍳" : "👑"} {level}
                </button>
              ))}
            </div>
          </div>

          {/* Favorite cooking styles */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-3">Lieblings-Kochstile</label>
            <div className="flex flex-wrap gap-2">
              {COOKING_STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => toggleCategory(style)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    favoriteCategories.includes(style)
                      ? "bg-[#C1693A] text-white border-[#C1693A]"
                      : "bg-white text-foreground border-border hover:border-[#C1693A]/50"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Dietary preference */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-3">Ernährungsweise</label>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setDietaryPreference(opt)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all ${
                    dietaryPreference === opt
                      ? "bg-[#4A7C59] text-white border-[#4A7C59]"
                      : "bg-white text-foreground border-border hover:border-[#4A7C59]/50"
                  }`}
                >
                  {opt === "Alles" ? "🍽️" : opt === "Vegetarisch" ? "🥦" : opt === "Vegan" ? "🌱" : "🌾"} {opt}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors disabled:opacity-60"
          >
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Persönlichkeit speichern
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="font-serif text-lg font-semibold mb-5 flex items-center gap-2">
          📊 Meine Rezept-Bibliothek
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-[#4A7C59] font-serif">{recipes.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Rezepte gesamt</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-[#C1693A] font-serif">{topCategory ?? "–"}</div>
            <div className="text-xs text-muted-foreground mt-1">Lieblingsküche</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-[#4A7C59] font-serif mt-2">{createdAt}</div>
            <div className="text-xs text-muted-foreground mt-1">Dabei seit</div>
          </div>
        </div>

        {/* Badges */}
        <div className="border-t border-border pt-5">
          <p className="text-xs font-semibold text-muted-foreground mb-3">🏅 Meine Küchen-Badges</p>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <div
                key={badge.label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#4A7C59]/10 border border-[#4A7C59]/20"
              >
                <span className="text-lg">{badge.emoji}</span>
                <span className="text-sm font-medium text-[#4A7C59]">{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Groups */}
      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-[#4A7C59]" /> Meine Gruppen
          </h2>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#4A7C59] text-white rounded-xl text-sm font-semibold hover:bg-[#3d6849] transition-colors"
          >
            <Plus className="w-4 h-4" /> Neue Gruppe
          </button>
        </div>

        {groupsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-[#4A7C59]" />
          </div>
        ) : (
          <div className="space-y-4">
            {invitedGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Einladungen</p>
                <div className="space-y-2">
                  {invitedGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200">
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-blue-200 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-blue-600">Du wurdest eingeladen</p>
                      </div>
                      <button
                        onClick={() => handleJoin(g)}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700 transition-colors"
                      >
                        Beitreten
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-[#4A7C59]" /> Aktive Gruppen
                </p>
                <div className="space-y-2">
                  {activeGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setSelectedGroup(g)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-border/50 hover:border-[#4A7C59]/30 hover:bg-[#4A7C59]/5 transition-colors text-left"
                    >
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-[#4A7C59]/10 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-[#4A7C59]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {g.myRole === "owner" ? "Eigentümer" : "Mitglied"}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pendingGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500" /> Wartet auf Freigabe
                </p>
                <div className="space-y-2">
                  {pendingGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-amber-200 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-amber-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Wartet auf Admin-Freigabe
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rejectedGroups.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-red-400" /> Abgelehnt
                </p>
                <div className="space-y-2">
                  {rejectedGroups.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-red-200 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-red-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{g.name}</p>
                        <p className="text-xs text-red-600">
                          Abgelehnt{g.rejectionReason ? `: ${g.rejectionReason}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groups.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Du bist noch in keiner Gruppe.</p>
                <p className="text-xs mt-1">Erstelle eine Familie oder Community!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
