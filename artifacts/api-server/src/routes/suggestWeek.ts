import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { recipesTable, recipeIngredientsTable, mealPlansTable } from "@workspace/db/schema";
import { and, gte, lte } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const suggestSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  days: z.number().int().min(1).max(14),
  mealTypes: z.array(z.enum(["lunch", "dinner"])).min(1),
  wishText: z.string().max(500).optional().default(""),
});

router.post("/meal-plans/suggest", async (req, res) => {
  try {
    const parsed = suggestSchema.parse(req.body);
    const { startDate, days, mealTypes, wishText } = parsed;

    const allRecipes = await db.select().from(recipesTable).orderBy(recipesTable.id);
    if (allRecipes.length === 0) {
      res.status(400).json({ error: "no_recipes", message: "Keine Rezepte vorhanden" });
      return;
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days - 1);
    const endDateStr = endDate.toISOString().split("T")[0];

    const existingPlans = await db
      .select()
      .from(mealPlansTable)
      .where(
        and(
          gte(mealPlansTable.date, startDate),
          lte(mealPlansTable.date, endDateStr)
        )
      );

    const occupiedDates = new Set(existingPlans.map((p) => p.date));

    const recipeSummary = allRecipes.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      difficulty: r.difficulty,
      totalTime: r.totalTime,
      lastCooked: r.lastCooked,
      cookedCount: r.cookedCount ?? 0,
    }));

    const dateList: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dateList.push(d.toISOString().split("T")[0]);
    }

    const mealTypeLabel = mealTypes.includes("lunch") && mealTypes.includes("dinner")
      ? "Mittag- und Abendessen"
      : mealTypes.includes("lunch")
      ? "Mittagessen"
      : "Abendessen";

    const systemPrompt = `Du bist ein Kochplaner-Assistent für Lucia. Deine Aufgabe ist es, einen ausgewogenen Wochenplan aus Lucias eigener Rezeptsammlung zu erstellen.

Regeln:
- Verteile Rezepte abwechslungsreich (keine Wiederholungen, verschiedene Kategorien)
- Bevorzuge Rezepte, die seltener gekocht wurden (niedrigere cookedCount)
- Achte auf Ausgewogenheit zwischen Kategorien (z.B. nicht mehrmals hintereinander Fleisch)
- Berücksichtige besondere Wünsche des Nutzers
- Weise NUR Rezepte aus der angegebenen Liste zu (IDs müssen exakt stimmen)
- Tage, die bereits belegt sind, dürfen NICHT im Ergebnis erscheinen

Antworte AUSSCHLIESSLICH mit reinem JSON, ohne Markdown, ohne Backticks.`;

    const userPrompt = `Erstelle einen Wochenplan für die folgenden Tage: ${dateList.join(", ")}
Mahlzeiten: ${mealTypeLabel}
Bereits belegte Tage (NICHT zuweisen): ${occupiedDates.size > 0 ? Array.from(occupiedDates).join(", ") : "keine"}
${wishText ? `Besondere Wünsche: ${wishText}` : ""}

Verfügbare Rezepte:
${JSON.stringify(recipeSummary, null, 2)}

Gib für jeden FREIEN Tag genau ein Rezept zurück. Antworte mit diesem JSON:
{
  "suggestions": [
    { "date": "YYYY-MM-DD", "recipeId": 123, "recipeTitle": "Titel des Rezepts" }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";

    let suggestions: Array<{ date: string; recipeId: number; recipeTitle: string }>;
    try {
      const parsed = JSON.parse(raw);
      suggestions = parsed.suggestions;
    } catch {
      req.log.error({ raw }, "Failed to parse AI response as JSON");
      res.status(500).json({ error: "parse_error", message: "KI-Antwort konnte nicht verarbeitet werden" });
      return;
    }

    if (!Array.isArray(suggestions)) {
      res.status(500).json({ error: "invalid_response", message: "Ungültige KI-Antwort" });
      return;
    }

    const validRecipeIds = new Set(allRecipes.map((r) => r.id));
    const seenRecipeIds = new Set<number>();
    const seenDates = new Set<string>();

    const filteredSuggestions = suggestions.filter((s) => {
      if (!s.date || typeof s.recipeId !== "number") return false;
      if (!validRecipeIds.has(s.recipeId)) return false;
      if (occupiedDates.has(s.date)) return false;
      if (!dateList.includes(s.date)) return false;
      if (seenRecipeIds.has(s.recipeId)) return false;
      if (seenDates.has(s.date)) return false;
      seenRecipeIds.add(s.recipeId);
      seenDates.add(s.date);
      return true;
    });

    const enriched = filteredSuggestions.map((s) => {
      const recipe = allRecipes.find((r) => r.id === s.recipeId);
      return {
        date: s.date,
        recipeId: s.recipeId,
        recipeTitle: recipe?.title ?? s.recipeTitle,
        recipeCategory: recipe?.category ?? "",
        occupied: false,
      };
    });

    const occupiedEntries = Array.from(occupiedDates)
      .filter((d) => dateList.includes(d))
      .map((d) => {
        const plan = existingPlans.find((p) => p.date === d);
        const recipe = allRecipes.find((r) => r.id === plan?.recipeId);
        return {
          date: d,
          recipeId: plan?.recipeId ?? 0,
          recipeTitle: recipe?.title ?? "Unbekannt",
          recipeCategory: recipe?.category ?? "",
          occupied: true,
        };
      });

    res.json({
      suggestions: [...enriched, ...occupiedEntries].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "validation_error", issues: err.issues });
      return;
    }
    req.log.error({ err }, "Failed to suggest week");
    res.status(500).json({ error: "internal_error", message: "Fehler beim Generieren des Vorschlags" });
  }
});

export default router;
