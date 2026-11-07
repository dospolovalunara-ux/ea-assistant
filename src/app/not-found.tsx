import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-muted">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Запись не найдена</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">Страница не существует или у вас нет к ней доступа.</p>
      <Link href="/" className="mt-6 text-sm font-medium text-primary hover:underline">
        На главную
      </Link>
    </main>
  );
}
