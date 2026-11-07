import "dotenv/config";
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Переменная окружения ${name} не задана. См. .env.example`);
    process.exit(1);
  }
  return v;
}
