/**
 * Деньги — только строками с двумя знаками ("4500.00") и целыми тиын/копейками.
 * Никаких float: суммы складывает база (numeric) или эти функции на bigint.
 */
export function parseAmount(input: string): string | null {
  const s = input.replace(/[\s ]/g, "").replace(/(тг|₸|kzt|тенге)$/i, "").replace(",", ".");
  if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  return `${int}.${frac.padEnd(2, "0")}`;
}

export function toMinor(amount: string): bigint {
  const neg = amount.startsWith("-");
  const [i, f = "00"] = amount.replace("-", "").split(".");
  const v = BigInt(i!) * 100n + BigInt(f.padEnd(2, "0").slice(0, 2));
  return neg ? -v : v;
}

export function fromMinor(v: bigint): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
}

export function formatMoney(amount: string | null | undefined, currency = "KZT"): string {
  if (amount === null || amount === undefined) return "—";
  const [i, f] = amount.split(".");
  const neg = i!.startsWith("-");
  const digits = i!.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sym = currency === "KZT" ? "₸" : currency;
  return `${neg ? "−" : ""}${digits}${f && f !== "00" ? "," + f : ""} ${sym}`;
}

/**
 * Разбор строки вида «обед 4500, кофе 1200» в список операций.
 * Детерминированно, без AI; каждую операцию пользователь подтверждает.
 */
export function parseExpenseText(text: string): { items: { description: string; amount: string }[]; errors: string[] } {
  const items: { description: string; amount: string }[] = [];
  const errors: string[] = [];
  for (const part of text.split(/[,;\n]+/)) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(.*?)[\s:–-]*(\d[\d\s ]*(?:[.,]\d{1,2})?)\s*(тг|₸|тенге|kzt)?\.?$/i.exec(p);
    const amount = m ? parseAmount(m[2]!) : null;
    const description = m?.[1]?.trim().replace(/[:–-]+$/, "").trim();
    if (!m || !amount || !description || toMinor(amount) <= 0n) errors.push(`Не удалось разобрать: «${p}»`);
    else items.push({ description: description.slice(0, 200), amount });
  }
  return { items, errors };
}
