---
name: Gemini Embedding Model
description: Welches Gemini-Modell für Embeddings verfügbar ist und warum text-embedding-004 nicht funktioniert.
---

**Modell:** `gemini-embedding-001` (3072 Dimensionen)

**Warum nicht text-embedding-004:** Das Modell ist unter dem eingesetzten GEMINI_API_KEY nicht verfügbar (HTTP 404 von der v1beta-API). ListModels liefert nur `gemini-embedding-001`, `gemini-embedding-2-preview` und `gemini-embedding-2`.

**How to apply:** Immer `gemini-embedding-001` verwenden. Bei Modellwechsel invalidiert content_hash automatisch alle gespeicherten Vektoren — kein manuelles Cleanup nötig.

**Speicherweg:** JSONB (float[]-Array), keine Größenbeschränkung. 3072 Dimensionen passen problemlos.

**API-Endpunkt:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=GEMINI_API_KEY` (nicht der Replit-Proxy — der blockiert Embedding-Endpunkte).
