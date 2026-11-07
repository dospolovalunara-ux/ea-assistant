import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Подтверждение входа" };

export default async function MfaPage() {
  if (!(await cookies()).get("eai_mfa")) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-xl font-semibold">Подтверждение входа</h1>
        <p className="mb-6 text-center text-sm text-muted">Введите 6-значный код из приложения-аутентификатора</p>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <MfaForm />
        </div>
      </div>
    </main>
  );
}
