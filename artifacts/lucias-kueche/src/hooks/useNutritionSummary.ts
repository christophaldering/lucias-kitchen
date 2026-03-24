import { useState, useEffect, useCallback } from "react";

export interface NutritionSummary {
  from: string;
  to: string;
  totalKcal: number;
  avgKcalPerDay: number | null;
  daysWithKcal: number;
  daysWithoutKcal: number;
  totalDays: number;
  byDate: Record<string, number | null>;
}

export interface KcalHistoryEntry {
  label: string;
  from: string;
  to: string;
  totalKcal: number;
  plannedDays: number;
}

const API_BASE = "/api";

export function useNutritionSummary(from: string, to: string) {
  const [summary, setSummary] = useState<NutritionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/meal-plans/nutrition-summary?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data);
    } catch {
      setError("Nährwertdaten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refetch: fetchSummary };
}

export function useKcalHistory(weeks = 4) {
  const [history, setHistory] = useState<KcalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/meal-plans/kcal-history?weeks=${weeks}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setHistory(data))
      .catch(() => setError("Verlaufsdaten konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [weeks]);

  return { history, loading, error };
}
