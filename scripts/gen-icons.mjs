import sharp from "sharp";
import { readFileSync } from "node:fs";

// Regenerate the PNG favicons from app/icon.svg. The SVG owns its
// own background (currently a black square with "RENT A MOTO" in
// brand red), so we don't override it — just rasterise at the two
// sizes Apple / Android expect.

const svg = readFileSync("app/icon.svg");

await sharp(svg).resize(180, 180, { fit: "contain" }).png().toFile("app/apple-icon.png");
await sharp(svg).resize(192, 192, { fit: "contain" }).png().toFile("app/icon.png");

console.log("Wrote app/icon.png + app/apple-icon.png");
