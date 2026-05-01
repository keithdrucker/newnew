// @ts-expect-error dotenv@10 ships bundled types whose package.json exports field omits them; resolution fails under Node16/Bundler moduleResolution. Pinned version is intentional.
import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Resolve .env from the repo root regardless of cwd or bundling depth.
// Both lib/db/src/ and artifacts/api-server/dist/ are 3 levels below root.
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
