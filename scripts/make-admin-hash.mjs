import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 210000;
const password = process.argv[2];

if (!password || password.length < 10 || password.length > 128) {
  console.error("Использование: node scripts/make-admin-hash.mjs 'пароль-минимум-10-символов'");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), ITERATIONS, 32, "sha256").toString("hex");

console.log(`pbkdf2$${ITERATIONS}$${salt}$${hash}`);
