import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en-US", "ko-KR"],
  defaultLocale: "en-US",
});
