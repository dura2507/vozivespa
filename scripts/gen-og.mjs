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

  <!-- Google rating card, bottom-right.
       White rounded card with soft shadow; the real Google "G"
       icon on the left in its four brand colors, big 5.0 rating
       to the right, gold stars underneath. Compact + balanced
       so nothing escapes the pill. -->
  <defs>
    <filter id="pill-shadow" x="-20%" y="-40%" width="140%" height="180%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="rgba(0,0,0,0.4)"/>
    </filter>
  </defs>
  <g transform="translate(890 510)">
    <rect x="0" y="0" width="250" height="86" rx="14" fill="#FFFFFF" filter="url(#pill-shadow)"/>

    <!-- Google G icon, drawn from the official brand paths.
         Scaled to fit ~48px high inside the card on the left. -->
    <g transform="translate(20 19) scale(2)">
      <path d="M21.6 12.227c0-.709-.06-1.39-.17-2.045H12v3.866h5.382a4.6 4.6 0 0 1-2 3.018v2.51h3.232c1.892-1.745 2.986-4.314 2.986-7.349Z" fill="#4285F4"/>
      <path d="M12 22c2.7 0 4.964-.895 6.618-2.424l-3.232-2.51c-.895.6-2.04.954-3.386.954-2.604 0-4.81-1.76-5.597-4.122H3.064v2.59A9.997 9.997 0 0 0 12 22Z" fill="#34A853"/>
      <path d="M6.404 13.898a6.018 6.018 0 0 1 0-3.795V7.513H3.064a10.003 10.003 0 0 0 0 8.974l3.34-2.59Z" fill="#FBBC04"/>
      <path d="M12 5.977c1.47 0 2.785.504 3.823 1.494l2.866-2.866C16.96 3.041 14.694 2 12 2A9.997 9.997 0 0 0 3.064 7.514l3.34 2.59C7.192 7.738 9.398 5.977 12 5.977Z" fill="#EA4335"/>
    </g>

    <!-- Big rating number -->
    <text x="86" y="45" font-family="Arial, 'Helvetica Neue', sans-serif" font-weight="700" font-size="34" fill="#1F1F1F">5.0</text>

    <!-- Gold stars under the rating -->
    <text x="86" y="70" font-family="Arial, 'Helvetica Neue', sans-serif" font-weight="700" font-size="20" fill="#FBBC04" letter-spacing="3">★★★★★</text>
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
