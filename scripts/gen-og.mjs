import sharp from "sharp";
import { readFileSync } from "node:fs";

// 1200×630 is the universal social-card aspect ratio (1.91:1).
// Composition: hero KTM-coast photo, top-to-bottom darkening
// gradient for text legibility, the real SickMotos wordmark SVG
// pinned top-left, big bold "Rent a Moto. Zadar." centered low,
// and a small price + reviews badge so the card sells at a glance.

const W = 1200;
const H = 630;

const logoSvg = readFileSync("public/sickmotos.svg", "utf8");
const logoBuf = await sharp(Buffer.from(logoSvg))
  .resize({ width: 360 })
  .png()
  .toBuffer();

const overlaySvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.05)"/>
      <stop offset="40%" stop-color="rgba(0,0,0,0.15)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>

  <!-- Headline -->
  <text x="64" y="420" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="92" fill="#FFFFFF" letter-spacing="-2">Rent a Moto</text>
  <text x="64" y="510" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="92" fill="#B61F36" letter-spacing="-2">in Zadar</text>

  <!-- Sub line -->
  <text x="64" y="565" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="500" font-size="24" fill="rgba(255,255,255,0.85)">Scooter &amp; motorbike rental . 50cc to 390cc</text>

  <!-- Google rating pill, bottom-right.
       White rounded background + soft shadow, multicolor Google
       wordmark using Google's exact brand hex values, gold stars
       and a 5.0 rating number. -->
  <defs>
    <filter id="pill-shadow" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  <g transform="translate(870 525)" font-family="Arial, 'Helvetica Neue', sans-serif" font-weight="700">
    <rect x="0" y="0" width="270" height="68" rx="34" fill="#FFFFFF" filter="url(#pill-shadow)"/>
    <!-- Google wordmark, hand-kerned across 6 colored letters -->
    <g transform="translate(22 44)" font-size="26">
      <text x="0"   y="0" fill="#4285F4">G</text>
      <text x="20"  y="0" fill="#EA4335">o</text>
      <text x="36"  y="0" fill="#FBBC04">o</text>
      <text x="52"  y="0" fill="#4285F4">g</text>
      <text x="68"  y="0" fill="#34A853">l</text>
      <text x="76"  y="0" fill="#EA4335">e</text>
    </g>
    <!-- 5.0 rating number -->
    <text x="166" y="44" font-size="22" fill="#1F1F1F">5.0</text>
    <!-- 5 gold stars -->
    <text x="200" y="44" font-size="20" fill="#FBBC04" letter-spacing="1">★★★★★</text>
  </g>
</svg>
`;

const base = await sharp("public/bikes/hero.jpg")
  .resize(W, H, { fit: "cover", position: "center" })
  .toBuffer();

await sharp(base)
  .composite([
    { input: Buffer.from(overlaySvg), top: 0, left: 0 },
    { input: logoBuf, top: 56, left: 56 },
  ])
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile("public/og.jpg");

console.log("Wrote public/og.jpg");
