declare module "node:crypto" {
  type CryptoBytes = Uint8Array & {
    toString(format: "hex" | "base64" | "base64url" | "utf8"): string;
  };
  export function createHash(name: string): {
    update(value: string | Uint8Array): { digest(format: "hex"): string };
    digest(format: "hex"): string;
  };
  export function randomBytes(size: number): CryptoBytes;
  export function scryptSync(
    password: string,
    salt: string,
    length: number,
  ): CryptoBytes;
  export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean;
  export function createCipheriv(
    algorithm: "aes-256-gcm",
    key: Uint8Array,
    iv: Uint8Array,
  ): {
    update(data: string, inputEncoding: "utf8"): CryptoBytes;
    final(): CryptoBytes;
    getAuthTag(): CryptoBytes;
  };
  export function createDecipheriv(
    algorithm: "aes-256-gcm",
    key: Uint8Array,
    iv: Uint8Array,
  ): {
    setAuthTag(tag: Uint8Array): void;
    update(data: Uint8Array): CryptoBytes;
    final(): CryptoBytes;
  };
}

declare const Buffer: {
  from(
    value: string | Uint8Array,
    encoding?: "hex" | "base64" | "base64url",
  ): Uint8Array & {
    toString(format: "hex" | "base64" | "base64url" | "utf8"): string;
  };
  alloc(size: number): Uint8Array;
  concat(values: readonly Uint8Array[]): Uint8Array & {
    toString(format: "hex" | "base64" | "base64url" | "utf8"): string;
  };
};
