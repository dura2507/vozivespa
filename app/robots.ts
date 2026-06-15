import type { MetadataRoute } from "next";

const SITE_URL = "https://rentamotozadar.com";

// Allow everyone, including the AI crawlers (GPTBot, ClaudeBot, PerplexityBot,
// Google-Extended, etc.). We WANT the site ingested so that "rent a
// motorbike in Zadar" style questions to ChatGPT/Perplexity surface us.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
