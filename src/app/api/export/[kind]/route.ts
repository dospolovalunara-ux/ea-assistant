import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/current";
import { NotFoundError } from "@/server/errors";
import { getDb } from "@/server/db";
import { writeAudit } from "@/server/services/audit";
import { corporateRegister, dailyReport, personalRegister, weeklyReport } from "@/server/services/reports";
import { expenseFilesForPeriod } from "@/server/services/corporate-expenses";
import { getMeeting } from "@/server/services/protocols";
import { readStored } from "@/server/services/files";
import { MIME, toDocx, toPdf, toXlsx, type ReportDoc } from "@/server/exports/render";
import { addLocalDays, fmt, localDayStart, parseLocalDate } from "@/lib/time";
import { requirePermission } from "@/server/auth/rbac";

type Format = "xlsx" | "pdf" | "docx";

function range(sp: URLSearchParams, tz: string) {
  const from = (sp.get("from") && parseLocalDate(sp.get("from")!, tz)) || addLocalDays(localDayStart(new Date(), tz), -30, tz);
  const toDay = (sp.get("to") && parseLocalDate(sp.get("to")!, tz)) || localDayStart(new Date(), tz);
  return { from, to: addLocalDays(toDay, 1, tz) };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Не найдено", { status: 404 });
  const { kind } = await params;
  const sp = req.nextUrl.searchParams;
  const format = (["xlsx", "pdf", "docx", "zip"].includes(sp.get("format") ?? "") ? sp.get("format") : "pdf") as Format | "zip";
  const tz = actor.timezone;
  try {
    let doc: ReportDoc;
    let name: string;
    if (kind === "corporate") {
      await requirePermission(actor, "expenses.corporate.read", { entityType: "corporate_expense" });
      const r = range(sp, tz);
      doc = await corporateRegister(actor, r);
      name = `corporate-expenses-${fmt(r.from, "yyyy-MM-dd", tz)}`;
      if (format === "zip") {
        // Комплект для бухгалтерии: реестр + документы по каждому расходу
        const zip = new JSZip();
        zip.file("Реестр.xlsx", await toXlsx(doc));
        zip.file("Реестр.pdf", await toPdf(doc));
        for (const f of await expenseFilesForPeriod(actor, r)) {
          const folder = `${fmt(f.spentAt, "yyyy-MM-dd", tz)} ${f.organization}`.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
          zip.file(`${folder}/${f.docType}-${f.name}`, await readStored(f));
        }
        await writeAudit(getDb(), { userId: actor.id, action: "export.corporate_bundle", entityType: "report", ip: actor.ip, metadata: { from: r.from, to: r.to } });
        return new NextResponse(new Uint8Array(await zip.generateAsync({ type: "nodebuffer" })), {
          headers: { "Content-Type": MIME.zip, "Content-Disposition": `attachment; filename="${name}-bundle.zip"`, "Cache-Control": "no-store" },
        });
      }
    } else if (kind === "personal") {
      const r = range(sp, tz);
      doc = await personalRegister(actor, r, sp.get("by") === "month" ? "month" : "day");
      name = `personal-expenses-${fmt(r.from, "yyyy-MM-dd", tz)}`;
    } else if (kind === "weekly") {
      doc = await weeklyReport(actor);
      name = `weekly-${fmt(new Date(), "yyyy-MM-dd", tz)}`;
    } else if (kind === "daily") {
      doc = await dailyReport(actor);
      name = `daily-${fmt(new Date(), "yyyy-MM-dd", tz)}`;
    } else if (kind === "protocol") {
      const m = await getMeeting(actor, sp.get("meeting") ?? "");
      const c = m.content;
      const approved = m.protocol.status === "approved";
      doc = {
        title: `Протокол: ${m.meeting.title}`,
        subtitle: `${fmt(m.meeting.heldAt, "d MMMM yyyy, HH:mm", tz)}${m.meeting.location ? ` · ${m.meeting.location}` : ""} · версия ${m.protocol.currentVersion}${approved ? " · утверждён" : ""}`,
        watermark: approved ? undefined : "ЧЕРНОВИК",
        sections: [
          { kind: "text", heading: "Участники", lines: c.participants.length ? c.participants : ["—"] },
          { kind: "text", heading: "Повестка", lines: c.agenda.length ? c.agenda.map((a, i) => `${i + 1}. ${a}`) : ["—"] },
          { kind: "text", heading: "Краткое содержание", lines: [c.summary || "—"] },
          { kind: "text", heading: "Решения", lines: c.decisions.length ? c.decisions.map((d, i) => `${i + 1}. ${d.text}${d.needsReview ? " [требует проверки]" : ""}`) : ["—"] },
          { kind: "table", title: "Поручения", columns: ["№", "Поручение", "Ответственный", "Срок"], rows: c.actionItems.map((a, i) => [i + 1, a.title + (a.needsReview ? " [требует проверки]" : ""), a.assignee ?? "не указан", a.due ?? "не указан"]) },
          ...(c.questions.length ? [{ kind: "text" as const, heading: "Вопросы на уточнение", lines: c.questions }] : []),
        ],
      };
      name = `protocol-${fmt(m.meeting.heldAt, "yyyy-MM-dd", tz)}`;
    } else return new NextResponse("Не найдено", { status: 404 });

    const f: Format = format === "zip" ? "pdf" : format;
    const body = f === "xlsx" ? await toXlsx(doc) : f === "docx" ? await toDocx(doc) : await toPdf(doc);
    await writeAudit(getDb(), { userId: actor.id, action: `export.${kind}`, entityType: "report", ip: actor.ip, metadata: { format: f } });
    return new NextResponse(new Uint8Array(body), {
      headers: { "Content-Type": MIME[f], "Content-Disposition": `attachment; filename="${name}.${f}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return new NextResponse("Не найдено", { status: 404 });
    throw e;
  }
}
