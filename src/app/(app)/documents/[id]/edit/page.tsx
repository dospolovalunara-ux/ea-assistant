import { requireActor } from "@/server/auth/current";
import { requirePermission } from "@/server/auth/rbac";
import { getDocument } from "@/server/services/documents";
import { orNotFound } from "@/server/page-guard";
import { updateDocumentAction } from "@/server/actions/modules";
import { ActionForm } from "@/components/action-form";
import { DocumentFields } from "@/components/document-fields";
import { Card, PageHeader } from "@/components/ui";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  await orNotFound(requirePermission(actor, "documents.write", { entityType: "family_document", entityId: id }));
  const d = await orNotFound(getDocument(actor, id));
  return (
    <>
      <PageHeader title="Изменить документ" subtitle={d.title} />
      <Card className="max-w-3xl p-6">
        <ActionForm action={updateDocumentAction.bind(null, d.id)} submitLabel="Сохранить">
          <DocumentFields d={{ title: d.title, categoryCode: d.categoryCode, ownerName: d.ownerName, docType: d.docType, issuer: d.issuer, issuedOn: d.issuedOn, expiresOn: d.expiresOn, numberMasked: d.numberMasked, confidentiality: d.confidentiality }} />
        </ActionForm>
      </Card>
    </>
  );
}
