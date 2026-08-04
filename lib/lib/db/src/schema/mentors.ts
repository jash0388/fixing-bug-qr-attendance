import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mentorsTable = pgTable("mentors", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMentorSchema = createInsertSchema(mentorsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMentor = z.infer<typeof insertMentorSchema>;
export type Mentor = typeof mentorsTable.$inferSelect;
