import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import path from "path";
import { fileURLToPath } from "url";

// lib/db/ is 2 levels below the repo root
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
