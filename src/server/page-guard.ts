import "server-only";
import { notFound } from "next/navigation";
import { NotFoundError } from "./errors";

/** На страницах ошибка «не найдено» из сервисов превращается в 404. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
