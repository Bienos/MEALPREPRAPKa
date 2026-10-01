// Draws the 32 dish pictures in public/food as SVG: node scripts/food-art.mjs <outDir>.
// The app serves 800x600 JPEGs of them (SVG filters are slow on phones), made by opening each
// SVG in a browser and saving a screenshot. Replace the JPEGs with photos any time; only the
// file names in src/lib/meals/images.ts matter.
// Generates flat top-down food illustrations, one per dish type, into public/food/.
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "public/food";
mkdirSync(OUT, { recursive: true });

const W = 480, H = 360, CX = 240, CY = 186;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Points scattered inside a circle (or ellipse), deterministic. */
function scatter(r, n, cx, cy, rad, ry = rad) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    pts.push([cx + Math.cos(a) * d * rad, cy + Math.sin(a) * d * ry, r()]);
  }
  return pts;
}
const f = (n) => Math.round(n * 10) / 10;

const defs = `
<defs>
  <filter id="sh" x="-25%" y="-25%" width="150%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="9"/><feOffset dx="6" dy="14" result="b"/><feComponentTransfer><feFuncA type="linear" slope=".42"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="sm" x="-30%" y="-30%" width="170%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.8"/><feOffset dx="1.5" dy="3" result="b"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="blur"><feGaussianBlur stdDeviation="2.2"/></filter>
  <filter id="wood" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".004 .09" numOctaves="4" seed="7"/><feColorMatrix values="0 0 0 0 .25  0 0 0 0 .15  0 0 0 0 .08  0 0 0 -1.6 1.05"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 -.12"/></filter>
  <filter id="bump" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7"/></filter>
  <radialGradient id="plate" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#fbf8f2"/><stop offset="1" stop-color="#ece5d9"/></radialGradient>
  <radialGradient id="rim" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".75" stop-color="#f6f2ea"/><stop offset="1" stop-color="#ddd4c5"/></radialGradient>
  <radialGradient id="well" cx="50%" cy="50%" r="50%"><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#6a5a44" stop-opacity=".14"/></radialGradient>
  <radialGradient id="dome" cx="36%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".35" stop-color="#fff" stop-opacity=".06"/><stop offset=".72" stop-color="#000" stop-opacity=".02"/><stop offset="1" stop-color="#2a1608" stop-opacity=".34"/></radialGradient>
  <radialGradient id="gloss" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6e0" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#1c0f05" stop-opacity=".14"/></linearGradient>
  <radialGradient id="vig" cx="50%" cy="46%" r="72%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2a1608" stop-opacity=".24"/></radialGradient>
  <radialGradient id="chick" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="#f1c98e"/><stop offset=".55" stop-color="#d9964f"/><stop offset="1" stop-color="#a8642a"/></radialGradient>
  <radialGradient id="beef" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#a8654a"/><stop offset="1" stop-color="#5e2f1d"/></radialGradient>
  <radialGradient id="pot" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#f9db86"/><stop offset=".7" stop-color="#e5ab4c"/><stop offset="1" stop-color="#b9772a"/></radialGradient>
  <radialGradient id="yolk" cx="38%" cy="32%" r="65%"><stop offset="0" stop-color="#ffd966"/><stop offset=".7" stop-color="#f6a61f"/><stop offset="1" stop-color="#e28a10"/></radialGradient>
  <radialGradient id="glass" cx="50%" cy="50%" r="50%"><stop offset=".86" stop-color="#ffffff" stop-opacity="0"/><stop offset=".93" stop-color="#ffffff" stop-opacity=".75"/><stop offset="1" stop-color="#cfd8dc" stop-opacity=".9"/></radialGradient>
</defs>`;

/* ---------- base pieces ---------- */
const table = (c1, c2) => `<rect width="${W}" height="${H}" fill="${c1}"/>
  <rect width="${W}" height="${H}" fill="${c2}" filter="url(#wood)" opacity=".38"/>
  <g opacity=".22">${Array.from({ length: 6 }, (_, i) => `<rect x="0" y="${i * 64}" width="${W}" height="2" fill="#000"/>`).join("")}</g>`;
const napkin = (c) => `<g transform="rotate(-14 70 300)" filter="url(#sm)"><rect x="-10" y="250" width="160" height="130" rx="8" fill="${c}"/><rect x="-10" y="250" width="160" height="130" rx="8" fill="url(#light)"/><path d="M-10 285 H150 M-10 322 H150" stroke="#fff" stroke-opacity=".28" stroke-width="2"/><path d="M-10 262 H150" stroke="#000" stroke-opacity=".08" stroke-width="3"/></g>`;
const fork = () => `<g transform="rotate(8 420 190)" filter="url(#sm)"><rect x="413" y="120" width="12" height="176" rx="6" fill="#cfcac1"/><rect x="415" y="120" width="4" height="176" rx="2" fill="#f4f1ea"/><rect x="403" y="60" width="32" height="70" rx="11" fill="#dedad1"/>${[0, 1, 2, 3].map((i) => `<rect x="${405 + i * 7.5}" y="38" width="4.5" height="46" rx="2.2" fill="#e6e2da"/>`).join("")}</g>`;
const spoon = () => `<g transform="rotate(10 420 190)" filter="url(#sm)"><rect x="413" y="140" width="12" height="164" rx="6" fill="#cfcac1"/><rect x="415" y="140" width="4" height="164" rx="2" fill="#f4f1ea"/><ellipse cx="419" cy="100" rx="24" ry="36" fill="#dedad1"/><ellipse cx="419" cy="100" rx="17" ry="28" fill="#c9c4ba"/><ellipse cx="413" cy="90" rx="6" ry="14" fill="#fff" opacity=".6"/></g>`;
const plate = (r = 148) => `<circle cx="${CX}" cy="${CY}" r="${r}" fill="url(#rim)" filter="url(#sh)"/><circle cx="${CX}" cy="${CY}" r="${r * 0.76}" fill="url(#plate)"/><circle cx="${CX}" cy="${CY}" r="${r * 0.76}" fill="url(#well)"/><circle cx="${CX}" cy="${CY}" r="${r * 0.76}" fill="none" stroke="#c9bfae" stroke-opacity=".5" stroke-width="1.5"/><circle cx="${CX}" cy="${CY}" r="${r - 2}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>`;
const bowl = (rim, inner = "#fbf8f3", r = 144) => `<circle cx="${CX}" cy="${CY}" r="${r}" fill="${rim}" filter="url(#sh)"/><circle cx="${CX}" cy="${CY}" r="${r}" fill="url(#light)"/><circle cx="${CX}" cy="${CY}" r="${r * 0.88}" fill="${inner}"/><circle cx="${CX}" cy="${CY}" r="${r * 0.88}" fill="url(#well)"/><circle cx="${CX}" cy="${CY}" r="${r * 0.88}" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="5"/><circle cx="${CX}" cy="${CY}" r="${r - 2}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>`;
const jar = (r = 124) => `<circle cx="${CX}" cy="${CY}" r="${r}" fill="#e8eff1" filter="url(#sh)"/><circle cx="${CX}" cy="${CY}" r="${r * 0.92}" fill="#fff" opacity=".35"/>`;
const jarTop = (r = 124) => `<circle cx="${CX}" cy="${CY}" r="${r}" fill="url(#glass)"/><circle cx="${CX}" cy="${CY}" r="${r - 3}" fill="none" stroke="#fff" stroke-width="4" opacity=".7"/><ellipse cx="${CX - 56}" cy="${CY - 66}" rx="30" ry="9" transform="rotate(-38 ${CX - 56} ${CY - 66})" fill="#fff" opacity=".55"/>`;
/** Volume: light from the top left, shade at the far edge. Lay over any mound of food. */
const dome = (cx, cy, rad, ry = rad) => `<ellipse cx="${cx}" cy="${cy}" rx="${rad}" ry="${ry}" fill="url(#dome)"/>`;
/** A wet highlight: sauce, glaze, yolk. */
const shine = (x, y, w = 14, h = 6, rot = -30, o = 0.8) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${w}" ry="${h}" transform="rotate(${rot} ${f(x)} ${f(y)})" fill="url(#gloss)" opacity="${o}"/>`;

/* ---------- food pieces ---------- */
/** A lumpy outline, so pieces look cut or cooked rather than drawn with a compass. */
function blob(r, x, y, w, h, rot = 0, lumps = 9, jitter = 0.16) {
  let d = "";
  for (let i = 0; i <= lumps; i++) {
    const a = (i / lumps) * Math.PI * 2, k = 1 + (r() - 0.5) * 2 * jitter;
    d += `${i ? "L" : "M"}${f(x + Math.cos(a) * w * k)} ${f(y + Math.sin(a) * h * k)}`;
  }
  return `<path d="${d}z" transform="rotate(${f(rot)} ${f(x)} ${f(y)})" stroke-linejoin="round" stroke-width="5"/>`;
}
function rice(r, cx, cy, rad, n = 620, tint = "#fffdf6") {
  let s = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#efe7d4"/>`;
  for (const [x, y, k] of scatter(r, n, cx, cy, rad - 3)) {
    const rot = f(k * 180);
    s += `<ellipse cx="${f(x + 0.7)}" cy="${f(y + 1)}" rx="4.6" ry="1.9" transform="rotate(${rot} ${f(x)} ${f(y)})" fill="#cdbf9f" opacity=".55"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="4.6" ry="1.9" transform="rotate(${rot} ${f(x)} ${f(y)})" fill="${k > 0.75 ? "#f1e8d2" : tint}"/>`;
  }
  return s + dome(cx, cy, rad);
}
function chicken(r, pts, fill = "url(#chick)", size = 38) {
  return pts.map(([x, y, k]) => {
    const w = size * (0.8 + k * 0.45), h = size * (0.55 + k * 0.25), rot = f(k * 120 - 60);
    return `<g filter="url(#sm)"><g fill="${fill}" stroke="#8c5222" stroke-opacity=".55">${blob(r, x, y, w / 2, h / 2, rot, 8, 0.12)}</g>` +
      `<g transform="rotate(${rot} ${f(x)} ${f(y)})"><path d="M${f(x - w / 3)} ${f(y - h / 5)} l${f(w / 1.7)} 0 M${f(x - w / 3.4)} ${f(y + h / 6)} l${f(w / 1.8)} 0" stroke="#6a3a14" stroke-opacity=".38" stroke-width="3" stroke-linecap="round"/></g>` +
      shine(x - w / 5, y - h / 4, w / 4, h / 7, rot - 20, 0.75) + `</g>`;
  }).join("");
}
function broccoli(r, pts, size = 24) {
  return pts.map(([x, y, k]) => {
    const s = size + k * 7;
    let florets = "";
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + k * 6, d = i === 0 ? 0 : s * 0.62, rr = s * (i === 0 ? 0.55 : 0.4 + (i % 3) * 0.05);
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      florets += `<circle cx="${f(px)}" cy="${f(py)}" r="${f(rr)}" fill="${["#3f7d2e", "#4f8f38", "#5ea043"][i % 3]}"/><circle cx="${f(px - rr * 0.3)}" cy="${f(py - rr * 0.35)}" r="${f(rr * 0.5)}" fill="#7fbf5c" opacity=".7"/>`;
      florets += scatter(r, 4, px, py, rr * 0.8).map(([a2, b2]) => `<circle cx="${f(a2)}" cy="${f(b2)}" r="1.5" fill="#2f6322" opacity=".8"/>`).join("");
    }
    return `<g filter="url(#sm)"><rect x="${f(x - 3.5)}" y="${f(y + s * 0.3)}" width="7" height="${f(s * 0.75)}" rx="3" fill="#a9cf86"/>${florets}</g>`;
  }).join("");
}
function pepper(r, pts, color = "#e2483a") {
  return pts.map(([x, y, k]) => `<g transform="rotate(${f(k * 360)} ${f(x)} ${f(y)})" filter="url(#sm)"><path d="M${f(x - 18)} ${f(y)} q18 ${f(-16 - k * 6)} 36 0" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/><path d="M${f(x - 12)} ${f(y - 4)} q12 -9 24 0" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="2.5" stroke-linecap="round"/></g>`).join("");
}
function tomato(r, pts, s = 16) {
  return pts.map(([x, y]) => `<g filter="url(#sm)"><circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="#c9301f"/><circle cx="${f(x)}" cy="${f(y)}" r="${s * 0.82}" fill="#e2503a"/>${[0, 2.1, 4.2].map((a) => `<ellipse cx="${f(x + Math.cos(a) * s * 0.38)}" cy="${f(y + Math.sin(a) * s * 0.38)}" rx="${s * 0.2}" ry="${s * 0.13}" transform="rotate(${f(a * 57)} ${f(x + Math.cos(a) * s * 0.38)} ${f(y + Math.sin(a) * s * 0.38)})" fill="#f6c95c"/>`).join("")}${shine(x - s * 0.35, y - s * 0.4, s * 0.35, s * 0.18, -35, 0.9)}</g>`).join("");
}
function cucumber(r, pts, s = 15) {
  return pts.map(([x, y]) => `<g filter="url(#sm)"><circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="#3f7a2e"/><circle cx="${f(x)}" cy="${f(y)}" r="${s - 2.5}" fill="#dcefc3"/><circle cx="${f(x)}" cy="${f(y)}" r="${s * 0.5}" fill="#c4de9f"/>${[0, 1.6, 3.1, 4.7].map((a) => `<ellipse cx="${f(x + Math.cos(a) * s * 0.42)}" cy="${f(y + Math.sin(a) * s * 0.42)}" rx="1.6" ry="2.6" fill="#f3fae6"/>`).join("")}</g>`).join("");
}
function berries(r, pts, colors = ["#3d3a7a", "#4b3f8f", "#2f2c66"], s = 10) {
  return pts.map(([x, y, k], i) => `<g filter="url(#sm)"><circle cx="${f(x)}" cy="${f(y)}" r="${f(s + k * 3)}" fill="${colors[i % colors.length]}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f((s + k * 3) * 0.9)}" fill="#fff" opacity=".12"/><circle cx="${f(x + 0.5)}" cy="${f(y - s * 0.25)}" r="${f(s * 0.22)}" fill="#1a1740" opacity=".7"/>${shine(x - s * 0.3, y - s * 0.4, s * 0.35, s * 0.2, -35, 0.95)}</g>`).join("");
}
function strawberries(r, pts) {
  return pts.map(([x, y, k]) => `<g transform="rotate(${f(k * 360)} ${f(x)} ${f(y)})" filter="url(#sm)"><path d="M${f(x)} ${f(y - 17)} c18 0 20 15 0 32 c-20 -17 -18 -32 0 -32z" fill="#d52a3e"/><path d="M${f(x - 6)} ${f(y - 8)} c4 -5 10 -5 12 0" stroke="#f26a78" stroke-width="3" fill="none" opacity=".7"/>${[[-6, -5], [6, -5], [0, 4], [-7, 6], [7, 6], [0, -10]].map(([dx, dy]) => `<ellipse cx="${f(x + dx)}" cy="${f(y + dy)}" rx="1.4" ry="2" fill="#f9d77a"/>`).join("")}<path d="M${f(x - 9)} ${f(y - 16)} l9 6 l9 -6 l-4 -3 l-5 3 l-5 -3z" fill="#4f8a3a"/></g>`).join("");
}
function banana(r, pts, s = 17) {
  return pts.map(([x, y]) => `<g filter="url(#sm)"><circle cx="${f(x)}" cy="${f(y)}" r="${s}" fill="#e9c75e"/><circle cx="${f(x)}" cy="${f(y)}" r="${s - 2}" fill="#fbeab0"/><circle cx="${f(x)}" cy="${f(y)}" r="${s * 0.35}" fill="#efd98f"/>${[0, 2.1, 4.2].map((a) => `<circle cx="${f(x + Math.cos(a) * s * 0.34)}" cy="${f(y + Math.sin(a) * s * 0.34)}" r="1.4" fill="#7a5a2a"/>`).join("")}${shine(x - s * 0.3, y - s * 0.4, s * 0.4, s * 0.2, -30, 0.7)}</g>`).join("");
}
function apple(r, pts) {
  return pts.map(([x, y, k]) => `<g transform="rotate(${f(k * 360)} ${f(x)} ${f(y)})" filter="url(#sm)"><path d="M${f(x - 20)} ${f(y)} a20 20 0 0 1 40 0 z" fill="#f7ebc9"/><path d="M${f(x - 20)} ${f(y)} a20 20 0 0 1 40 0" fill="none" stroke="#c9372c" stroke-width="3.5"/><path d="M${f(x - 12)} ${f(y - 3)} a12 12 0 0 1 24 0" fill="none" stroke="#e9d6a4" stroke-width="2"/></g>`).join("");
}
function granola(r, pts) {
  return pts.map(([x, y, k]) => `<path d="M${f(x)} ${f(y - 7)} q8 1 7 8 q-2 7 -9 5 q-7 -2 -5 -8 q2 -5 7 -5z" fill="${k > 0.5 ? "#c58d4a" : "#a8733a"}" filter="url(#sm)"/>`).join("");
}
function oats(r, cx, cy, rad, base = "#e9d8b8", n = 220) {
  let s = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${base}"/>`;
  for (const [x, y, k] of scatter(r, n, cx, cy, rad - 5)) s += `<ellipse cx="${f(x + 0.8)}" cy="${f(y + 1)}" rx="6.5" ry="4.4" transform="rotate(${f(k * 180)} ${f(x)} ${f(y)})" fill="#b79f74" opacity=".5"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="6.5" ry="4.4" transform="rotate(${f(k * 180)} ${f(x)} ${f(y)})" fill="${k > 0.6 ? "#e1cca3" : "#f4e8cf"}"/>`;
  return s + dome(cx, cy, rad);
}
function smooth(cx, cy, rad, c1, c2) {
  return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${c1}"/><path d="M${cx - rad * 0.65} ${cy - rad * 0.15} q${rad * 0.3} ${-rad * 0.4} ${rad * 0.65} 0 t${rad * 0.65} 0" fill="none" stroke="${c2}" stroke-width="7" stroke-linecap="round" opacity=".5"/><path d="M${cx - rad * 0.45} ${cy + rad * 0.38} q${rad * 0.25} ${-rad * 0.3} ${rad * 0.5} 0 t${rad * 0.5} 0" fill="none" stroke="${c2}" stroke-width="6" stroke-linecap="round" opacity=".4"/>` + dome(cx, cy, rad) + shine(cx - rad * 0.4, cy - rad * 0.5, rad * 0.3, rad * 0.1, -30, 0.5);
}
function cottage(r, cx, cy, rad, n = 120) {
  let s = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#efeadc"/>`;
  for (const [x, y, k] of scatter(r, n, cx, cy, rad - 8)) s += `<circle cx="${f(x + 1)}" cy="${f(y + 1.5)}" r="${f(7 + k * 4)}" fill="#cfc7b2" opacity=".6"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(7 + k * 4)}" fill="#fffefa"/><circle cx="${f(x - 2)}" cy="${f(y - 2.5)}" r="${f(2.4 + k)}" fill="#fff" opacity=".9"/>`;
  return s + dome(cx, cy, rad);
}
function pb(cx, cy) {
  return `<path d="M${cx - 34} ${cy} q17 -20 34 0 t34 0 t34 0" fill="none" stroke="#9c6128" stroke-width="10" stroke-linecap="round" filter="url(#sm)"/><path d="M${cx - 34} ${cy - 2} q17 -20 34 0 t34 0 t34 0" fill="none" stroke="#c78f4c" stroke-width="3.5" stroke-linecap="round" opacity=".8"/>`;
}
function egg(x, y, s = 1, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" filter="url(#sm)"><path d="M-52 -8 c-6 -34 34 -50 58 -38 c30 12 50 28 38 56 c-9 27 -45 34 -68 25 c-25 -9 -25 -25 -28 -43z" fill="#fffdf8"/><path d="M-52 -8 c-6 -34 34 -50 58 -38 c30 12 50 28 38 56" fill="none" stroke="#e8dfcd" stroke-width="3"/><path d="M-40 6 c4 14 20 20 36 18" fill="none" stroke="#e8c97a" stroke-width="3" opacity=".6"/><circle cx="2" cy="-2" r="21" fill="url(#yolk)"/><circle cx="2" cy="-2" r="21" fill="url(#dome)"/>${shine(-5, -10, 8, 5, -30, 0.95)}</g>`;
}
function bread(x, y, rot = 0, s = 1, fill = "#f1d29a") {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" filter="url(#sm)"><path d="M-52 50 v-62 c0 -32 16 -44 52 -44 s52 12 52 44 v62 z" fill="#a8672a"/><path d="M-43 43 v-55 c0 -24 13 -35 43 -35 s43 11 43 35 v55 z" fill="${fill}"/><path d="M-43 43 v-55 c0 -24 13 -35 43 -35" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>${scatter(rng(5), 22, 0, 0, 36, 40).map(([a, b]) => `<ellipse cx="${f(a)}" cy="${f(b)}" rx="2.6" ry="1.8" fill="#d9ad66"/>`).join("")}</g>`;
}
function tortillaRound(cx, cy, rad, r) {
  let s = `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="#e3c68a" filter="url(#sh)"/><circle cx="${cx}" cy="${cy}" r="${rad - 6}" fill="#f0d9a6"/>`;
  for (const [x, y, k] of scatter(r, 40, cx, cy, rad - 10)) s += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(4 + k * 7)}" ry="${f(3 + k * 3)}" fill="#b98040" opacity=".5"/>`;
  return s + dome(cx, cy, rad);
}
function wrapHalf(x, y, rot, fillColors) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#sm)"><rect x="-78" y="-42" width="156" height="84" rx="38" fill="#e9cd92"/>${[[-48, -12], [-14, 16], [30, -8], [56, 14], [-60, 20], [10, -26]].map(([a, b]) => `<ellipse cx="${a}" cy="${b}" rx="8" ry="4.5" fill="#b98040" opacity=".45"/>`).join("")}<rect x="-78" y="-42" width="156" height="84" rx="38" fill="url(#dome)"/><ellipse cx="78" cy="0" rx="27" ry="42" fill="#f3dfae"/>${fillColors.map((c, i) => `<circle cx="${78 + Math.cos(i * 1.7) * 12}" cy="${Math.sin(i * 1.7) * 20}" r="${11 - i}" fill="${c}"/>`).join("")}<ellipse cx="78" cy="0" rx="27" ry="42" fill="none" stroke="#c8994f" stroke-width="4"/></g>`;
}
function penne(r, pts, sauce = "#d2462e") {
  return pts.map(([x, y, k]) => `<g transform="rotate(${f(k * 180)} ${f(x)} ${f(y)})" filter="url(#sm)"><rect x="${f(x - 18)}" y="${f(y - 7.5)}" width="36" height="15" rx="6" fill="#efc064"/><path d="M${f(x - 18)} ${f(y - 7.5)} h36 v15 h-36z" fill="${sauce}" opacity=".28"/><path d="M${f(x - 11)} ${f(y - 7.5)} v15 M${f(x - 1)} ${f(y - 7.5)} v15 M${f(x + 9)} ${f(y - 7.5)} v15" stroke="#c98f2c" stroke-width="1.6" opacity=".8"/>${shine(x - 6, y - 3, 9, 2.4, 0, 0.8)}</g>`).join("");
}
function sauce(cx, cy, rad, color, r) {
  return `<g fill="${color}" stroke="${color}">${blob(r, cx, cy, rad, rad * 0.92, 0, 16, 0.14)}</g><g fill="#000" opacity=".18">${blob(r, cx + 3, cy + 5, rad * 0.78, rad * 0.7, 0, 12, 0.12)}</g>` + dome(cx, cy, rad * 0.95);
}
function mince(r, pts, c = "#7a3a24") {
  return pts.map(([x, y, k]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(5 + k * 4)}" fill="${k > 0.5 ? c : "#92492b"}"/><circle cx="${f(x - 1.5)}" cy="${f(y - 2)}" r="${f(1.8 + k)}" fill="#c7805a" opacity=".6"/>`).join("");
}
function beans(r, pts) {
  return pts.map(([x, y, k]) => `<g transform="rotate(${f(k * 180)} ${f(x)} ${f(y)})" filter="url(#sm)"><ellipse cx="${f(x)}" cy="${f(y)}" rx="8" ry="5" fill="${k > 0.5 ? "#6d2a24" : "#82322a"}"/><ellipse cx="${f(x - 2)}" cy="${f(y - 1.5)}" rx="3.4" ry="1.4" fill="#fff" opacity=".35"/></g>`).join("");
}
function corn(r, pts) {
  return pts.map(([x, y]) => `<g filter="url(#sm)"><rect x="${f(x - 4.5)}" y="${f(y - 4.5)}" width="9" height="9" rx="3" fill="#f2bb26"/><rect x="${f(x - 2.5)}" y="${f(y - 3.5)}" width="4" height="3" rx="1.5" fill="#fbe27a"/></g>`).join("");
}
function herbs(r, pts) {
  return pts.map(([x, y, k]) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="3.6" ry="1.9" transform="rotate(${f(k * 180)} ${f(x)} ${f(y)})" fill="${k > 0.5 ? "#3f7a2e" : "#5a9a3e"}"/>`).join("");
}
function sesame(r, pts) {
  return pts.map(([x, y, k]) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="2.3" ry="1.3" transform="rotate(${f(k * 180)} ${f(x)} ${f(y)})" fill="#fff6e0"/>`).join("");
}
function potatoes(r, pts, s = 30) {
  return pts.map(([x, y, k]) => `<g filter="url(#sm)"><rect x="${f(x - s / 2)}" y="${f(y - s / 2)}" width="${s}" height="${s}" rx="9" transform="rotate(${f(k * 90)} ${f(x)} ${f(y)})" fill="url(#pot)"/><rect x="${f(x - s / 2 + 4)}" y="${f(y - s / 2 + 4)}" width="${s - 8}" height="${s - 8}" rx="6" transform="rotate(${f(k * 90)} ${f(x)} ${f(y)})" fill="#fbe9a8" opacity=".5"/>${shine(x - s * 0.2, y - s * 0.25, s * 0.25, s * 0.1, -30, 0.7)}</g>`).join("");
}
function lettuce(r, pts) {
  return pts.map(([x, y, k]) => `<g transform="rotate(${f(k * 360)} ${f(x)} ${f(y)})" filter="url(#sm)"><path d="M${f(x)} ${f(y)} c-26 -12 -32 -42 -6 -50 c8 12 28 18 26 38 c-3 13 -13 15 -20 12z" fill="${k > 0.5 ? "#6fae4c" : "#8cc464"}" stroke="#4f8f36" stroke-width="2"/><path d="M${f(x)} ${f(y)} q-6 -22 -2 -36" stroke="#d6efb8" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>`).join("");
}
function tuna(r, pts) {
  return pts.map(([x, y, k]) => `<g filter="url(#sm)"><path d="M${f(x - 18)} ${f(y)} q11 -18 25 -7 q15 11 0 22 q-15 7 -25 -15z" fill="${k > 0.5 ? "#dbbba2" : "#c9a68c"}"/><path d="M${f(x - 10)} ${f(y - 2)} q6 -6 14 -3" stroke="#f2dcc8" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>`).join("");
}
function ham(x, y, rot) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#sm)"><path d="M-44 0 c0 -28 24 -37 44 -37 s44 11 44 37 s-22 37 -44 37 s-44 -9 -44 -37z" fill="#e59a98"/><path d="M-32 0 c0 -19 17 -26 32 -26 s32 9 32 26" fill="none" stroke="#f6c6c2" stroke-width="5"/>${shine(-14, -16, 14, 4, -10, 0.55)}</g>`;
}
function straw(x, y) {
  return `<path d="M${x} ${y} L${x + 124} ${y - 124}" stroke="#d96b2a" stroke-width="13" stroke-linecap="round" filter="url(#sm)"/><path d="M${x} ${y} L${x + 124} ${y - 124}" stroke="#fff" stroke-width="13" stroke-dasharray="10 14" opacity=".75"/>`;
}

/* ---------- dishes ---------- */
const dishes = {
  "rice-bowl"(r) {
    return table("#9fb7a4", "#7f9b86") + napkin("#e9d7b9") + fork() + bowl("#e4ded4") +
      rice(r, CX - 30, CY + 20, 78) + chicken(r, scatter(r, 10, CX + 40, CY - 30, 50)) + broccoli(r, scatter(r, 6, CX + 55, CY + 50, 30)) + pepper(r, scatter(r, 5, CX - 50, CY - 55, 18), "#f2a43a") + herbs(r, scatter(r, 32, CX, CY, 100));
  },
  "curry-rice"(r) {
    return table("#c7a77f", "#b08e64") + napkin("#7f9b86") + spoon() + bowl("#2f4a5c", "#f4ead6") +
      rice(r, CX - 45, CY, 62) + sauce(CX + 38, CY + 10, 62, "#e09a2a", r) + chicken(r, scatter(r, 10, CX + 40, CY + 10, 42), "url(#chick)", 18) + herbs(r, scatter(r, 29, CX + 30, CY, 60));
  },
  "glazed-rice"(r) {
    return table("#2f3b46", "#26313a") + napkin("#c95b3b") + fork() + bowl("#1f1f22", "#f4eee0") +
      rice(r, CX, CY, 104) + chicken(r, scatter(r, 11, CX + 10, CY - 10, 52), "#b0521f", 22) + broccoli(r, scatter(r, 5, CX - 60, CY + 50, 22), 14) + sesame(r, scatter(r, 64, CX + 10, CY - 10, 60)) + herbs(r, scatter(r, 22, CX, CY - 10, 60));
  },
  "fried-rice"(r) {
    let s = table("#d7b98f", "#c2a277") + napkin("#9fb7a4") + spoon() + bowl("#e4ded4") + rice(r, CX, CY, 104, 300, "#f2dfa8");
    s += `${corn(r, scatter(r, 29, CX, CY, 90))}${scatter(r, 26, CX, CY, 90).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="#5f9a42"/>`).join("")}`;
    s += `${scatter(r, 16, CX, CY, 80).map(([x, y]) => `<rect x="${f(x - 6)}" y="${f(y - 4)}" width="12" height="8" rx="3" fill="#f2d25a"/>`).join("")}` + chicken(r, scatter(r, 8, CX, CY, 70), "url(#chick)", 16) + herbs(r, scatter(r, 29, CX, CY, 90));
    return s;
  },
  "mexican-bowl"(r) {
    return table("#e2b06a", "#cf9a52") + napkin("#2f7a6a") + fork() + bowl("#d9583b", "#f6efe2") +
      rice(r, CX - 50, CY - 30, 50) + `<circle cx="${CX + 45}" cy="${CY - 40}" r="46" fill="#5e2a22"/>` + beans(r, scatter(r, 42, CX + 45, CY - 40, 40)) +
      corn(r, scatter(r, 48, CX - 45, CY + 55, 34)) + chicken(r, scatter(r, 8, CX + 45, CY + 50, 32), "url(#chick)", 18) + tomato(r, scatter(r, 5, CX, CY + 10, 18), 10) + herbs(r, scatter(r, 35, CX, CY, 100));
  },
  chili(r) {
    return table("#3c2a22", "#33241d") + napkin("#e3c38f") + spoon() + bowl("#f2ece2", "#8d3322") +
      mince(r, scatter(r, 192, CX, CY, 100)) + beans(r, scatter(r, 48, CX, CY, 96)) + corn(r, scatter(r, 22, CX, CY, 90)) + `<circle cx="${CX + 20}" cy="${CY - 10}" r="22" fill="#fbf7ee"/>` + herbs(r, scatter(r, 29, CX + 20, CY - 10, 40));
  },
  "tomato-pasta"(r) {
    return table("#9cb0c4", "#86a0b8") + napkin("#e9d7b9") + fork() + plate() +
      sauce(CX, CY, 92, "#c9402a", r) + penne(r, scatter(r, 54, CX, CY, 86)) + mince(r, scatter(r, 48, CX, CY, 80), "#8a3b26") + herbs(r, scatter(r, 48, CX, CY, 90)) + `${scatter(r, 22, CX, CY, 70).map(([x, y]) => `<rect x="${f(x)}" y="${f(y)}" width="7" height="3" fill="#fff3d2"/>`).join("")}`;
  },
  "pesto-pasta"(r) {
    return table("#d8c4a6", "#c8b190") + napkin("#a8463a") + fork() + plate() +
      sauce(CX, CY, 92, "#7da24a", r) + penne(r, scatter(r, 54, CX, CY, 86), "#4f7a2a") + chicken(r, scatter(r, 10, CX, CY, 70), "url(#chick)", 18) + tomato(r, scatter(r, 6, CX, CY, 80), 9) + `${scatter(r, 32, CX, CY, 80).map(([x, y]) => `<rect x="${f(x)}" y="${f(y)}" width="7" height="3" fill="#fff3d2"/>`).join("")}`;
  },
  "creamy-pasta"(r) {
    return table("#4a5d6b", "#41525e") + napkin("#e3c38f") + fork() + plate() +
      sauce(CX, CY, 94, "#f2d58a", r) + penne(r, scatter(r, 58, CX, CY, 88), "#e0b452") + chicken(r, scatter(r, 10, CX, CY, 70), "url(#chick)", 18) + herbs(r, scatter(r, 42, CX, CY, 90)) + `${scatter(r, 48, CX, CY, 80).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="2" fill="#5a4a3a"/>`).join("")}`;
  },
  lasagne(r) {
    const layer = (y, c) => `<rect x="${CX - 92}" y="${y}" width="184" height="16" fill="${c}"/>`;
    return table("#b8c6a2", "#a6b68e") + napkin("#c95b3b") + fork() + plate() +
      `<g filter="url(#sh)"><rect x="${CX - 92}" y="${CY - 66}" width="184" height="132" rx="10" fill="#f0c56d"/>${layer(CY - 50, "#c9402a")}${layer(CY - 18, "#f8e7b8")}${layer(CY + 14, "#c9402a")}${layer(CY + 44, "#f8e7b8")}<rect x="${CX - 92}" y="${CY - 66}" width="184" height="30" rx="10" fill="#e6a94a"/>${scatter(r, 29, CX, CY - 52, 80, 12).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="#c4772a" opacity=".7"/>`).join("")}</g>` + herbs(r, scatter(r, 22, CX, CY - 50, 80, 12));
  },
  "potato-plate"(r) {
    return table("#a9bfb6", "#93aba1") + napkin("#e9d7b9") + fork() + plate() +
      potatoes(r, scatter(r, 21, CX - 40, CY + 20, 66)) + chicken(r, scatter(r, 8, CX + 50, CY - 30, 40), "url(#chick)", 24) + broccoli(r, scatter(r, 5, CX + 60, CY + 55, 24), 15) + herbs(r, scatter(r, 48, CX - 40, CY + 20, 70));
  },
  shawarma(r) {
    return table("#e7c9a0", "#d6b383") + napkin("#2f4a5c") + fork() + plate() +
      rice(r, CX - 45, CY + 10, 62, 180, "#fbe9b0") + `${scatter(r, 16, CX + 45, CY - 20, 46).map(([x, y, k]) => `<rect x="${f(x - 27)}" y="${f(y - 7)}" width="54" height="14" rx="6" transform="rotate(${f(k * 180)} ${f(x)} ${f(y)})" fill="${k > 0.5 ? "#b5652e" : "#9c5426"}" filter="url(#sm)"/>`).join("")}` +
      `<circle cx="${CX + 55}" cy="${CY + 60}" r="26" fill="#f4f6ef"/>` + herbs(r, scatter(r, 16, CX + 55, CY + 60, 18)) + tomato(r, scatter(r, 5, CX - 20, CY - 70, 20), 10) + cucumber(r, scatter(r, 5, CX - 70, CY - 40, 20), 10);
  },
  salad(r) {
    return table("#f0d9b4", "#e2c697") + napkin("#7f9b86") + fork() + bowl("#ffffff", "#f7f4ec") +
      lettuce(r, scatter(r, 26, CX, CY, 90)) + tomato(r, scatter(r, 10, CX, CY, 80), 11) + cucumber(r, scatter(r, 10, CX, CY, 80), 11) + tuna(r, scatter(r, 13, CX + 10, CY - 10, 40)) + bread(CX + 150, CY + 90, -20, 0.55);
  },
  "overnight-oats"(r) {
    return table("#c9d8d0", "#b5c8be") + napkin("#e9d7b9") + spoon() + jar() + oats(r, CX, CY, 104, "#eadbbe", 80) +
      `<circle cx="${CX}" cy="${CY}" r="104" fill="#f7f1e6" opacity=".55"/>` + banana(r, scatter(r, 8, CX - 30, CY - 20, 50)) + berries(r, scatter(r, 22, CX + 30, CY + 30, 50)) + pb(CX - 20, CY + 60) + jarTop();
  },
  "oats-bowl"(r) {
    return table("#e8c6a0", "#d9b385") + napkin("#9fb7a4") + spoon() + bowl("#cfe0e6", "#f2e6cf") + oats(r, CX, CY, 108) +
      banana(r, scatter(r, 10, CX - 40, CY - 20, 46)) + berries(r, scatter(r, 19, CX + 40, CY + 30, 46)) + granola(r, scatter(r, 16, CX + 30, CY - 50, 30)) + pb(CX - 30, CY + 60);
  },
  "baked-oats"(r) {
    return table("#a7b9c8", "#93a8b9") + napkin("#e9d7b9") + spoon() +
      `<rect x="${CX - 120}" y="${CY - 96}" width="240" height="192" rx="34" fill="#f4f1ea" filter="url(#sh)"/><rect x="${CX - 104}" y="${CY - 80}" width="208" height="160" rx="24" fill="#c98e4e"/>` +
      `${scatter(r, 112, CX, CY, 96, 70).map(([x, y, k]) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="5" ry="3.5" fill="${k > 0.5 ? "#b47a3c" : "#dba765"}"/>`).join("")}` + banana(r, scatter(r, 10, CX, CY, 80, 50), 14) + berries(r, scatter(r, 16, CX, CY, 80, 50));
  },
  "skyr-bowl"(r) {
    return table("#b6c7d6", "#a2b6c8") + napkin("#e9d7b9") + spoon() + bowl("#f2ece2", "#ffffff") + smooth(CX, CY, 112, "#fbfaf6", "#e8e4dc") +
      strawberries(r, scatter(r, 6, CX - 40, CY - 30, 40)) + berries(r, scatter(r, 19, CX + 45, CY - 20, 36)) + banana(r, scatter(r, 6, CX + 30, CY + 50, 30), 13) + granola(r, scatter(r, 19, CX - 40, CY + 50, 34));
  },
  "cheesecake-bowl"(r) {
    return table("#e6c3c8", "#d8adb3") + napkin("#9fb7a4") + spoon() + bowl("#ffffff", "#fbf6ef") + smooth(CX, CY, 112, "#fff7ea", "#efe2cc") +
      `${scatter(r, 64, CX, CY + 40, 70, 40).map(([x, y, k]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4 + k * 3)}" fill="${k > 0.5 ? "#c99a5e" : "#dcb57a"}"/>`).join("")}` + berries(r, scatter(r, 26, CX, CY - 30, 70, 40), ["#c9374a", "#a52a3c", "#3d3a7a"]) + strawberries(r, scatter(r, 5, CX, CY - 20, 50, 30));
  },
  "cottage-bowl"(r) {
    return table("#c4d3b2", "#b1c39d") + napkin("#e9d7b9") + spoon() + bowl("#e2eef2", "#ffffff") + cottage(r, CX, CY, 112) +
      tomato(r, scatter(r, 8, CX + 30, CY - 30, 50), 11) + cucumber(r, scatter(r, 8, CX - 40, CY + 30, 46), 11) + herbs(r, scatter(r, 48, CX, CY, 100));
  },
  "twarog-bowl"(r) {
    return table("#d9c3e0", "#c8afd1") + napkin("#e9d7b9") + spoon() + bowl("#ffffff", "#fbfaf6") + cottage(r, CX, CY, 112, 50) +
      strawberries(r, scatter(r, 6, CX - 30, CY - 20, 50)) + berries(r, scatter(r, 19, CX + 40, CY + 20, 46)) + `<path d="M${CX - 70} ${CY + 60} q30 -20 60 0 t60 0" fill="none" stroke="#e6a23a" stroke-width="6" stroke-linecap="round" opacity=".85"/>`;
  },
  pudding(r) {
    return table("#e9d6bf", "#dcc4a6") + napkin("#7f9b86") + spoon() + bowl("#f2ece2", "#6b3f26") + smooth(CX, CY, 112, "#7a4a2c", "#a2704c") +
      banana(r, scatter(r, 10, CX, CY, 70), 15) + `${scatter(r, 32, CX, CY, 80).map(([x, y]) => `<rect x="${f(x)}" y="${f(y)}" width="6" height="4" rx="1" fill="#3a2214"/>`).join("")}`;
  },
  shake(r) {
    return table("#f2c7a8", "#e6b18c") + napkin("#9fb7a4") +
      `<circle cx="${CX}" cy="${CY}" r="96" fill="#eef3f4" filter="url(#sh)"/><circle cx="${CX}" cy="${CY}" r="86" fill="#d8b48e"/>` + smooth(CX, CY, 80, "#e6c9a6", "#f5e6d2") +
      `${scatter(r, 16, CX, CY, 60).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="3" fill="#fff" opacity=".6"/>`).join("")}` + `<circle cx="${CX}" cy="${CY}" r="96" fill="url(#glass)"/>` + straw(CX + 10, CY - 10) + banana(r, [[CX - 150, CY + 100, 0], [CX - 120, CY + 115, 0], [CX - 135, CY + 75, 0]], 16);
  },
  "eggs-toast"(r) {
    return table("#a9c2c9", "#94b0b8") + napkin("#e9d7b9") + fork() + plate() +
      egg(CX - 30, CY - 34, 1, -10) + egg(CX + 40, CY + 4, 0.95, 20) + bread(CX - 40, CY + 64, -12, 0.8) + tomato(r, scatter(r, 5, CX + 60, CY - 70, 16), 11) + cucumber(r, scatter(r, 5, CX + 70, CY + 80, 16), 11) + `${scatter(r, 22, CX, CY - 10, 70).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.6" fill="#2a2622"/>`).join("")}`;
  },
  omelette(r) {
    return table("#f0d0a0", "#e2bc86") + napkin("#2f7a6a") + fork() + plate() +
      `<g filter="url(#sh)"><path d="M${CX - 110} ${CY} a110 74 0 0 1 220 0 z" fill="#f7cf5c"/><path d="M${CX - 110} ${CY} a110 74 0 0 1 220 0" fill="none" stroke="#e6ad3a" stroke-width="6"/></g>` +
      `${scatter(r, 29, CX, CY - 30, 80, 30).map(([x, y, k]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(3 + k * 4)}" fill="${k > 0.5 ? "#f3a9a4" : "#e6ad3a"}" opacity=".85"/>`).join("")}` + herbs(r, scatter(r, 35, CX, CY - 30, 90, 34)) + bread(CX - 10, CY + 74, 82, 0.62) + tomato(r, [[CX + 80, CY + 64, 0]], 13);
  },
  pancakes(r) {
    const cake = (y, rr) => `<circle cx="${CX}" cy="${y}" r="${rr}" fill="#d99a4e"/><circle cx="${CX}" cy="${y}" r="${rr - 8}" fill="#e8b46a"/>`;
    return table("#b9cbe0", "#a5bad3") + napkin("#e9d7b9") + fork() + plate() +
      `<g filter="url(#sh)">${cake(CY + 10, 104)}${cake(CY + 4, 100)}${cake(CY - 2, 96)}</g>` + `<path d="M${CX - 60} ${CY - 30} q60 -40 120 0 q-20 40 -60 50 q-40 -10 -60 -50z" fill="#c9701e" opacity=".55"/>` +
      berries(r, scatter(r, 19, CX, CY - 10, 54)) + banana(r, scatter(r, 6, CX, CY + 20, 40), 13) + `<rect x="${CX - 18}" y="${CY - 30}" width="36" height="20" rx="4" fill="#fff4cf"/>`;
  },
  "french-toast"(r) {
    return table("#d7c0e2", "#c6acd4") + napkin("#e9d7b9") + fork() + plate() +
      bread(CX - 40, CY - 6, -16, 1, "#e2a85a") + bread(CX + 40, CY + 16, 14, 1, "#dda052") + strawberries(r, scatter(r, 6, CX, CY + 10, 70)) + berries(r, scatter(r, 16, CX, CY, 80)) +
      `${scatter(r, 48, CX, CY, 90).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.8" fill="#fffaf0"/>`).join("")}`;
  },
  wrap(r) {
    return table("#c6d7b9", "#b3c8a3") + napkin("#d9583b") + plate() +
      wrapHalf(CX - 40, CY - 34, -12, ["#7cb85a", "#e2483a", "#e8b878", "#fff6e0"]) + wrapHalf(CX + 20, CY + 46, 8, ["#94c96e", "#c98a4a", "#f2d25a", "#fff6e0"]) + tomato(r, [[CX + 100, CY - 70, 0]], 12) + `<circle cx="${CX - 100}" cy="${CY + 84}" r="22" fill="#f4f6ef" filter="url(#sm)"/>`;
  },
  sandwich(r) {
    return table("#e6c49a", "#d6af80") + napkin("#2f4a5c") + plate() +
      `<g transform="translate(${CX - 10} ${CY}) rotate(-10) scale(1.2)" filter="url(#sh)"><path d="M-100 70 L100 -70 L100 70 Z" fill="#b47233"/><path d="M-88 62 L92 -60 L92 62 Z" fill="#f1d29a"/><path d="M-96 74 L104 -66" stroke="#7cb85a" stroke-width="10"/><path d="M-90 80 L108 -58" stroke="#e9a3a0" stroke-width="8"/><path d="M-84 86 L110 -50" stroke="#f5d06a" stroke-width="6"/></g>` +
      tomato(r, [[CX + 90, CY + 70, 0], [CX + 60, CY + 90, 0]], 12) + cucumber(r, [[CX - 90, CY - 70, 0], [CX - 64, CY - 86, 0]], 11);
  },
  "tortilla-pizza"(r) {
    return table("#a6bfc8", "#92aeb8") + napkin("#e9d7b9") + tortillaRound(CX, CY, 132, r) +
      sauce(CX, CY, 108, "#c9402a", r) + `${scatter(r, 35, CX, CY, 100).map(([x, y, k]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(10 + k * 8)}" fill="#fbf2d8" opacity=".95"/>`).join("")}` +
      `${scatter(r, 16, CX, CY, 96).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="11" fill="#e9a3a0" stroke="#d98a86" stroke-width="2"/>`).join("")}` + herbs(r, scatter(r, 42, CX, CY, 100)) +
      `<path d="M${CX} ${CY} L${CX} ${CY - 132} M${CX} ${CY} L${CX + 114} ${CY + 66} M${CX} ${CY} L${CX - 114} ${CY + 66}" stroke="#c49a5a" stroke-width="3" opacity=".6"/>`;
  },
  "tuna-bread"(r) {
    return table("#b8c6a2", "#a6b68e") + napkin("#e9d7b9") + plate() + bread(CX - 50, CY - 10, -10, 1.05) + bread(CX + 60, CY + 20, 12, 0.95) +
      tuna(r, scatter(r, 16, CX - 50, CY - 10, 30)) + cucumber(r, scatter(r, 5, CX + 60, CY + 20, 26), 12) + herbs(r, scatter(r, 32, CX, CY, 90));
  },
  "ham-bread"(r) {
    return table("#f0d9b4", "#e2c697") + napkin("#7f9b86") + plate() + bread(CX - 54, CY - 4, -8, 1.05) + bread(CX + 56, CY + 10, 10, 1) +
      ham(CX - 54, CY - 6, -8) + ham(CX + 56, CY + 8, 10) + `${scatter(r, 10, CX + 56, CY + 8, 20).map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="9" fill="#fbf7ee"/>`).join("")}` + tomato(r, [[CX, CY + 104, 0]], 12);
  },
  "tuna-rice"(r) {
    return table("#9cb0c4", "#86a0b8") + napkin("#e9d7b9") + fork() + bowl("#e4ded4") + rice(r, CX, CY + 10, 100) +
      tuna(r, scatter(r, 22, CX + 20, CY - 20, 46)) + corn(r, scatter(r, 29, CX - 50, CY + 40, 30)) + cucumber(r, scatter(r, 6, CX + 50, CY + 56, 26), 11) + sesame(r, scatter(r, 48, CX, CY, 80));
  },
};

/** A clean generic plate for meals that match nothing. */
dishes.plate = dishes["rice-bowl"];

let n = 0;
for (const [name, draw] of Object.entries(dishes)) {
  if (name === "plate") continue;
  const r = rng([...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}<g transform="translate(${CX} ${CY}) scale(1.14) translate(${-CX} ${-CY})">${draw(r)}</g><rect width="${W}" height="${H}" fill="url(#light)"/><rect width="${W}" height="${H}" fill="url(#vig)"/><rect width="${W}" height="${H}" filter="url(#grain)" opacity=".32"/></svg>`;
  writeFileSync(`${OUT}/${name}.svg`, svg);
  n++;
}
console.log(`wrote ${n} images to ${OUT}`);
