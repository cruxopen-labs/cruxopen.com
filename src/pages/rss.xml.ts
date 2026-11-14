import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { postsFor, postUrl } from "../data/blog";

// One feed for both languages, newest first.
export async function GET(context: APIContext) {
  const posts = [...(await postsFor("en")), ...(await postsFor("zh"))].sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
  return rss({
    title: "CruxOpen blog",
    description: "Open hardware, verified bit for bit: engineering notes from openTARS, openISP and openDARS.",
    site: context.site!,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: postUrl(p),
      categories: p.data.tags,
    })),
  });
}
