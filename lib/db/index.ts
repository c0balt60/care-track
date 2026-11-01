import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// One pooled client for the whole server process. DATABASE_URL comes from .env (see .env.example).
export const db = drizzle(process.env.DATABASE_URL!, { schema });
