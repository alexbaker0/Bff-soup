#!/usr/bin/env node
/*
 * Headless BFF soup runner.
 *
 * Uses the exact simulation core embedded in ../index.html (the <script id="core"> block),
 * so results match the browser page for the same mode, size, seed and mutation rate.
 *
 * Usage:
 *   node tools/headless.js [--mode mixed|grid] [--size 16384 | --size 240x135]
 *                          [--seed 1] [--epochs 20000] [--mut 0.000244140625]
 *                          [--every 250] [--save soup.bin]
 *
 * Prints: epoch, mean instructions per interaction, high-order entropy (deflate),
 * share of the most common exact program. Stops early once replicators take over
 * (mean instructions per interaction above 1000), unless --no-stop is given.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

// ---- load the shared core from index.html ----
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) { console.error('Could not find <script id="core"> in index.html'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\n;this.C = { BFF_OP, bffRun, makeRng, initSoup, mutateSoup, pairMixed, pairGrid, packPairs, unpackPairs };', ctx);
const C = ctx.C;

// ---- args ----
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const mode = opt('mode', 'mixed');
const sizeArg = opt('size', mode === 'grid' ? '240x135' : '16384');
const seed = +opt('seed', 1);
const epochs = +opt('epochs', 20000);
const mut = +opt('mut', 1 / 4096);
const every = +opt('every', 250);
const save = opt('save', null);
const noStop = args.includes('--no-stop');

let w, h;
if (mode === 'grid') [w, h] = sizeArg.split('x').map(Number);
else { const n = +sizeArg; w = Math.round(Math.sqrt(n)); h = n / w; if (!Number.isInteger(h)) { w = n; h = 1; } }
const n = w * h;

// ---- measurements (same definitions as the page) ----
function measure(soup) {
  const cnt = new Float64Array(256);
  for (let i = 0; i < soup.length; i++) cnt[soup[i]]++;
  let H = 0;
  for (let b = 0; b < 256; b++) if (cnt[b]) { const p = cnt[b] / soup.length; H -= p * Math.log2(p); }
  const hoe = H - zlib.deflateRawSync(soup).length * 8 / soup.length;
  const map = new Map(); let top = 0;
  for (let i = 0; i < n; i++) {
    const k = Buffer.from(soup.buffer, soup.byteOffset + i * 64, 64).toString('latin1');
    const v = (map.get(k) || 0) + 1; map.set(k, v); if (v > top) top = v;
  }
  return { hoe, topShare: top / n };
}

// ---- run ----
const rng = C.makeRng(seed);
const soup = C.initSoup(n, rng);
const perm = new Int32Array(n), used = new Uint8Array(n), pairs = new Int32Array(n), buf = new Uint8Array(n * 64);
console.log(`mode=${mode} size=${mode === 'grid' ? w + 'x' + h : n} seed=${seed} mut=${mut}`);
console.log('epoch\tinstr/interaction\thigh_order_entropy\ttop_share');
const t0 = Date.now();
let acc = 0, accN = 0, hit = null;
for (let e = 1; e <= epochs; e++) {
  C.mutateSoup(soup, mut, rng);
  const np = mode === 'grid' ? C.pairGrid(w, h, rng, perm, used, pairs) : C.pairMixed(n, rng, perm, pairs);
  C.packPairs(soup, pairs, 0, np, buf);
  let ops = 0;
  for (let k = 0; k < np; k++) ops += C.bffRun(buf, k * 128, 8192);
  C.unpackPairs(soup, pairs, 0, np, buf);
  acc += ops; accN += np;
  if (e % every === 0 || e === epochs) {
    const avg = acc / accN; acc = 0; accN = 0;
    const { hoe, topShare } = measure(soup);
    console.log(`${e}\t${avg.toFixed(1)}\t${hoe.toFixed(3)}\t${(topShare * 100).toFixed(3)}%`);
    if (hit == null && avg > 1000) { hit = e; if (!noStop) break; }
  }
}
console.log(hit != null ? `Replicators took over by epoch ${hit}.` : 'No takeover in this run.');
console.log(`Elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (save) { fs.writeFileSync(save, soup); console.log(`Saved soup (${n} x 64 bytes) to ${save}`); }
