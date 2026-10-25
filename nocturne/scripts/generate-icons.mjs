// Renders the app icons (PNG) used by the web app manifest and iOS home screen.
// Run with: npm run gen:icons   (uses the Playwright Chromium that ships with the dev dependencies)
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const mark = (size, padding) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8b3ff"/><stop offset="1" stop-color="#f2a2c8"/></linearGradient>
    <radialGradient id="bg" cx="0.7" cy="0.2" r="0.9"><stop offset="0" stop-color="#2a1f45"/><stop offset="1" stop-color="#0d0b16"/></radialGradient>
  </defs>
  <rect width="64" height="64" fill="url(#bg)"/>
  <g transform="translate(${padding} ${padding}) scale(${(64 - padding * 2) / 64})">
    <path d="M40 14a20 20 0 1 0 10 34A16 16 0 1 1 40 14z" fill="url(#g)"/>
    <circle cx="46" cy="20" r="2.5" fill="#fff"/>
  </g>
</svg>`;

const targets = [
  { file: "public/icons/icon-192.png", size: 192, padding: 6 },
  { file: "public/icons/icon-512.png", size: 512, padding: 6 },
  // Maskable icons need the artwork inside the central 80% "safe zone".
  { file: "public/icons/icon-maskable-512.png", size: 512, padding: 13 },
  { file: "public/icons/apple-touch-icon.png", size: 180, padding: 8 },
];

const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<body style="margin:0">${mark(t.size, t.padding)}</body>`);
  writeFileSync(t.file, await page.screenshot({ omitBackground: false }));
}
await browser.close();
console.log(`Generated ${targets.length} icons`);
