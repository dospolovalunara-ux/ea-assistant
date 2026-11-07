import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/current";
import { LoginForm } from "./login-form";

export const metadata = { title: "Вход" };

export default async function LoginPage() {
  if (await getActor()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-fg">E</div>
          <h1 className="text-xl font-semibold tracking-tight">EXECUTIVE AI</h1>
          <p className="mt-1 text-sm text-muted">Цифровой офис помощника руководителя</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Демо-версия. Используются только вымышленные данные.
        </p>
      </div>
    </main>
  );
}
