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
  <text x="64" y="420" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="92" fill="#FFFFFF" letter-spacing="-2">Rent a Moto.</text>
  <text x="64" y="510" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="92" fill="#B61F36" letter-spacing="-2">Zadar.</text>

  <!-- Sub line -->
  <text x="64" y="565" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="500" font-size="24" fill="rgba(255,255,255,0.85)">Scooter &amp; motorbike rental . 50cc to 390cc . from 35€/day</text>

  <!-- Five-star pill in bottom-right -->
  <g transform="translate(925 535)">
    <rect x="0" y="0" width="215" height="54" rx="27" fill="#B61F36"/>
    <text x="22" y="36" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="700" font-size="22" fill="#FFFFFF" letter-spacing="3">★★★★★</text>
    <text x="143" y="34" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="700" font-size="13" fill="#FFFFFF" letter-spacing="3">GOOGLE</text>
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
