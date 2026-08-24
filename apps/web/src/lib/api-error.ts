export const errorCode = (value: unknown): string => {
  if (!value || typeof value !== "object") return "";
  const error = Reflect.get(value, "error");
  if (!error || typeof error !== "object") return "";
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : "";
};
