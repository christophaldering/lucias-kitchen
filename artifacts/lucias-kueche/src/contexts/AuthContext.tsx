import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { registerUnauthorizedHandler, authFetch } from "@/lib/authFetch";

const API_BASE = "/api";

export interface AuthUser {
  id: number;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  cookingLevel: string | null;
  favoriteCategories: string[] | null;
  dietaryPreference: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<AuthUser>) => Promise<void>;
  uploadAvatar: (avatarUrl: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getStoredToken(): string | null {
  try {
    return localStorage.getItem("lk_auth_token");
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem("lk_auth_token", token);
    } else {
      localStorage.removeItem("lk_auth_token");
    }
  } catch {
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (t: string) => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) throw new Error("unauthorized");
    return res.json() as Promise<AuthUser>;
  }, []);

  useEffect(() => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }
    fetchMe(storedToken)
      .then((u) => {
        setUser(u);
        setToken(storedToken);
      })
      .catch(() => {
        setStoredToken(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message ?? "Login fehlgeschlagen");
    }
    const data = await res.json();
    setStoredToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(logout);
  }, [logout]);

  const updateProfile = useCallback(async (data: Partial<AuthUser>) => {
    const t = getStoredToken();
    if (!t) throw new Error("Not authenticated");
    const res = await authFetch(`${API_BASE}/auth/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Profil konnte nicht gespeichert werden");
    }
    const updated = await res.json();
    setUser(updated);
  }, []);

  const uploadAvatar = useCallback(async (avatarUrl: string) => {
    const t = getStoredToken();
    if (!t) throw new Error("Not authenticated");
    const res = await authFetch(`${API_BASE}/auth/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ avatarUrl }),
    });
    if (!res.ok) throw new Error("Avatar konnte nicht gespeichert werden");
    const updated = await res.json();
    setUser(updated);
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    const t = getStoredToken();
    if (!t) throw new Error("Not authenticated");
    const res = await authFetch(`${API_BASE}/auth/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? "Passwort konnte nicht geändert werden");
    }
  }, []);

  const completeOnboarding = useCallback(async () => {
    await updateProfile({ onboardingCompleted: true });
  }, [updateProfile]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateProfile, uploadAvatar, changePassword, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
