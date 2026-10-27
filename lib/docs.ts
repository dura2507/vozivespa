import type { Locale } from "@/lib/i18n/config";

// Thomas' rental agreement, one PDF per site language, so every link hands out
// the visitor's own language. The files are split from his multilingual original
// (public/docs/sickmotos-rental-agreement.pdf, kept for links in older emails)
// by scripts/split-agreement.swift; rerun that when he sends a new version.
export function agreementPdfPath(locale: Locale): string {
  return `/docs/sickmotos-rental-agreement-${locale}.pdf`;
}
