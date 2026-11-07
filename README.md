# cruxopen.com

The CruxOpen website: one page in English (`/`) and Chinese (`/zh/`), built with
Astro and Tailwind CSS, deployed as static files on Cloudflare Pages.

## Develop

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # type-check, then build to dist/
npm run preview   # serve dist/
```

Node 22 or newer.

## Where things live

| Path | What |
|---|---|
| `src/data/site.ts` | links and every measured number, each with the README it came from |
| `src/i18n/strings.ts` | all page copy, English and Chinese side by side |
| `src/components/` | one component per section: Hero, Projects, Method, Notes, Collaborate |
| `public/media/` | the openTARS demo GIF (copied from `openTARS/demo/`) |
| `public/og.png` | 1200×630 image shown when the link is shared |
| `public/_headers` | security and cache headers for Cloudflare Pages |

**Numbers rule:** a figure goes into `site.ts` only if it is in a repository
README, and its `src` says which one. When a README changes, update `site.ts`.

Fonts are bundled from `@fontsource` rather than loaded from Google Fonts, so
the page renders the same in mainland China.

## Deploy on Cloudflare Pages

1. Push this folder to `github.com/cruxopen-labs/cruxopen.com` (or any repo name).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git →
   pick the repo.
3. Build settings:
   - Framework preset: Astro
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
4. After the first deploy: the project → Custom domains → add `cruxopen.com`
   and `www.cruxopen.com`. With the domain's DNS on Cloudflare the records are
   created for you. Add a redirect rule from `www` to the apex.

Every push to `main` deploys; pull requests get preview URLs.

## Before going live

- [ ] `hello@cruxopen.com` works (Cloudflare → Email → Email Routing)
- [ ] Organization profile on GitHub links to https://cruxopen.com
- [ ] openISP README image links still point to the old `github.com/cruxopen/...`
      path; change them to relative paths (`images/isp_pipeline2.png`)
