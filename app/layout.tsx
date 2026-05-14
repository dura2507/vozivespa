import type { Metadata } from "next";
import { DM_Sans, Barlow_Condensed, Dancing_Script } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import AnchorOffsetFix from "@/components/AnchorOffsetFix";
import { PageViewTracker } from "@/components/PageViewTracker";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-barlow",
  weight: ["400", "600", "700", "800", "900"],
});

const dancing = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing",
  weight: ["600", "700"],
});

const TITLE = "SickMotos · Rent a Moto Zadar";
const DESCRIPTION =
  "Rent a scooter or motorbike in Zadar, Croatia. 50cc, 125cc and 390cc bikes from 35€/day. Helmets and basic insurance included.";
const SITE_URL = "https://rentamotozadar.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "SickMotos · Rent a Moto Zadar",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${barlow.variable} ${dancing.variable}`}
    >
      <body className={dmSans.className}>
        <AnchorOffsetFix />
        <PageViewTracker />
        {children}
        <Analytics />
        {/* Elfsight platform: powers the Google Reviews widget on the
            homepage. lazyOnload so it only fetches once the user is
            idle / has scrolled near the reviews section. */}
        <Script
          src="https://elfsightcdn.com/platform.js"
          strategy="lazyOnload"
        />
        {/* Google Ads tag . conversion tracking for the rentamotozadar
            campaigns. ID lives in NEXT_PUBLIC_GOOGLE_ADS_ID so it can
            be swapped without a code change. afterInteractive so it
            doesn't compete with the page render. */}
        {GOOGLE_ADS_ID && (
          <>
            <Script
              id="gtag-src"
              src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GOOGLE_ADS_ID}');
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
