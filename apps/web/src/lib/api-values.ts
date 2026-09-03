export const field = (value: unknown, key: string): unknown =>
  value !== null && typeof value === "object" ? Reflect.get(value, key) : "";
export const text = (value: unknown, fallback = "Not set"): string =>
  typeof value === "number"
    ? String(value)
    : typeof value === "string" && value.length > 0
      ? value
      : fallback;
export const numberValue = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
