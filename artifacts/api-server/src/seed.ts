import { logger } from "./lib/logger.js";
import { supabase } from "./lib/supabase.js";
import { readFileSync } from "fs";
import { resolve } from "path";

export async function seed() {
  logger.info("Seeding Supabase with student data");
  // Load local JSON data file
  const dataPath = resolve(import.meta.url.replace("file://", ""), "../students-data.json");
  const raw = readFileSync(dataPath, "utf-8");
  const students = JSON.parse(raw);
  const inserts = students.map((s: any) => ({
    unique_id: s.uniqueId,
    name: s.name,
    role: "student",
  }));
  const { error } = await supabase.from("qr_users").insert(inserts);
  if (error) {
    logger.error({ error }, "Seeding error");
    throw error;
  }
  logger.info(`Inserted ${inserts.length} students`);
}
