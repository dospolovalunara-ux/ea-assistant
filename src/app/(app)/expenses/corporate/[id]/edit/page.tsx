import { notFound } from "next/navigation";
import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { orNotFound } from "@/server/page-guard";
import { updateCorporateAction } from "@/server/actions/modules";
import { getCorporateExpense } from "@/server/services/corporate-expenses";
import { listEventsForPicker } from "@/server/services/calendar";
import { CorporateForm } from "@/components/expenses/corporate-form";
import { Card, PageHeader } from "@/components/ui";
import { fmt, toLocalInput } from "@/lib/time";

export default async function EditCorporatePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  await orNotFound(requirePermission(actor, "expenses.corporate.write", { entityType: "corporate_expense", entityId: id }));
  const e = await orNotFound(getCorporateExpense(actor, id));
  if (e.status !== "active") notFound();
  const tz = actor.timezone;
  const events = (await listEventsForPicker(actor, e.spentAt)).map((x) => ({ id: x.id, label: `${fmt(x.startsAt, "d MMM HH:mm", tz)} — ${x.title}` }));
  return (
    <>
      <PageHeader title="Изменить расход" subtitle={e.organization} />
      <Card className="max-w-3xl p-6">
        <CorporateForm
          action={updateCorporateAction.bind(null, e.id)}
          defaults={{ spentAt: toLocalInput(e.spentAt, tz), amount: e.amount, currency: e.currency, organization: e.organization, category: e.category, description: e.description ?? "", relatedEventId: e.relatedEventId ?? "", paymentMethod: e.paymentMethod, comment: e.comment ?? "" }}
          events={events}
          submitLabel="Сохранить"
          cancelHref={`/expenses/corporate/${e.id}`}
        />
      </Card>
    </>
  );
}
