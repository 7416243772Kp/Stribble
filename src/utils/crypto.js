//C:\Ebook\src\utils\crypto.js
import crypto from "crypto";

const ENC_PREFIX = "enc:";
const IV_LENGTH = 12; // recommended for GCM

if (!process.env.APP_ENCRYPTION_KEY) {
  console.warn("Warning: APP_ENCRYPTION_KEY not set. Secrets will NOT be encrypted.");
}

function getKey() {
  const pass = process.env.APP_ENCRYPTION_KEY || "";
  return crypto.createHash("sha256").update(pass, "utf8").digest();
}

export function encrypt(plainText) {
  if (!plainText) return plainText;
  if (!process.env.APP_ENCRYPTION_KEY) return plainText;
  if (isEncrypted(plainText)) return plainText;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const store = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return ENC_PREFIX + store;
}

export function decrypt(storedValue) {
  if (!storedValue) return storedValue;
  if (!process.env.APP_ENCRYPTION_KEY) return storedValue;
  if (typeof storedValue !== "string") return storedValue;
  if (!storedValue.startsWith(ENC_PREFIX)) return storedValue;

  const base64 = storedValue.slice(ENC_PREFIX.length);
  const buf = Buffer.from(base64, "base64");
  const iv = buf.slice(0, IV_LENGTH);
  const tag = buf.slice(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.slice(IV_LENGTH + 16);
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

export function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}
