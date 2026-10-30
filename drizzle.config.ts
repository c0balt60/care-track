import { defineConfig } from "drizzle-kit";
 
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migrations need a direct connection, so prefer Neon's unpooled URL when it's set.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
  strict: true,
});
 