import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Хеш-заглушка: сравнение с ним занимает столько же времени, сколько с настоящим.
// Нужен, чтобы по времени ответа нельзя было понять, существует ли email.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_COST);
export function dummyVerify(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, DUMMY_HASH);
}
