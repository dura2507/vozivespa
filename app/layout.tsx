import type { Metadata } from "next";
import { DM_Sans, Barlow_Condensed, Dancing_Script } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "SickMotos — Scooter & Bike Rental Zadar",
  description:
    "Rent a scooter or motorbike in Zadar, Croatia. 50cc, 125cc and 390cc bikes from 39€/day. Helmets and insurance included.",
};

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
      <body className={dmSans.className}>{children}</body>
    </html>
  );
}
