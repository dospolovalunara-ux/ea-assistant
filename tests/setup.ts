import "dotenv/config";
import { afterAll } from "vitest";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.TZ = "UTC"; // тесты не должны зависеть от пояса машины
process.env.FILE_STORAGE_DIR = path.join(os.tmpdir(), "eai-test-storage");
process.env.FILE_SIGNING_KEY ||= "test-signing-key";

afterAll(async () => {
  const { closeDb } = await import("@/server/db");
  await closeDb();
});
