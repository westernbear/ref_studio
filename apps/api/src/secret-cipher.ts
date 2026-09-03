import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

// AES-256-GCM keyed from the server's existing introspection secret.
// Callers pass a distinct salt so ciphertexts from different settings
// tables stay non-interchangeable.
const deriveKey = (secretKey: string, salt: string) =>
  scryptSync(secretKey, salt, 32);

export const encryptSecret = (
  plaintext: string,
  secretKey: string,
  salt: string,
): string => {
  const key = deriveKey(secretKey, salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
};

export const decryptSecret = (
  ciphertext: string,
  secretKey: string,
  salt: string,
): string => {
  const [ivPart, tagPart, ctPart] = ciphertext.split(":");
  if (!ivPart || !tagPart || !ctPart) throw new Error("INVALID_REQUEST");
  const key = deriveKey(secretKey, salt);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
};
