import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM для OAuth-токенов и секретов MFA.
 * Ключ — APP_ENCRYPTION_KEY (32 байта в base64). Для ротации старый ключ
 * кладётся в APP_ENCRYPTION_KEY_PREVIOUS: расшифровка пробует оба, шифрование — только новый.
 */
function loadKey(name: string): Buffer | null {
  const v = process.env[name];
  if (!v) return null;
  const k = Buffer.from(v, "base64");
  if (k.length !== 32) throw new Error(`${name} должен быть 32 байта в base64`);
  return k;
}

const keyId = (k: Buffer) => createHash("sha256").update(k).digest("hex").slice(0, 8);

export function encryptionConfigured(): boolean {
  return Boolean(process.env.APP_ENCRYPTION_KEY);
}

export function encryptSecret(plain: string): string {
  const key = loadKey("APP_ENCRYPTION_KEY");
  if (!key) throw new Error("APP_ENCRYPTION_KEY не задан — шифрование секретов недоступно");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", keyId(key), iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [v, kid, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !kid || !iv || !tag || !data) throw new Error("Неверный формат зашифрованного значения");
  const keys = [loadKey("APP_ENCRYPTION_KEY"), loadKey("APP_ENCRYPTION_KEY_PREVIOUS")].filter(Boolean) as Buffer[];
  const key = keys.find((k) => keyId(k) === kid);
  if (!key) throw new Error("Ключ шифрования для этого значения не найден");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** Подпись для короткоживущих ссылок на файлы. */
function signingKey(): Buffer {
  const k = process.env.FILE_SIGNING_KEY || process.env.APP_ENCRYPTION_KEY;
  if (!k) throw new Error("FILE_SIGNING_KEY не задан");
  return Buffer.from(k);
}

export function signPayload(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function verifySignature(payload: string, sig: string): boolean {
  const expected = Buffer.from(signPayload(payload));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
