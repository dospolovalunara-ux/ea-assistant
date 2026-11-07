import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

const globalForDb = globalThis as unknown as { __eaiPool?: Pool; __eaiDb?: DB };

function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан. Скопируйте .env.example в .env.");
  const pool = new Pool({ connectionString: url, max: 10 });
  globalForDb.__eaiPool = pool;
  return drizzle(pool, { schema });
}

/** Ленивое подключение: база открывается при первом обращении. */
export function getDb(): DB {
  if (!globalForDb.__eaiDb) globalForDb.__eaiDb = createDb();
  return globalForDb.__eaiDb;
}

export async function closeDb() {
  await globalForDb.__eaiPool?.end();
  globalForDb.__eaiPool = undefined;
  globalForDb.__eaiDb = undefined;
}

export { schema };
