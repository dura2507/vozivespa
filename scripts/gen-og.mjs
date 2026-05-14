import sharp from "sharp";
import { writeFileSync } from "node:fs";

// 1200×630 is the universal social-card aspect ratio (1.91:1).
// We crop the hero photo cover-style, lay a dark gradient over the
// bottom 40% for legibility, then drop the brand wordmark + Zadar
// tagline on top. Pre-rendered once at build time so WhatsApp /
// Slack / iMessage can pull a static jpg without any compute.

const W = 1200;
const H = 630;

const overlaySvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="55%" stop-color="rgba(0,0,0,0.45)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.85)"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>

  <!-- Brand red accent bar top-left -->
  <rect x="64" y="64" width="6" height="56" fill="#B61F36"/>
  <text x="92" y="106" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="700" font-size="22" fill="#FFFFFF" letter-spacing="6">SICKMOTOS</text>

  <!-- Headline -->
  <text x="64" y="430" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="92" fill="#FFFFFF" letter-spacing="-2">Rent a Moto.</text>
  <text x="64" y="520" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="92" fill="#B61F36" letter-spacing="-2">Zadar.</text>

  <!-- Sub -->
  <text x="64" y="580" font-family="'Helvetica Neue', Arial, sans-serif" font-weight="500" font-size="26" fill="rgba(255,255,255,0.85)">Scooter &amp; motorbike rental . 50cc to 390cc</text>
</svg>
`;

const base = await sharp("public/bikes/hero.jpg")
  .resize(W, H, { fit: "cover", position: "center" })
  .toBuffer();

await sharp(base)
  .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile("public/og.jpg");

console.log("Wrote public/og.jpg");
