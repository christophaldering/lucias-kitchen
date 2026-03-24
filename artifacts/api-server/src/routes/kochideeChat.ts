import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

const SYSTEM_PROMPT = `Du bist Lucias persönlicher Küchen-Assistent. 
Deine Aufgabe ist es, durch ein kurzes, freundliches Gespräch herauszufinden, was Lucia heute kochen möchte.

ABLAUF:
1. Wenn Lucia schreibt was sie zuhause hat: Extrahiere die Zutaten, wähle sie aus, und stelle dann 2-3 gezielte Rückfragen.
2. Frage nach: fehlenden wichtigen Zutaten ("Hast du Knoblauch oder Zitrone?"), Zeitbudget, Geschmack (leicht/herzhaft).
3. Nach maximal 3 Gesprächsrunden: Gib das vollständige Profil zurück.

ANTWORT-FORMAT (immer JSON):
{
  "message": "Deine freundliche Nachricht an Lucia",
  "extractedIngredients": ["Zutat1", "Zutat2"],
  "suggestedChips": ["Ja, habe ich", "Nein", "< 30 Min", "< 1 Std", "leicht", "herzhaft"],
  "isComplete": false,
  "finalProfile": null
}

Wenn das Profil vollständig ist (nach 2-3 Runden):
{
  "message": "Super! Lass mich passende Rezepte für dich suchen...",
  "extractedIngredients": ["alle", "gesammelten", "Zutaten"],
  "suggestedChips": [],
  "isComplete": true,
  "finalProfile": {
    "ingredients": ["alle Zutaten"],
    "moods": ["schnell"],
    "exclusions": []
  }
}

Antworte IMMER auf Deutsch. Sei warm und freundlich. Gib NUR reines JSON zurück, keine Markdown-Blöcke.`;

router.post("/kochidee-chat", authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
      pantryIngredients: z.array(z.string()).optional().default([]),
      forceComplete: z.boolean().optional().default(false),
    });

    const { messages, pantryIngredients, forceComplete } = schema.parse(req.body);

    const forceCompleteInstruction = forceComplete
      ? "\n\nDas war die letzte Runde. Gib jetzt SOFORT ein vollständiges finalProfile zurück mit isComplete: true. Fasse alle bisher genannten Zutaten und Präferenzen zusammen."
      : "";

    const systemWithContext = (pantryIngredients.length > 0
      ? SYSTEM_PROMPT + `\n\nLucias Standard-Vorratskammer (immer vorhanden, nicht nachfragen): ${pantryIngredients.join(", ")}.`
      : SYSTEM_PROMPT) + forceCompleteInstruction;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: systemWithContext },
        ...messages,
      ],
    });

    let rawJson = response.choices[0]?.message?.content ?? "";
    rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: {
      message: string;
      extractedIngredients: string[];
      suggestedChips: string[];
      isComplete: boolean;
      finalProfile: { ingredients: string[]; moods: string[]; exclusions: string[] } | null;
    };

    try {
      parsed = JSON.parse(rawJson);
    } catch {
      req.log.error({ rawJson }, "Failed to parse chat AI response");
      res.status(502).json({ error: "parse_error", message: "KI-Antwort konnte nicht verarbeitet werden" });
      return;
    }

    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "Failed to process kochidee chat");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
