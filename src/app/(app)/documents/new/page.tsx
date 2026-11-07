import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { orNotFound } from "@/server/page-guard";
import { createDocumentAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { DocumentFields } from "@/components/document-fields";
import { Alert, Card, Field, PageHeader } from "@/components/ui";

export const metadata = { title: "Новый документ" };

export default async function NewDocumentPage() {
  const actor = await requireActor();
  await orNotFound(requirePermission(actor, "documents.write", { entityType: "family_document" }));
  return (
    <>
      <PageHeader title="Новый документ" />
      <div className="mb-4 max-w-3xl"><Alert tone="warn">До согласования с ИБ загружайте только вымышленные демо-документы.</Alert></div>
      <Card className="max-w-3xl p-6">
        <ActionForm action={createDocumentAction} submitLabel="Сохранить">
          <DocumentFields />
          <Field label="Файл (необязательно)" hint="PDF, JPG, PNG до 10 МБ. Хранится в приватном хранилище, выдаётся по ссылке на 5 минут."><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" className="block text-sm" /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
