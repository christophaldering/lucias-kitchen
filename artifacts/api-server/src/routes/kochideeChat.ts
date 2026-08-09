import { Router, type IRouter } from "express";
import { aiLimiter } from "../lib/rateLimits";
import { openai } from "@workspace/integrations-openai-ai-server";
import { z } from "zod/v4";
import { authMiddleware } from "./auth";

const router: IRouter = Router();

const BASE_SYSTEM_PROMPT = `Du bist Lucias persönlicher Küchen-Assistent. 
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

WICHTIG: Wenn keine pantryIngredients übergeben wurden (leeres Array), frage NICHT nach dem Vorratsschrank oder was Lucia zu Hause hat. Frage stattdessen direkt nach Wunsch, Zeitbudget und Geschmack – z.B. "Was möchtest du heute kochen? Hast du Lust auf etwas Bestimmtes?"

Antworte IMMER auf Deutsch. Sei warm und freundlich. Gib NUR reines JSON zurück, keine Markdown-Blöcke.`;

interface KochideeContext {
  pantry?: Array<{
    name: string;
    location: string;
    isDefault: boolean;
    urgency: "today" | "soon" | "good";
    expiryDate?: string | null;
  }>;
  recentlyCooked?: Array<{ title: string; date: string }>;
  weekPlan?: Array<{ title: string; date: string }>;
  frequentRecipes?: Array<{ title: string; category: string; cookedCount: number }>;
  topRatedRecipes?: Array<{ title: string; category: string; rating: string | null }>;
}

function buildSystemPrompt(
  context: KochideeContext | null | undefined,
  pantryIngredients: string[],
  forceComplete: boolean,
  surpriseMode: boolean
): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (context) {
    const sections: string[] = [];

    if (context.frequentRecipes && context.frequentRecipes.length > 0) {
      const list = context.frequentRecipes.map((r) => `"${r.title}" (${r.cookedCount}x)`).join(", ");
      sections.push(`MUSTER – Gerichte, die Lucia häufig kocht: ${list}`);
    }

    if (context.topRatedRecipes && context.topRatedRecipes.length > 0) {
      const list = context.topRatedRecipes.map((r) => `"${r.title}"`).join(", ");
      sections.push(`VORLIEBEN – Lucias am höchsten bewertete Rezepte: ${list}`);
    }

    if (context.recentlyCooked && context.recentlyCooked.length > 0) {
      const list = context.recentlyCooked.map((r) => `"${r.title}" (${r.date})`).join(", ");
      sections.push(`KÜRZLICH GEGESSEN (letzte 14 Tage, möglichst vermeiden): ${list}`);
    }

    if (context.weekPlan && context.weekPlan.length > 0) {
      const list = context.weekPlan.map((r) => `"${r.title}" (${r.date})`).join(", ");
      sections.push(`DIESE WOCHE IM WOCHENPLAN (unbedingt vermeiden, außer Lucia fragt explizit): ${list}`);
    }

    if (context.pantry && context.pantry.length > 0) {
      const urgent = context.pantry.filter((i) => i.urgency === "today");
      const soon = context.pantry.filter((i) => i.urgency === "soon");
      const good = context.pantry.filter((i) => i.urgency === "good" && !i.isDefault);
      const defaults = context.pantry.filter((i) => i.isDefault);

      const pantryLines: string[] = [];
      if (urgent.length > 0) {
        pantryLines.push(`DRINGEND (muss heute weg): ${urgent.map((i) => i.name).join(", ")}`);
      }
      if (soon.length > 0) {
        pantryLines.push(`BALD ABLAUFEND (diese Woche verwenden): ${soon.map((i) => i.name).join(", ")}`);
      }
      const fridgeItems = good.filter((i) => i.location === "fridge").map((i) => i.name);
      const freezerItems = good.filter((i) => i.location === "freezer").map((i) => i.name);
      const pantryItems = good.filter((i) => i.location === "pantry").map((i) => i.name);
      if (fridgeItems.length > 0) pantryLines.push(`Kühlschrank: ${fridgeItems.join(", ")}`);
      if (freezerItems.length > 0) pantryLines.push(`Gefrierschrank: ${freezerItems.join(", ")}`);
      if (pantryItems.length > 0) pantryLines.push(`Speisekammer: ${pantryItems.join(", ")}`);
      if (defaults.length > 0) pantryLines.push(`Standard-Vorrat (immer vorhanden): ${defaults.map((i) => i.name).join(", ")}`);

      if (pantryLines.length > 0) {
        sections.push(`LUCIAS VORRAT:\n${pantryLines.join("\n")}`);
      }
    } else if (pantryIngredients.length > 0) {
      sections.push(`Lucias Standard-Vorratskammer (immer vorhanden, nicht nachfragen): ${pantryIngredients.join(", ")}`);
    }

    if (sections.length > 0) {
      prompt += `\n\n--- LUCIAS PERSÖNLICHER KONTEXT ---\n${sections.join("\n\n")}`;
    }
  } else if (pantryIngredients.length > 0) {
    prompt += `\n\nLucias Standard-Vorratskammer (immer vorhanden, nicht nachfragen): ${pantryIngredients.join(", ")}.`;
  }

  if (surpriseMode) {
    prompt += `\n\nÜBERRASCHUNGS-MODUS: Lucia möchte heute etwas Neues ausprobieren! Schlage bewusst etwas vor, das AUSSERHALB ihrer üblichen Muster liegt – also kein Gericht aus ihren Häufig-Gekochten oder Top-Bewerteten. Sei mutig und kreativ! Starte direkt mit einem konkreten, aufregenden Vorschlag, der zu ihrem Vorrat passt, und frage dann nach Feedback.`;
  }

  if (forceComplete) {
    prompt += `\n\nDas war die letzte Runde. Gib jetzt SOFORT ein vollständiges finalProfile zurück mit isComplete: true. Fasse alle bisher genannten Zutaten und Präferenzen zusammen.`;
  }

  return prompt;
}

router.post("/kochidee-chat", authMiddleware, aiLimiter, async (req, res) => {
  try {
    const schema = z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })),
      pantryIngredients: z.array(z.string()).optional().default([]),
      forceComplete: z.boolean().optional().default(false),
      surpriseMode: z.boolean().optional().default(false),
      context: z.object({
        pantry: z.array(z.object({
          name: z.string(),
          location: z.string(),
          isDefault: z.boolean(),
          urgency: z.enum(["today", "soon", "good"]),
          expiryDate: z.string().nullable().optional(),
        })).optional(),
        recentlyCooked: z.array(z.object({
          title: z.string(),
          date: z.string(),
        })).optional(),
        weekPlan: z.array(z.object({
          title: z.string(),
          date: z.string(),
        })).optional(),
        frequentRecipes: z.array(z.object({
          title: z.string(),
          category: z.string(),
          cookedCount: z.number(),
        })).optional(),
        topRatedRecipes: z.array(z.object({
          title: z.string(),
          category: z.string(),
          rating: z.string().nullable().optional(),
        })).optional(),
      }).nullable().optional(),
    });

    const { messages, pantryIngredients, forceComplete, surpriseMode, context } = schema.parse(req.body);

    const systemPrompt = buildSystemPrompt(context, pantryIngredients, forceComplete, surpriseMode);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
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
