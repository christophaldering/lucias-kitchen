---
name: Server-seitige Sortierung GET /recipes
description: buildSortOrder() Funktion — Implementierungsdetails und Fallstricke
---

## Regel
`buildSortOrder(qf?: RecipeQueryFilters): SQL` erzeugt den ORDER BY-Ausdruck für `getRecipesWithIngredients`. Nur `sql.raw()` verwenden — kein Verschachteln von `sql`-Templates im ORDER BY-Kontext.

**Why:** Drizzle interpoliert SQL-Werte in ORDER BY-Kontexten manchmal als Parameter statt als SQL-Fragmente; `sql.raw()` mit ausschließlich kontrollierten Enum-Werten ist sicherer und hat keine Injection-Risiken.

**How to apply:** `case "zeit"` dupliziert den CASE-Ausdruck aus `totalTimeParsedMinutesSql` inline, anstatt die Hilfsfunktion zu verschachteln. Wenn die Hilfsfunktion geändert wird, muss auch der `buildSortOrder`-"zeit"-Case synchron gehalten werden.

## Standard-Richtungen (wenn `dir` fehlt)
- alphabetisch, kategorie, schwierigkeit, zeit → asc
- bewertung, neueste, haeufig_gekocht → desc
