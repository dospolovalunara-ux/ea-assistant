"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "../auth/current";
import { addTaskComment, changeTaskStatus, createTask, updateTask } from "../services/tasks";
import { formToObject, toActionState } from "./result";
import type { ActionState } from "@/lib/action-state";

export async function createTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  let id: string;
  try {
    ({ id } = await createTask(actor, values));
  } catch (e) {
    return toActionState(e, values);
  }
  revalidatePath("/", "layout");
  redirect(`/tasks/${id}`);
}

export async function updateTaskAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  try {
    await updateTask(actor, id, values);
  } catch (e) {
    return toActionState(e, values);
  }
  revalidatePath("/", "layout");
  redirect(`/tasks/${id}`);
}

export async function changeTaskStatusAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await changeTaskStatus(actor, id, String(fd.get("status") ?? ""));
  } catch (e) {
    return toActionState(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addCommentAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await addTaskComment(actor, id, String(fd.get("body") ?? ""));
  } catch (e) {
    return toActionState(e, { body: String(fd.get("body") ?? "") });
  }
  revalidatePath(`/tasks/${id}`);
  return { ok: true };
}
