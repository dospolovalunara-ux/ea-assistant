import "dotenv/config";
import { afterAll } from "vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.TZ = "UTC"; // тесты не должны зависеть от пояса машины

afterAll(async () => {
  const { closeDb } = await import("@/server/db");
  await closeDb();
});
