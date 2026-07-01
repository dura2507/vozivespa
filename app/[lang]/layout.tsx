import { notFound } from "next/navigation";
import { LOCALES, isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import Chatbot from "@/components/Chatbot";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang as Locale);
  return (
    <>
      {children}
      <Chatbot locale={lang as Locale} t={dict.chatbot} />
    </>
  );
}
