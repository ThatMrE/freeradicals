#!/usr/bin/env node
/**
 * Generates site/field.svg — the background animation.
 *
 *   node tools/build-field.mjs [seed]
 *
 * What it draws is the thing the project is named after. A radical is a
 * molecule with an unpaired electron, which makes it reactive: it hits a stable
 * pair, breaks the bond, and what leaves the collision is *more* radicals than
 * arrived. Do that in a room full of pairs and one collision becomes a chain.
 *
 * So the animation is not decoration drawn to look like physics — it is a
 * simulation, run once here, with the result frozen into the file. Each radical
 * really does travel to the nearest unbroken pair, arrive when the distance and
 * its speed say it should, and split that pair into two more radicals which go
 * hunting. Change the seed and you get a different, equally real, cascade.
 *
 * Why SMIL rather than CSS or a canvas: the site is served under a policy with
 * no script-src at all and no 'unsafe-inline' for styles, and that policy
 * applies to this file too when the browser fetches it. Animation elements are
 * markup — no script, no stylesheet — so the background moves without the page
 * giving up the promise that it cannot execute anything.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'field.svg');

const T = 26;            // seconds per loop
const SIZE = 100;        // viewBox units, square, cropped to the viewport
const SPEED = 11;        // units per second
const PAIRS = 80;        // stable molecules scattered at the start
const MAX_RADICALS = 70; // where the chain is cut off so the loop can breathe
const BRANCH_UNTIL = 0.62 * T;
const FADE = 0.3;        // seconds to appear and to disappear

const ACCENT = '#7c8cff';
const HOT = '#9ad0ff';

/** Deterministic PRNG, so the same seed always draws the same cascade. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seed = Number(process.argv[2] ?? 20260916);
const rand = mulberry32(seed);
const num = (n) => Number(n.toFixed(2));

/* ---------- the simulation ---------- */

const pairs = Array.from({ length: PAIRS }, () => ({
  x: rand() * SIZE,
  y: rand() * SIZE,
  angle: rand() * Math.PI,
  brokenAt: null,
}));

const radicals = [];
const flashes = [];

/** The nearest pair still intact, far enough away that the trip is visible. */
function nextTarget(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const pair of pairs) {
    if (pair.brokenAt !== null) continue;
    const dist = Math.hypot(pair.x - x, pair.y - y);
    if (dist < 7 || dist > 55 || dist >= bestDist) continue;
    best = pair;
    bestDist = dist;
  }
  return best && { pair: best, dist: bestDist };
}

/** Where a radical that finds nothing to hit ends up: off the edge, fading. */
function driftEnd(x, y, heading) {
  const reach = 40 + rand() * 30;
  return { x: x + Math.cos(heading) * reach, y: y + Math.sin(heading) * reach };
}

// Initiation: one radical enters from outside and goes looking.
const entry = { x: -6, y: 20 + rand() * 60 };
const queue = [{ x: entry.x, y: entry.y, born: 0.4, heading: 0.2 }];

while (queue.length && radicals.length < MAX_RADICALS) {
  queue.sort((a, b) => a.born - b.born);
  const r = queue.shift();
  const found = r.born < BRANCH_UNTIL ? nextTarget(r.x, r.y) : null;

  if (found) {
    const arrive = r.born + found.dist / SPEED;
    radicals.push({ x0: r.x, y0: r.y, x1: found.pair.x, y1: found.pair.y, born: r.born, dies: arrive });
    found.pair.brokenAt = arrive;
    flashes.push({ x: found.pair.x, y: found.pair.y, t: arrive });

    // The bond breaks, and both halves leave as radicals: one collision in,
    // two out, which is what makes a chain a chain rather than a queue.
    const spread = 0.5 + rand() * 0.9;
    for (const side of [-1, 1]) {
      queue.push({
        x: found.pair.x,
        y: found.pair.y,
        born: arrive + 0.05,
        heading: found.pair.angle + side * spread,
      });
    }
  } else {
    const end = driftEnd(r.x, r.y, r.heading);
    const dies = Math.min(r.born + Math.hypot(end.x - r.x, end.y - r.y) / SPEED, T - FADE);
    if (dies > r.born + 0.4) radicals.push({ x0: r.x, y0: r.y, x1: end.x, y1: end.y, born: r.born, dies });
  }
}

// Whatever is still queued when the cap is reached drifts away unreacted.
for (const r of queue) {
  const end = driftEnd(r.x, r.y, r.heading);
  const dies = Math.min(r.born + Math.hypot(end.x - r.x, end.y - r.y) / SPEED, T - FADE);
  if (dies > r.born + 0.4) radicals.push({ x0: r.x, y0: r.y, x1: end.x, y1: end.y, born: r.born, dies });
}

/* ---------- the drawing ---------- */

const loop = `dur="${T}s" repeatCount="indefinite" calcMode="linear"`;

/**
 * A keyframe track: [second, value] stops in, `values`/`keyTimes` out.
 *
 * SMIL requires keyTimes to start at 0 and end at 1, with one entry per value,
 * strictly increasing. Miss any of that and the animation is not an error you
 * can see — the whole element is silently dropped and the drawing simply never
 * moves, which is exactly the bug this helper exists to make impossible.
 */
function track(stops) {
  const clean = [];
  let last = -1;
  for (const [second, value] of stops) {
    const at = Math.min(1, Math.max(0, second / T));
    const time = Math.min(1, Math.max(at, last + 0.0002));
    if (time <= last) continue;
    clean.push([time, value]);
    last = time;
  }
  if (clean[0][0] > 0) clean.unshift([0, clean[0][1]]);
  if (clean[clean.length - 1][0] < 1) clean.push([1, clean[clean.length - 1][1]]);
  return {
    values: clean.map(([, v]) => v).join(';'),
    keyTimes: clean.map(([t]) => num(t)).join(';'),
  };
}

/** One `<animate>` element from a track. */
function animate(attribute, stops) {
  const { values, keyTimes } = track(stops);
  return `<animate attributeName="${attribute}" values="${values}" keyTimes="${keyTimes}" ${loop}/>`;
}

const pairSvg = pairs.map((p) => {
  const dx = Math.cos(p.angle) * 0.95;
  const dy = Math.sin(p.angle) * 0.95;
  const body = `<line x1="${num(p.x - dx)}" y1="${num(p.y - dy)}" x2="${num(p.x + dx)}" y2="${num(p.y + dy)}" stroke="${ACCENT}" stroke-width="0.18" stroke-opacity="0.55"/>`
    + `<circle cx="${num(p.x - dx)}" cy="${num(p.y - dy)}" r="0.45" fill="${ACCENT}"/>`
    + `<circle cx="${num(p.x + dx)}" cy="${num(p.y + dy)}" r="0.45" fill="${ACCENT}"/>`;

  // An unbroken pair just sits there; a broken one goes out when it is hit.
  if (p.brokenAt === null) return `<g opacity="0.4">${body}</g>`;
  return `<g>${body}`
    + animate('opacity', [[0, 0.4], [p.brokenAt, 0.4], [p.brokenAt + 0.25, 0]])
    + '</g>';
}).join('\n');

const radicalSvg = radicals.map((r) => {
  const here = `${num(r.x0)},${num(r.y0)}`;
  const there = `${num(r.x1)},${num(r.y1)}`;
  const move = track([[0, here], [r.born, here], [r.dies, there], [T, there]]);
  return '<g opacity="0">'
    + `<circle r="0.55" fill="${HOT}"/>`
    + `<circle r="1.7" fill="${HOT}" opacity="0.1"/>`
    + animate('opacity', [
      [0, 0], [r.born, 0], [r.born + FADE, 1], [r.dies, 1], [r.dies + FADE, 0],
    ])
    + '<animateTransform attributeName="transform" type="translate" '
    + `values="${move.values}" keyTimes="${move.keyTimes}" ${loop}/>`
    + '</g>';
}).join('\n');

const flashSvg = flashes.map((f) => (
  `<circle cx="${num(f.x)}" cy="${num(f.y)}" r="0" fill="none" stroke="${HOT}" stroke-width="0.15" opacity="0">`
  + animate('r', [[0, 0], [f.t, 0], [f.t + 0.1, 0.8], [f.t + 0.9, 3.4]])
  + animate('opacity', [[0, 0], [f.t, 0], [f.t + 0.1, 0.6], [f.t + 0.9, 0]])
  + '</circle>'
)).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}"
  preserveAspectRatio="xMidYMid slice" role="presentation">
<!-- Generated by tools/build-field.mjs (seed ${seed}). A radical chain reaction,
     simulated once and frozen: ${radicals.length} radicals, ${flashes.length} collisions,
     ${pairs.filter((p) => p.brokenAt !== null).length} of ${PAIRS} pairs broken, over ${T}s.
     Animated with SMIL because the site serves no scripts and no inline styles. -->
${pairSvg}
${flashSvg}
${radicalSvg}
</svg>
`;

writeFileSync(OUT, svg);
console.log(
  `field.svg  ${radicals.length} radicals, ${flashes.length} collisions, `
  + `${pairs.filter((p) => p.brokenAt !== null).length}/${PAIRS} pairs broken, `
  + `${(svg.length / 1024).toFixed(1)} KB`,
);
