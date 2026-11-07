import "dotenv/config";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL не задан — тесты запускаются только на отдельной тестовой базе");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL совпадает с DATABASE_URL — отказ, база будет очищена");
}
