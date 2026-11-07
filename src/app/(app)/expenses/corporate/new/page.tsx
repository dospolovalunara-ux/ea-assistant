import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { orNotFound } from "@/server/page-guard";
import { createCorporateAction } from "@/server/actions/modules";
import { listEventsForPicker } from "@/server/services/calendar";
import { getInboxItem } from "@/server/services/inbox";
import type { ExtractedField } from "@/server/integrations/ai";
import { CorporateForm } from "@/components/expenses/corporate-form";
import { Card, PageHeader } from "@/components/ui";
import { fmt, parseLocalDateTime, toLocalInput } from "@/lib/time";
import { parseAmount } from "@/lib/money";

export const metadata = { title: "Новый расход" };

export default async function NewCorporatePage({ searchParams }: { searchParams: Promise<{ event?: string; inbox?: string; ext?: string }> }) {
  const actor = await requireActor();
  await orNotFound(requirePermission(actor, "expenses.corporate.write", { entityType: "corporate_expense" }));
  const sp = await searchParams;
  const tz = actor.timezone;
  const events = (await listEventsForPicker(actor, new Date())).map((e) => ({ id: e.id, label: `${fmt(e.startsAt, "d MMM HH:mm", tz)} — ${e.title}` }));
  const defaults: Record<string, string> = { spentAt: toLocalInput(new Date(), tz), relatedEventId: sp.event && events.some((e) => e.id === sp.event) ? sp.event : "" };
  const hidden: Record<string, string> = {};
  if (sp.inbox) {
    const item = await orNotFound(getInboxItem(actor, sp.inbox));
    hidden.inboxItemId = item.id;
    const ext = item.extractions.find((e) => e.id === sp.ext && e.status === "proposed");
    if (ext) {
      hidden.extractionId = ext.id;
      const f = ext.fields as Record<string, ExtractedField>;
      if (f.amount && parseAmount(f.amount.value)) defaults.amount = f.amount.value;
      if (f.organization) defaults.organization = f.organization.value;
      if (f.description) defaults.description = f.description.value;
      if (f.spent_at && parseLocalDateTime(f.spent_at.value, tz)) defaults.spentAt = f.spent_at.value.length === 10 ? `${f.spent_at.value}T12:00` : f.spent_at.value;
    }
    defaults.comment = item.sourceNote ? `Из входящих: ${item.sourceNote}` : "Из входящих";
  }
  return (
    <>
      <PageHeader title="Новый корпоративный расход" subtitle={sp.inbox ? "Поля предложены по входящему материалу — проверьте перед сохранением" : undefined} />
      <Card className="max-w-3xl p-6">
        <CorporateForm action={createCorporateAction} defaults={defaults} events={events} withFile hidden={hidden} submitLabel="Сохранить расход" cancelHref="/expenses/corporate" />
      </Card>
    </>
  );
}
