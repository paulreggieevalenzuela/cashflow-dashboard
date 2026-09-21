import bcrypt from "bcryptjs";

// Cost factor for bcrypt's hashing rounds. 12 is a reasonable default for
// 2026 hardware — higher is slower to brute-force but also slower to log in.
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
