"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Field, inputCls, cx } from "@/components/ui";
import { createInboxAction } from "@/server/actions/modules";

export function NewInboxItem() {
  const [kind, setKind] = useState<"text" | "file" | "link">("text");
  const tab = (k: typeof kind, label: string) => (
    <button type="button" onClick={() => setKind(k)} className={cx("h-8 rounded-lg px-3 text-sm", kind === k ? "bg-primary text-primary-fg" : "bg-surface-2 text-muted hover:text-text")}>
      {label}
    </button>
  );
  return (
    <ActionForm action={createInboxAction} submitLabel="Добавить во входящие">
      <div className="flex gap-2">{tab("text", "Текст / пересланное сообщение")}{tab("file", "Файл")}{tab("link", "Ссылка")}</div>
      <input type="hidden" name="kind" value={kind} />
      {kind === "text" && (
        <Field label="Текст" hint="Вставьте сообщение, письмо или заметку. Пример: «Встреча с банком во вторник в 15:00 в офисе, участвует Ерлан»">
          <textarea name="text" rows={6} maxLength={50000} className={`${inputCls} h-auto py-2`} />
        </Field>
      )}
      {kind === "file" && (
        <Field label="Файл" hint="PDF, JPG, PNG, DOCX, XLSX, TXT до 10 МБ. Голос и фото распознаются после согласования OCR/STT — пока разбор вручную.">
          <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.pptx,.txt" className="block text-sm" />
        </Field>
      )}
      {kind === "link" && (
        <Field label="Ссылка" hint="Только http:// или https://">
          <input name="url" type="url" className={inputCls} placeholder="https://" />
        </Field>
      )}
      <Field label="Откуда (необязательно)" hint="Например: WhatsApp от Ерлана, письмо партнёра">
        <input name="sourceNote" maxLength={300} className={inputCls} />
      </Field>
    </ActionForm>
  );
}
