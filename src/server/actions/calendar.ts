"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "../auth/current";
import { cancelEvent, createEvent, updateEvent } from "../services/calendar";
import { formToObject, toActionState } from "./result";
import type { ActionState } from "@/lib/action-state";

export async function createEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  let id: string;
  try {
    ({ id } = await createEvent(actor, values, { confirmOverlap: fd.get("confirmOverlap") === "1" }));
  } catch (e) {
    return toActionState(e, values);
  }
  revalidatePath("/", "layout");
  redirect(`/calendar/${id}`);
}

export async function updateEventAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  try {
    await updateEvent(actor, id, values, { confirmOverlap: fd.get("confirmOverlap") === "1" });
  } catch (e) {
    return toActionState(e, values);
  }
  revalidatePath("/", "layout");
  redirect(`/calendar/${id}`);
}

export async function cancelEventAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await cancelEvent(actor, id, String(fd.get("reason") ?? ""));
  } catch (e) {
    return toActionState(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
