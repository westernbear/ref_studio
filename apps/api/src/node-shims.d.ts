declare module "node:crypto" {
  export function createHash(name: string): { update(value: string | Uint8Array): { digest(format: "hex"): string }; digest(format: "hex"): string }
  export function randomBytes(size: number): { toString(format: "hex" | "base64url"): string }
  export function scryptSync(password: string, salt: string, length: number): { toString(format: "hex"): string }
  export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean
}

declare const Buffer: { from(value: string | Uint8Array): Uint8Array; alloc(size: number): Uint8Array; concat(values: readonly Uint8Array[]): Uint8Array }
