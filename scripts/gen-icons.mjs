import sharp from "sharp";
import { readFileSync } from "node:fs";

// Transparent PNG favicons so the icon doesn't sit on a square white
// patch in WhatsApp / iMessage / dark-mode tabs. iOS 13+ renders
// transparent apple-touch icons fine — it composites them onto the
// home-screen background.

const svg = readFileSync("app/icon.svg");

await sharp(svg)
  .resize(180, 180, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile("app/apple-icon.png");

await sharp(svg)
  .resize(192, 192, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile("app/icon.png");

console.log("Wrote app/icon.png + app/apple-icon.png (transparent)");
