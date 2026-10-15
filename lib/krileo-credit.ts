import type { Locale } from "@/lib/i18n/config";

// Agency credit (Krileo) shown on the customer-facing surfaces only: a small
// line in the chat widget and a two-line note below every customer email.
// Owner / admin emails never use this. Everything lives in this one module so
// wording, links or the logo can be changed (or the credit removed) in one
// place without touching the 11 page dictionaries.

// Hosted on our own domain so mail clients load it from the sender's site.
// Hardcoded like SITE_URL in app/layout.tsx: a mail must never point at
// localhost, whatever NEXT_PUBLIC_SITE_URL says on a dev machine.
export const KRILEO_LOGO_URL = "https://rentamotozadar.com/krileo-k.png";

type CreditCopy = {
  // Chat widget, rendered as "<chatLead> <strong>Krileo</strong>".
  chatLead: string;
  // Email line 1, rendered as "<emailLead> <strong>Krileo</strong>".
  emailLead: string;
  // Email line 2, followed by " · krileo.com" (or krileo.de).
  emailServices: string;
};

const COPY: Record<Locale, CreditCopy> = {
  en: {
    chatLead: "Powered by",
    emailLead: "Booking system by",
    emailServices: "Websites, booking systems & automation",
  },
  de: {
    chatLead: "Powered by",
    emailLead: "Buchungssystem von",
    emailServices: "Websites, Buchungssysteme & Automatisierung",
  },
  hr: {
    chatLead: "Pokreće",
    emailLead: "Sustav za rezervacije:",
    emailServices: "Web stranice, sustavi za rezervacije i automatizacija",
  },
  it: {
    chatLead: "Powered by",
    emailLead: "Sistema di prenotazione realizzato da",
    emailServices: "Siti web, sistemi di prenotazione e automazione",
  },
  pl: {
    chatLead: "Powered by",
    emailLead: "System rezerwacji:",
    emailServices: "Strony internetowe, systemy rezerwacji i automatyzacja",
  },
  fr: {
    chatLead: "Propulsé par",
    emailLead: "Système de réservation réalisé par",
    emailServices: "Sites web, systèmes de réservation et automatisation",
  },
  es: {
    chatLead: "Con la tecnología de",
    emailLead: "Sistema de reservas de",
    emailServices: "Páginas web, sistemas de reservas y automatización",
  },
  hu: {
    chatLead: "Powered by",
    emailLead: "Foglalási rendszer:",
    emailServices: "Weboldalak, foglalási rendszerek és automatizálás",
  },
  sk: {
    chatLead: "Powered by",
    emailLead: "Rezervačný systém:",
    emailServices: "Webové stránky, rezervačné systémy a automatizácia",
  },
  cs: {
    chatLead: "Powered by",
    emailLead: "Rezervační systém:",
    emailServices: "Webové stránky, rezervační systémy a automatizace",
  },
  pt: {
    chatLead: "Desenvolvido por",
    emailLead: "Sistema de reservas desenvolvido por",
    emailServices: "Sites, sistemas de reservas e automação",
  },
};

// German visitors land on the German site (krileo.de), everyone else on the
// English one (krileo.com).
export function krileoDomain(locale: Locale): "krileo.de" | "krileo.com" {
  return locale === "de" ? "krileo.de" : "krileo.com";
}

export function krileoUrl(locale: Locale, medium: "chatbot" | "email"): string {
  return `https://${krileoDomain(locale)}/?utm_source=rentamoto&utm_medium=${medium}`;
}

export function krileoCopy(locale: Locale): CreditCopy {
  return COPY[locale] ?? COPY.en;
}
