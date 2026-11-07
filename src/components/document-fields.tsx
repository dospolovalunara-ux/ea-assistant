import { Field, inputCls } from "./ui";
import { DOCUMENT_CATEGORIES } from "@/server/services/documents";

export function DocumentFields({ d = {} }: { d?: Record<string, string | null> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Название" className="md:col-span-2"><input name="title" defaultValue={d.title ?? ""} maxLength={200} className={inputCls} /></Field>
      <Field label="Категория"><select name="categoryCode" defaultValue={d.categoryCode ?? "executive"} className={inputCls}>{DOCUMENT_CATEGORIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></Field>
      <Field label="Владелец" hint="Член семьи, которому принадлежит документ"><input name="ownerName" defaultValue={d.ownerName ?? ""} maxLength={200} className={inputCls} /></Field>
      <Field label="Тип документа" hint="Например: паспорт, полис, свидетельство"><input name="docType" defaultValue={d.docType ?? ""} maxLength={100} className={inputCls} /></Field>
      <Field label="Орган выдачи" hint="Если разрешено хранить"><input name="issuer" defaultValue={d.issuer ?? ""} maxLength={200} className={inputCls} /></Field>
      <Field label="Дата выдачи"><input type="date" name="issuedOn" defaultValue={d.issuedOn ?? ""} className={inputCls} /></Field>
      <Field label="Срок действия"><input type="date" name="expiresOn" defaultValue={d.expiresOn ?? ""} className={inputCls} /></Field>
      <Field label="Номер" hint={d.numberMasked ? `Сейчас: ${d.numberMasked}. Хранятся только последние 4 символа.` : "Хранятся только последние 4 символа"}><input name="number" autoComplete="off" maxLength={40} className={inputCls} /></Field>
      <Field label="Конфиденциальность"><select name="confidentiality" defaultValue={d.confidentiality ?? "normal"} className={inputCls}><option value="normal">Обычная</option><option value="high">Высокая — только по точечному доступу</option></select></Field>
    </div>
  );
}
