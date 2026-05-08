/**
 * Stage 8.A.7 — generate placeholder PWA icons.
 *
 * Manifest references 8 icons under /icons/ that did not exist in the
 * deploy. The 144×144 entry was the most-cited 404 in browser logs.
 *
 * Generates a solid-black square with a centered white "A" via sharp's
 * SVG renderer. Replace with proper Arconique branding artwork when
 * design assets land — this is placeholder hygiene, not final art.
 */

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

const OUT_DIR = resolve(process.cwd(), "public/icons");

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const fontSize = Math.round(size * 0.55);
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="#0a0a0a"/>
        <text x="50%" y="50%" font-family="system-ui, -apple-system, Helvetica, sans-serif"
              font-weight="600" font-size="${fontSize}" fill="#ffffff"
              text-anchor="middle" dominant-baseline="central">A</text>
      </svg>
    `;
    const out = resolve(OUT_DIR, `icon-${size}x${size}.png`);
    await sharp(Buffer.from(svg)).png().toFile(out);
    console.log(`  ${out}`);
  }
  console.log(`generated ${SIZES.length} icons in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
