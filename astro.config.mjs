// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { unified } from "@astrojs/markdown-remark";
import rehypeWrapTables from "./src/rehype-wrap-tables.mjs";

export default defineConfig({
  site: "https://cruxopen.com",
  trailingSlash: "ignore",
  // Put the CSS inside each page, so a slow /_astro request can never
  // leave visitors looking at an unstyled white page.
  build: { inlineStylesheets: "always" },
  markdown: {
    processor: unified({ rehypePlugins: [rehypeWrapTables] }),
    shikiConfig: { theme: "github-light" },
  },
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
