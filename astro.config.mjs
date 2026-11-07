// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://cruxopen.com",
  trailingSlash: "ignore",
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
