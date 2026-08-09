---
name: /recipes/stats Endpunkt
description: Aufbau und Fallstricke des Statistik-Endpunkts
---

## Regel
Alle Queries (`hasVariants`, `seasonal`) müssen VOR dem einzigen `res.json()`-Aufruf stehen. Zwei `res.json()`-Aufrufe im selben Handler führen zu einem Express-Fehler (Headers already sent).

**Why:** Bei der Etappe-3-Implementierung wurde versehentlich ein erster `res.json()` mit Platzhaltern gesendet, danach ein zweiter mit echten Werten — Express ignoriert den zweiten und sendet Platzhalter-Daten.

**How to apply:** Immer alle DB-Abfragen sammeln, dann einmal `res.json({...})` aufrufen.

## Felder (Stand Etappe 3)
- total, categories, difficulties, timeBuckets, top3, veryDeliciousCount, avgIngredients
- hasVariants: bool (EXISTS-Abfrage auf parent_recipe_id IS NOT NULL)
- seasonal: Array{id, title, category, imageUrl} — aktuelle Saison server-seitig via `new Date().getMonth()+1`, max 12
