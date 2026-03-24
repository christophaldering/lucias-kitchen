import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedUser() {
  const email = "lucia.aldering@googlemail.com";
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (existing) {
    return;
  }

  const passwordHash = await bcrypt.hash("#weltbestekoechin2026", 12);

  await db.insert(usersTable).values({
    displayName: "Lucia",
    email,
    passwordHash,
    bio: "Ich koche mit Herz und Seele – am liebsten für meine Familie und Freunde.",
    cookingLevel: "Hobbyköchin",
    favoriteCategories: ["Pasta", "Fisch"],
    dietaryPreference: "Alles",
    onboardingCompleted: false,
  });
}
