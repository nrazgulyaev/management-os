/* eslint-disable */
const sharp = require("sharp");
const path = require("path");

const OUT = "/Users/nikitarazgulaev/Projects/arconique-management/public/landing";

/**
 * Each placeholder is a linear-gradient SVG rasterised to webp.
 * Tones reflect the spec: hero-villa = sky-blue, hero-construction
 * = orange-sunrise, phone = dark, laptop = dark, cabinet-preview-*
 * = one of the design-system tone tokens.
 */

const assets = [
  { name: "hero-villa-golden.webp", w: 2400, h: 1600, from: "#9ec8e8", to: "#f3d6a0", angle: 135 },
  { name: "hero-construction-sunrise.webp", w: 2400, h: 1600, from: "#f6a162", to: "#3a1f10", angle: 160 },
  { name: "phone-housekeeping.webp", w: 480, h: 980, from: "#1a2026", to: "#0a0d10", angle: 180 },
  { name: "laptop-investor.webp", w: 1200, h: 800, from: "#1d1f24", to: "#0a0c10", angle: 145 },
  // Cabinet preview tone palette.
  { name: "cabinet-preview-frontoffice.webp", w: 320, h: 480, from: "#9dc6b3", to: "#2f6f56", angle: 160 },
  { name: "cabinet-preview-concierge.webp", w: 320, h: 480, from: "#e9a995", to: "#9e5a49", angle: 160 },
  { name: "cabinet-preview-owner.webp", w: 320, h: 480, from: "#e8c884", to: "#b08438", angle: 160 },
  { name: "cabinet-preview-housekeeping.webp", w: 320, h: 480, from: "#bfd5c4", to: "#6f9881", angle: 160 },
  { name: "cabinet-preview-security.webp", w: 320, h: 480, from: "#3a3f47", to: "#10131a", angle: 160 },
  { name: "cabinet-preview-cfo.webp", w: 320, h: 480, from: "#2a2f38", to: "#08090d", angle: 160 },
  { name: "cabinet-preview-qs.webp", w: 320, h: 480, from: "#e8c884", to: "#b08438", angle: 160 },
  { name: "cabinet-preview-pm.webp", w: 320, h: 480, from: "#9dc6b3", to: "#2f6f56", angle: 160 },
  { name: "cabinet-preview-procurement.webp", w: 320, h: 480, from: "#e9a995", to: "#9e5a49", angle: 160 },
  { name: "cabinet-preview-sitesupervisor.webp", w: 320, h: 480, from: "#bfd5c4", to: "#6f9881", angle: 160 },
  { name: "cabinet-preview-investor.webp", w: 320, h: 480, from: "#3a3f47", to: "#0a0c10", angle: 160 },
];

function svgFor({ w, h, from, to, angle }) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const x1 = 50 - Math.cos(rad) * 50;
  const y1 = 50 - Math.sin(rad) * 50;
  const x2 = 50 + Math.cos(rad) * 50;
  const y2 = 50 + Math.sin(rad) * 50;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
       <defs>
         <linearGradient id="g" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
           <stop offset="0%" stop-color="${from}"/>
           <stop offset="100%" stop-color="${to}"/>
         </linearGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#g)"/>
     </svg>`,
  );
}

(async () => {
  for (const a of assets) {
    const buf = svgFor(a);
    await sharp(buf, { density: 72 })
      .webp({ quality: 60, effort: 4 })
      .toFile(path.join(OUT, a.name));
    console.log("wrote", a.name);
  }
})();
