// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://cruxopen.com",
  trailingSlash: "ignore",
  // Put the CSS inside each page, so a slow /_astro request can never
  // leave visitors looking at an unstyled white page.
  build: { inlineStylesheets: "always" },
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
