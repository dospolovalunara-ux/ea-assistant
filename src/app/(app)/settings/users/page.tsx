import { requireActor } from "@/server/auth/current";
import { listRoles, listUsers } from "@/server/services/users";
import { orNotFound } from "@/server/page-guard";
import { createUserAction, updateUserAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, CardHeader, Field, PageHeader, inputCls } from "@/components/ui";
import { fmt } from "@/lib/time";

export const metadata = { title: "Пользователи" };

export default async function UsersPage() {
  const actor = await requireActor();
  const [users, roles] = await orNotFound(Promise.all([listUsers(actor), listRoles(actor)]));
  return (
    <>
      <PageHeader title="Пользователи" subtitle="Роль сама по себе не даёт технику доступа к календарю, задачам, финансам и документам" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="min-w-0">
          <ul className="divide-y divide-border">
            {users.map((u) => (
              <li key={u.id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="font-medium">{u.fullName}</span> <span className="text-sm text-muted">{u.email}</span></span>
                  <span className="flex gap-1.5">
                    <Badge>{u.roleName}</Badge>
                    {u.mfaEnabled && <Badge tone="ok">MFA</Badge>}
                    {!u.isActive && <Badge tone="danger">Отключён</Badge>}
                  </span>
                </div>
                <p className="text-xs text-muted">Последний вход: {u.lastLoginAt ? fmt(u.lastLoginAt, "d MMM yyyy, HH:mm", actor.timezone) : "—"}</p>
                {u.id !== actor.id && (
                  <div className="flex flex-wrap items-end gap-3">
                    <ActionForm action={updateUserAction.bind(null, u.id)} submitLabel="Сменить роль" variant="secondary" className="flex items-end gap-2 space-y-0">
                      <input type="hidden" name="op" value="role" />
                      <select name="role" defaultValue={u.roleCode} className={`${inputCls} h-9 w-48`}>{roles.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}</select>
                    </ActionForm>
                    <ActionForm action={updateUserAction.bind(null, u.id)} submitLabel="Задать пароль" variant="secondary" className="flex items-end gap-2 space-y-0">
                      <input type="hidden" name="op" value="password" />
                      <input name="password" type="password" autoComplete="new-password" placeholder="Новый пароль (12+)" className={`${inputCls} h-9 w-48`} />
                    </ActionForm>
                    <ActionForm action={updateUserAction.bind(null, u.id)} submitLabel={u.isActive ? "Отключить" : "Включить"} variant={u.isActive ? "danger" : "secondary"} confirmText={u.isActive ? "Отключить пользователя? Его сессии завершатся." : undefined}>
                      <input type="hidden" name="op" value={u.isActive ? "deactivate" : "activate"} />
                    </ActionForm>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="self-start">
          <CardHeader title="Новый пользователь" />
          <div className="p-5">
            <ActionForm action={createUserAction} submitLabel="Создать" resetOnSuccess successText="Пользователь создан">
              <Field label="Имя"><input name="fullName" className={inputCls} /></Field>
              <Field label="Email"><input name="email" type="email" className={inputCls} /></Field>
              <Field label="Роль"><select name="role" className={inputCls}>{roles.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}</select></Field>
              <Field label="Временный пароль" hint="Не короче 12 символов, буквы и цифры. Передайте пользователю лично."><input name="password" type="password" autoComplete="new-password" className={inputCls} /></Field>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
