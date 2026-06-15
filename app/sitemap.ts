import type { MetadataRoute } from "next";
import { LOCALES } from "@/lib/i18n/config";
import { CATEGORIES } from "@/lib/mockData";

const SITE_URL = "https://rentamotozadar.com";

// Every locale × (home + each bike detail). Helps search + AI crawlers
// discover the full catalogue and the language variants.
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const lang of LOCALES) {
    entries.push({
      url: `${SITE_URL}/${lang}`,
      changeFrequency: "daily",
      priority: lang === "en" ? 1 : 0.8,
    });
    for (const cat of CATEGORIES) {
      entries.push({
        url: `${SITE_URL}/${lang}/fleet/${cat.id}`,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  }
  return entries;
}
