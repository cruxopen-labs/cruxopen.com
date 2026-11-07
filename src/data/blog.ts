import { getCollection, type CollectionEntry } from "astro:content";
import type { Lang } from "../i18n/strings";

export type Post = CollectionEntry<"blog">;

/** "en/qwen35-kv260-bit-exact" -> { lang: "en", slug: "qwen35-kv260-bit-exact" } */
export const parseId = (id: string) => {
  const [lang, ...rest] = id.split("/");
  return { lang: lang as Lang, slug: rest.join("/") };
};

export const postUrl = (post: Post) => {
  const { lang, slug } = parseId(post.id);
  return lang === "zh" ? `/zh/blog/${slug}/` : `/blog/${slug}/`;
};

export async function postsFor(lang: Lang): Promise<Post[]> {
  const all = await getCollection("blog", (p) => parseId(p.id).lang === lang && !p.data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** The same post in the other language, if it exists. */
export async function translationOf(post: Post): Promise<Post | undefined> {
  const { lang, slug } = parseId(post.id);
  const other = lang === "zh" ? "en" : "zh";
  const all = await getCollection("blog");
  return all.find((p) => p.id === `${other}/${slug}` && !p.data.draft);
}

/** Minutes to read: ~230 English words or ~450 Chinese characters a minute. */
export function readingMinutes(body: string | undefined, lang: Lang): number {
  const text = (body ?? "").replace(/<[^>]+>/g, " ").replace(/```[\s\S]*?```/g, " ");
  const units = lang === "zh" ? (text.match(/[一-鿿]/g) ?? []).length / 450 : text.split(/\s+/).length / 230;
  return Math.max(1, Math.round(units));
}

export const formatDate = (d: Date, lang: Lang) =>
  lang === "zh"
    ? `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
