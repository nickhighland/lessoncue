import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "The legacy prototype database binding is unavailable. The production LessonCue application uses the local ASP.NET Core server and SQLite."
    );
  }

  return drizzle(env.DB, { schema });
}
