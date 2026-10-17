// Generates the original, anime-inspired SVG portraits for the demo characters
// into public/characters/. Everything is drawn procedurally, so the artwork is
// owned by this project and has no licensing or hotlinking concerns.
// Run with: npm run gen:portraits
import { mkdirSync, writeFileSync } from "node:fs";

const W = 400;
const H = 500;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- background
function background(c, id, rand) {
  const parts = [
    `<linearGradient id="${id}-bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${c.bg[0]}"/><stop offset="1" stop-color="${c.bg[1]}"/></linearGradient>`,
    `<radialGradient id="${id}-glow" cx="0.5" cy="0.42" r="0.55"><stop offset="0" stop-color="${c.glow}" stop-opacity="0.55"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>`,
  ];
  const defs = parts.join("");
  let body = `<rect width="${W}" height="${H}" fill="url(#${id}-bg)"/>`;

  if (c.decor === "moon") {
    body += `<circle cx="300" cy="110" r="74" fill="#f3eefe" opacity="0.9"/><circle cx="326" cy="96" r="70" fill="${c.bg[0]}" opacity="0.55"/>`;
  }
  body += `<rect width="${W}" height="${H}" fill="url(#${id}-glow)"/>`;

  const n = c.decor === "stars" || c.decor === "moon" ? 60 : 26;
  for (let i = 0; i < n; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.8;
    const r = rand() * 1.6 + 0.4;
    body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#fff" opacity="${f(rand() * 0.6 + 0.2)}"/>`;
  }

  if (c.decor === "rain") {
    for (let i = 0; i < 70; i++) {
      const x = rand() * (W + 100) - 50;
      const y = rand() * H;
      const len = 18 + rand() * 30;
      body += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x - len * 0.25)}" y2="${f(y + len)}" stroke="${rand() > 0.7 ? c.accent : "#9fb4ff"}" stroke-width="1" opacity="${f(0.15 + rand() * 0.35)}"/>`;
    }
    for (let i = 0; i < 7; i++) {
      const x = rand() * W;
      const w = 20 + rand() * 60;
      body += `<rect x="${f(x)}" y="${f(300 + rand() * 120)}" width="${f(w)}" height="${f(6 + rand() * 10)}" rx="3" fill="${rand() > 0.5 ? c.accent : "#5ad1ff"}" opacity="0.18"/>`;
    }
  }
  if (c.decor === "lanterns") {
    for (let i = 0; i < 9; i++) {
      const x = 20 + rand() * (W - 40);
      const y = 30 + rand() * 260;
      const s = 6 + rand() * 9;
      body += `<g opacity="${f(0.45 + rand() * 0.45)}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 2.2)}" fill="#ffb15c" opacity="0.18"/><rect x="${f(x - s / 2)}" y="${f(y - s * 0.7)}" width="${f(s)}" height="${f(s * 1.4)}" rx="${f(s / 2.5)}" fill="#ff9a4a"/></g>`;
    }
  }
  if (c.decor === "leaves") {
    for (let i = 0; i < 14; i++) {
      const x = rand() * W;
      const y = rand() * H * 0.85;
      const a = rand() * 360;
      body += `<path d="M0 0 C 8 -10, 22 -6, 26 0 C 22 6, 8 10, 0 0 Z" transform="translate(${f(x)} ${f(y)}) rotate(${f(a)}) scale(${f(0.7 + rand())})" fill="#7ee0b8" opacity="${f(0.15 + rand() * 0.3)}"/>`;
    }
  }
  if (c.decor === "clouds") {
    for (let i = 0; i < 6; i++) {
      const x = rand() * W;
      const y = 250 + rand() * 200;
      body += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(60 + rand() * 60)}" ry="${f(14 + rand() * 12)}" fill="#fff" opacity="${f(0.06 + rand() * 0.1)}"/>`;
    }
  }
  if (c.decor === "fog") {
    for (let i = 0; i < 8; i++) {
      body += `<ellipse cx="${f(rand() * W)}" cy="${f(300 + rand() * 200)}" rx="${f(90 + rand() * 80)}" ry="${f(18 + rand() * 18)}" fill="#c9b8ff" opacity="${f(0.05 + rand() * 0.08)}"/>`;
    }
  }
  if (c.decor === "books") {
    for (let i = 0; i < 8; i++) {
      const x = 20 + rand() * (W - 60);
      const y = 40 + rand() * 300;
      const a = rand() * 40 - 20;
      body += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})" opacity="${f(0.25 + rand() * 0.35)}"><rect width="22" height="16" rx="2" fill="${c.accent}"/><rect x="10.5" width="1" height="16" fill="#fff" opacity="0.7"/><circle cx="11" cy="8" r="16" fill="${c.accent}" opacity="0.12"/></g>`;
    }
  }
  return { defs, body };
}

// ---------------------------------------------------------------- hair
function hairBack(c, id) {
  switch (c.hair.back) {
    case "long":
      return `<path d="M112 190 C 82 300, 70 420, 92 500 L 308 500 C 330 420, 318 300, 288 190 C 280 120, 120 120, 112 190 Z" fill="url(#${id}-hair)"/>`;
    case "ponytail":
      return `<path d="M120 200 C 104 250, 112 300, 128 330 L 272 330 C 288 300, 296 250, 280 200 Z" fill="url(#${id}-hair)"/><path d="M262 160 C 330 170, 340 300, 310 420 C 300 460, 286 480, 272 496 C 292 420, 298 320, 270 230 Z" fill="url(#${id}-hair)"/>`;
    case "bob":
      return `<path d="M116 190 C 100 250, 104 300, 118 330 C 150 344, 250 344, 282 330 C 296 300, 300 250, 284 190 C 276 120, 124 120, 116 190 Z" fill="url(#${id}-hair)"/>`;
    case "short":
    default:
      return `<path d="M120 196 C 110 240, 116 270, 128 288 L 272 288 C 284 270, 290 240, 280 196 Z" fill="url(#${id}-hair)"/>`;
  }
}

function bangs(c, id, rand) {
  const { fringe = "swept", spikes = 7 } = c.hair;
  // Dome over the skull.
  let d = "M108 214 C 92 112, 154 68, 200 68 C 246 68, 308 112, 292 214 ";
  // Fringe edge from right temple back to left temple.
  const left = 110;
  const right = 290;
  const pts = [];
  for (let i = 0; i <= spikes; i++) {
    const t = i / spikes;
    pts.push(right - t * (right - left));
  }
  const lean = fringe === "swept" ? -14 : fringe === "spiky" ? 0 : -4;
  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i];
    const x1 = pts[i + 1];
    const mid = (x0 + x1) / 2;
    const center = 1 - Math.abs(mid - 200) / 100; // longer near the middle
    let tip;
    if (fringe === "straight") tip = 184 + rand() * 4;
    else if (fringe === "spiky") tip = 170 + center * 22 + rand() * 10;
    else tip = 166 + center * 24 + rand() * 8;
    const valley = fringe === "straight" ? 176 : 146 + rand() * 8;
    d += `Q ${f(mid + lean * 0.5)} ${f(valley)} ${f(mid + lean)} ${f(tip)} Q ${f(x1 + 2)} ${f(valley + 6)} ${f(x1)} ${f(i === pts.length - 2 ? 214 : 160 + rand() * 8)} `;
  }
  d += "Z";
  let out = `<path d="${d}" fill="url(#${id}-hair)"/>`;

  // Side locks framing the face.
  if (c.hair.sideLocks) {
    const len = c.hair.sideLocks;
    out += `<path d="M118 188 C 108 240, 112 ${270 + len * 0.4}, 120 ${300 + len} C 128 ${260 + len * 0.5}, 136 230, 140 196 Z" fill="url(#${id}-hair)"/>`;
    out += `<path d="M282 188 C 292 240, 288 ${270 + len * 0.4}, 280 ${300 + len} C 272 ${260 + len * 0.5}, 264 230, 260 196 Z" fill="url(#${id}-hair)"/>`;
  }
  // A few strand lines for texture.
  for (const x of [150, 178, 222, 250]) {
    out += `<path d="M${x} ${x < 200 ? 96 : 96} Q ${x + (x < 200 ? -6 : 6)} 120 ${x + (x < 200 ? -10 : 10)} 150" stroke="${shade(c.hair.color, -0.35)}" stroke-opacity="0.35" stroke-width="1.5" fill="none"/>`;
  }
  // Glossy "angel ring" highlight.
  out += `<path d="M138 130 C 168 104, 232 104, 262 130" stroke="#fff" stroke-opacity="0.28" stroke-width="7" fill="none" stroke-linecap="round"/>`;
  out += `<path d="M150 120 C 175 104, 200 102, 214 104" stroke="#fff" stroke-opacity="0.35" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return out;
}

// ---------------------------------------------------------------- face
function eye(cx, cy, c, id, side) {
  const s = side === "l" ? 1 : -1;
  const ry = c.eyes.narrow ? 11 : 16;
  const iris = c.eyes.colors?.[side] ?? c.eyes.color;
  const gid = `${id}-iris-${side}`;
  const defs = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(iris, -0.55)}"/><stop offset="0.55" stop-color="${iris}"/><stop offset="1" stop-color="${shade(iris, 0.45)}"/></linearGradient><clipPath id="${id}-clip-${side}"><ellipse cx="${cx}" cy="${cy}" rx="20" ry="${ry}"/></clipPath>`;
  let g = `<ellipse cx="${cx}" cy="${cy}" rx="20" ry="${ry}" fill="#fdfaff"/>`;
  g += `<g clip-path="url(#${id}-clip-${side})">`;
  g += `<ellipse cx="${cx + s * 1}" cy="${cy + 1}" rx="13.5" ry="${ry + 2}" fill="url(#${gid})"/>`;
  g += `<ellipse cx="${cx + s * 1}" cy="${cy + 2}" rx="5.5" ry="${ry * 0.55}" fill="${shade(iris, -0.75)}"/>`;
  g += `<rect x="${cx - 20}" y="${cy - ry - 2}" width="40" height="5" fill="#000" opacity="0.18"/>`;
  g += `</g>`;
  if (c.eyes.glow) g += `<ellipse cx="${cx}" cy="${cy}" rx="22" ry="${ry + 4}" fill="${iris}" opacity="0.18"/>`;
  g += `<circle cx="${cx - s * 4}" cy="${cy - ry * 0.35}" r="3.6" fill="#fff"/>`;
  g += `<circle cx="${cx + s * 5}" cy="${cy + ry * 0.4}" r="1.6" fill="#fff" opacity="0.85"/>`;
  // Upper lash line with an outer flick.
  const ox = cx + s * -22;
  const ix = cx + s * 19;
  g += `<path d="M${ix} ${cy - ry * 0.55} Q ${cx} ${cy - ry - 7} ${ox} ${cy - ry * 0.35} L ${ox - s * 5} ${cy - ry * 0.55} Q ${cx} ${cy - ry - 3.5} ${ix} ${cy - ry * 0.35} Z" fill="${c.lash ?? "#1b1426"}"/>`;
  g += `<path d="M${ox + s * 2} ${cy + ry * 0.55} Q ${cx} ${cy + ry + 3} ${ix - s * 4} ${cy + ry * 0.75}" stroke="${c.lash ?? "#1b1426"}" stroke-width="1.2" fill="none" opacity="0.55"/>`;
  // Brow
  const by = cy - ry - (c.eyes.narrow ? 10 : 12);
  const browTilt = c.eyes.stern ? 5 : -2;
  g += `<path d="M${cx + s * 15} ${by + browTilt} Q ${cx} ${by - 5} ${cx - s * 17} ${by + 2}" stroke="${shade(c.hair.color, -0.35)}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  return { defs, g };
}

function face(c, id) {
  const skin = c.skin ?? "#f8dfcf";
  const defs = `<linearGradient id="${id}-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -0.08)}"/></linearGradient>`;
  let g = "";
  // Neck + shadow
  g += `<path d="M181 280 L 178 356 L 222 356 L 219 280 Z" fill="${shade(skin, -0.1)}"/>`;
  g += `<path d="M180 296 Q 200 322 220 296 L 220 318 Q 200 334 180 318 Z" fill="${shade(skin, -0.22)}" opacity="0.6"/>`;
  // Ears
  g += `<ellipse cx="126" cy="226" rx="9" ry="16" fill="${shade(skin, -0.05)}"/><ellipse cx="274" cy="226" rx="9" ry="16" fill="${shade(skin, -0.05)}"/>`;
  // Head
  g += `<path d="M126 196 C 124 124, 276 124, 274 196 C 274 246, 252 284, 200 306 C 148 284, 126 246, 126 196 Z" fill="url(#${id}-skin)"/>`;
  // Blush
  g += `<ellipse cx="158" cy="262" rx="15" ry="6" fill="#ff8fa3" opacity="${c.blush ?? 0.28}"/><ellipse cx="242" cy="262" rx="15" ry="6" fill="#ff8fa3" opacity="${c.blush ?? 0.28}"/>`;
  // Nose
  g += `<path d="M201 252 L 197 263 L 202 264" stroke="${shade(skin, -0.3)}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  // Mouth
  const m = c.mouth ?? "soft";
  if (m === "smile") {
    g += `<path d="M186 274 Q 200 288 214 274 Q 200 281 186 274 Z" fill="#b8475c"/><path d="M190 276 Q 200 280 210 276" stroke="#fff" stroke-width="1.5" opacity="0.7" fill="none"/>`;
  } else if (m === "smirk") {
    g += `<path d="M188 277 Q 202 283 214 272" stroke="#8c3a4b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  } else if (m === "flat") {
    g += `<path d="M190 278 L 210 277" stroke="#8c3a4b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  } else {
    g += `<path d="M190 276 Q 200 282 210 276" stroke="#8c3a4b" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  }
  const L = eye(164, 228, c, id, "l");
  const R = eye(236, 228, c, id, "r");
  return { defs: defs + L.defs + R.defs, g: g + L.g + R.g };
}

// ---------------------------------------------------------------- body
function body(c, id) {
  const defs = `<linearGradient id="${id}-cloth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.cloth[0]}"/><stop offset="1" stop-color="${c.cloth[1]}"/></linearGradient>`;
  let g = `<path d="M70 540 C 74 430, 126 392, 172 380 L 228 380 C 274 392, 326 430, 330 540 Z" fill="url(#${id}-cloth)"/>`;
  switch (c.outfit) {
    case "highcollar":
      g += `<path d="M164 330 L 236 330 L 244 392 L 200 412 L 156 392 Z" fill="${c.cloth[0]}"/><path d="M200 412 L 200 540" stroke="${c.accent}" stroke-width="2" opacity="0.8"/><path d="M166 336 L 234 336" stroke="${c.accent}" stroke-width="2" opacity="0.6"/>`;
      break;
    case "coat":
      g += `<path d="M172 380 L 200 446 L 228 380 L 262 392 L 214 540 L 186 540 L 138 392 Z" fill="${shade(c.cloth[0], -0.25)}"/><path d="M188 392 L 200 420 L 212 392 Z" fill="#f4f0ff"/><path d="M200 420 L 200 540" stroke="${c.accent}" stroke-width="2.5"/>`;
      break;
    case "shrine":
      g += `<path d="M160 380 L 200 470 L 240 380 L 252 384 L 200 540 L 148 384 Z" fill="#f6f2f2"/><path d="M168 380 L 200 450 L 232 380" stroke="#d6283f" stroke-width="7" fill="none"/>`;
      break;
    case "apron":
      g += `<path d="M150 410 Q 200 430 250 410 L 262 540 L 138 540 Z" fill="#fff7fb" opacity="0.92"/><circle cx="200" cy="452" r="7" fill="${c.accent}"/><path d="M178 380 Q 200 400 222 380" stroke="#fff" stroke-width="4" fill="none"/>`;
      break;
    case "hoodie":
      g += `<path d="M140 392 Q 200 440 260 392 Q 252 420 200 432 Q 148 420 140 392 Z" fill="${shade(c.cloth[0], 0.15)}"/><path d="M186 428 L 182 470 M214 428 L 218 470" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>`;
      break;
    case "scarf":
      g += `<path d="M150 372 Q 200 404 250 372 L 256 396 Q 200 428 144 396 Z" fill="${c.accent}"/><path d="M226 398 L 240 470 L 222 466 L 214 404 Z" fill="${shade(c.accent, -0.2)}"/>`;
      break;
    case "suit":
      g += `<path d="M178 380 L 200 410 L 222 380 Z" fill="#f2f6f4"/><rect x="190" y="384" width="20" height="6" rx="2" fill="${c.accent}"/><path d="M110 470 L 290 470" stroke="${c.accent}" stroke-width="1.5" opacity="0.45"/>`;
      break;
    case "robe":
    default:
      g += `<path d="M168 380 L 200 430 L 232 380" stroke="${c.accent}" stroke-width="4" fill="none" opacity="0.9"/><circle cx="200" cy="440" r="6" fill="${c.accent}"/>`;
  }
  return { defs, g: `<g transform="translate(0 -34)">${g}</g>` };
}

// ---------------------------------------------------------------- accessories
function accessories(c) {
  let g = "";
  for (const a of c.accessories ?? []) {
    switch (a) {
      case "star-clip":
        g += `<path d="M262 142 l5 10 11 1 -8 7 3 11 -11 -6 -10 6 3 -11 -8 -7 11 -1 Z" fill="${c.accent}" stroke="#fff" stroke-width="1" stroke-opacity="0.6"/>`;
        break;
      case "visor":
        g += `<path d="M118 206 L 282 206 L 276 224 L 124 224 Z" fill="${c.accent}" opacity="0.28"/><path d="M118 206 L 282 206" stroke="${c.accent}" stroke-width="2.5"/><circle cx="276" cy="226" r="5" fill="${c.accent}"/>`;
        break;
      case "earpiece":
        g += `<rect x="268" y="214" width="12" height="24" rx="5" fill="#2a2f3a"/><circle cx="274" cy="226" r="3" fill="${c.accent}"/>`;
        break;
      case "goggles":
        g += `<path d="M126 150 Q 200 126 274 150" stroke="#5a3a24" stroke-width="7" fill="none"/><circle cx="170" cy="136" r="17" fill="#3b2a1e" stroke="#c9a46a" stroke-width="4"/><circle cx="230" cy="136" r="17" fill="#3b2a1e" stroke="#c9a46a" stroke-width="4"/><circle cx="165" cy="131" r="6" fill="#9ee8ff" opacity="0.7"/><circle cx="225" cy="131" r="6" fill="#9ee8ff" opacity="0.7"/>`;
        break;
      case "ribbon":
        g += `<path d="M262 120 L 296 100 L 292 132 Z M262 120 L 290 146 L 268 150 Z" fill="#d6283f"/><circle cx="264" cy="122" r="6" fill="#ff5468"/>`;
        break;
      case "seams":
        g += `<path d="M150 264 L 150 290 M250 264 L 250 290" stroke="#6bd5b5" stroke-width="1.2" opacity="0.7"/><circle cx="276" cy="228" r="7" fill="#1d2b2a" stroke="#6bd5b5" stroke-width="2"/><circle cx="276" cy="228" r="2.5" fill="#9ff7da"/>`;
        break;
      case "moth-pin":
        g += `<g transform="translate(238 420)"><path d="M0 0 C -14 -12, -20 4, -6 6 C -16 14, -4 18, 0 6 C 4 18, 16 14, 6 6 C 20 4, 14 -12, 0 0 Z" fill="#dcd6ef" stroke="#fff" stroke-width="0.8"/></g>`;
        break;
      case "glasses":
        g += `<circle cx="164" cy="228" r="25" fill="none" stroke="#2c2233" stroke-width="3"/><circle cx="236" cy="228" r="25" fill="none" stroke="#2c2233" stroke-width="3"/><path d="M189 226 Q 200 220 211 226" stroke="#2c2233" stroke-width="3" fill="none"/><path d="M152 210 L 160 204" stroke="#fff" stroke-width="2" opacity="0.6"/>`;
        break;
      case "bun":
        g += `<circle cx="248" cy="88" r="28" fill="url(#__HAIR__)"/><path d="M232 74 Q 248 64 262 76" stroke="#fff" stroke-opacity="0.3" stroke-width="3" fill="none"/>`;
        break;
      case "headphones":
        g += `<path d="M118 200 C 112 92, 288 92, 282 200" stroke="#f5f2ff" stroke-width="9" fill="none"/><rect x="104" y="188" width="24" height="44" rx="11" fill="#f5f2ff"/><rect x="272" y="188" width="24" height="44" rx="11" fill="#f5f2ff"/><rect x="109" y="196" width="14" height="28" rx="7" fill="${c.accent}"/><rect x="277" y="196" width="14" height="28" rx="7" fill="${c.accent}"/>`;
        break;
      case "violet-eye":
        g += `<ellipse cx="164" cy="228" rx="28" ry="24" fill="#b07bff" opacity="0.14"/>`;
        break;
    }
  }
  return g;
}

function hood(c, id) {
  // The Lantern Keeper: hooded figure, face in shadow, glowing eyes, lantern light.
  const defs = `<radialGradient id="${id}-lantern" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient><linearGradient id="${id}-hood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.cloth[0]}"/><stop offset="1" stop-color="${c.cloth[1]}"/></linearGradient>`;
  let g = `<path d="M60 500 C 70 400, 110 360, 140 330 C 110 260, 116 120, 200 86 C 284 120, 290 260, 260 330 C 290 360, 330 400, 340 500 Z" fill="url(#${id}-hood)"/>`;
  g += `<path d="M146 300 C 132 230, 150 150, 200 128 C 250 150, 268 230, 254 300 C 236 318, 164 318, 146 300 Z" fill="#0b0814"/>`;
  g += `<path d="M150 150 C 170 120, 230 120, 250 150" stroke="#fff" stroke-opacity="0.08" stroke-width="5" fill="none"/>`;
  for (const x of [176, 224]) {
    g += `<ellipse cx="${x}" cy="226" rx="16" ry="9" fill="${c.eyes.color}" opacity="0.25"/><ellipse cx="${x}" cy="226" rx="8" ry="4" fill="${c.eyes.color}"/><ellipse cx="${x}" cy="225" rx="3" ry="1.5" fill="#fff"/>`;
  }
  g += `<circle cx="300" cy="430" r="90" fill="url(#${id}-lantern)"/><rect x="284" y="404" width="32" height="44" rx="8" fill="#3a2a18" stroke="#c9a46a" stroke-width="3"/><rect x="291" y="412" width="18" height="28" rx="5" fill="#ffd27a"/><path d="M300 404 L 300 380 Q 300 368 290 368" stroke="#c9a46a" stroke-width="3" fill="none"/>`;
  return { defs, g };
}

// ---------------------------------------------------------------- helpers
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function portrait(c, seed) {
  const id = c.slug;
  const rand = rng(seed);
  const bg = background(c, id, rand);
  let defs = bg.defs;
  let g = bg.body;

  if (c.hooded) {
    const h = hood(c, id);
    defs += h.defs;
    g += h.g;
  } else {
    defs += `<linearGradient id="${id}-hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c.hair.color, 0.18)}"/><stop offset="0.6" stop-color="${c.hair.color}"/><stop offset="1" stop-color="${shade(c.hair.color, -0.4)}"/></linearGradient>`;
    const b = body(c, id);
    const fc = face(c, id);
    defs += b.defs + fc.defs;
    g += hairBack(c, id);
    g += b.g;
    g += fc.g;
    g += bangs(c, id, rand);
    g += accessories(c).replaceAll("__HAIR__", `${id}-hair`);
  }

  // Soft vignette + rim light for depth.
  defs += `<radialGradient id="${id}-vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>`;
  defs += `<linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.glow}" stop-opacity="0.18"/><stop offset="0.3" stop-color="${c.glow}" stop-opacity="0"/></linearGradient>`;
  g += `<rect width="${W}" height="${H}" fill="url(#${id}-rim)"/><rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Portrait of ${c.name}"><defs>${defs}</defs>${g}</svg>\n`;
}

// ---------------------------------------------------------------- cast
const CAST = [
  {
    slug: "seraphine", name: "Seraphine Vale", bg: ["#141a3a", "#0b0a1a"], glow: "#7aa2ff", accent: "#ffd57a", decor: "books",
    hair: { color: "#a9c0f0", back: "long", fringe: "swept", spikes: 8, sideLocks: 60 },
    eyes: { color: "#e8b84a" }, mouth: "soft", cloth: ["#2b2f6b", "#151735"], outfit: "robe", accessories: ["star-clip"],
  },
  {
    slug: "kaito", name: "Kaito Renjō", bg: ["#0e1424", "#05060c"], glow: "#ff3d6e", accent: "#ff3d6e", decor: "rain", skin: "#efcfb6",
    hair: { color: "#23222e", back: "short", fringe: "spiky", spikes: 7, sideLocks: 10 },
    eyes: { color: "#c23a52", narrow: true, stern: true }, mouth: "flat", blush: 0.08, cloth: ["#20232e", "#0b0c12"], outfit: "highcollar", accessories: ["earpiece"],
  },
  {
    slug: "mira", name: "Mira Hoshizora", bg: ["#2a1638", "#120a1d"], glow: "#ff9ccf", accent: "#ff7eb6", decor: "stars",
    hair: { color: "#f6a6c8", back: "bob", fringe: "swept", spikes: 8, sideLocks: 24 },
    eyes: { color: "#58b4ff" }, mouth: "smile", blush: 0.4, cloth: ["#7a4fb8", "#3c2560"], outfit: "apron", accessories: ["bun", "star-clip"],
  },
  {
    slug: "lucien", name: "Lucien Ashgrave", bg: ["#1b1a24", "#0a090f"], glow: "#b07bff", accent: "#b07bff", decor: "fog",
    hair: { color: "#b9b6c6", back: "short", fringe: "swept", spikes: 6, sideLocks: 14 },
    eyes: { color: "#8e93a6", colors: { l: "#b07bff" }, glow: false }, mouth: "smirk", blush: 0.12, cloth: ["#2d2a3a", "#121019"], outfit: "coat", accessories: ["violet-eye"],
  },
  {
    slug: "aria", name: "Aria Windweaver", bg: ["#163450", "#0b1626"], glow: "#62d6e8", accent: "#2fc4c9", decor: "clouds", skin: "#f3d2b8",
    hair: { color: "#c8572f", back: "ponytail", fringe: "spiky", spikes: 7, sideLocks: 20 },
    eyes: { color: "#2fc4c9" }, mouth: "smirk", blush: 0.3, cloth: ["#5b3b2a", "#2a1a12"], outfit: "scarf", accessories: ["goggles"],
  },
  {
    slug: "noa", name: "Noa Kirisame", bg: ["#2a1020", "#0d0710"], glow: "#ff8a5c", accent: "#d6283f", decor: "lanterns",
    hair: { color: "#eeeaf4", back: "long", fringe: "straight", spikes: 9, sideLocks: 70 },
    eyes: { color: "#d6283f" }, mouth: "soft", cloth: ["#f6f2f2", "#d8d0d4"], outfit: "shrine", accessories: ["ribbon"],
  },
  {
    slug: "sable", name: "Sable", bg: ["#0f2a26", "#07110f"], glow: "#6bd5b5", accent: "#6bd5b5", decor: "leaves",
    hair: { color: "#8fe3c8", back: "bob", fringe: "straight", spikes: 8, sideLocks: 30 },
    eyes: { color: "#46c8ff", glow: true }, mouth: "soft", blush: 0.15, cloth: ["#dfe9e6", "#9fb3ad"], outfit: "suit", accessories: ["seams"],
  },
  {
    slug: "valen", name: "Valen Duskmere", bg: ["#1c1236", "#0a0714"], glow: "#c9a7ff", accent: "#c9a7ff", decor: "moon",
    hair: { color: "#4b2f7a", back: "ponytail", fringe: "swept", spikes: 7, sideLocks: 40 },
    eyes: { color: "#e6c36a" }, mouth: "smirk", blush: 0.14, cloth: ["#3a2470", "#140c28"], outfit: "highcollar", accessories: ["moth-pin"],
  },
  {
    slug: "juno", name: "Juno Park", bg: ["#2b1a2e", "#110b14"], glow: "#ffb070", accent: "#ff9f5a", decor: "stars", skin: "#f5d6c0",
    hair: { color: "#e07a3c", back: "short", fringe: "swept", spikes: 7, sideLocks: 16 },
    eyes: { color: "#6b4a2e" }, mouth: "smile", blush: 0.32, cloth: ["#5d6bd8", "#2c3474"], outfit: "hoodie", accessories: ["bun", "glasses"],
  },
  {
    slug: "keeper", name: "The Lantern Keeper", bg: ["#141024", "#06050b"], glow: "#ffb347", accent: "#ffb347", decor: "fog", hooded: true,
    eyes: { color: "#ffcf6e" }, cloth: ["#2a2340", "#0d0a16"],
  },
];

mkdirSync(new URL("../public/characters/", import.meta.url), { recursive: true });
CAST.forEach((c, i) => {
  writeFileSync(new URL(`../public/characters/${c.slug}.svg`, import.meta.url), portrait(c, 1000 + i * 77));
});
console.log(`Generated ${CAST.length} portraits in public/characters/`);
