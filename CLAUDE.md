# BFF Primordial Soup: notes for Claude Code

Single-file static web app (`index.html`) simulating the BFF primordial soup from the Computational Life paper
(arXiv:2406.19108). No build step, no dependencies. Open the file or serve the folder statically.

## Architecture (all in index.html)

1. `<script id="core">`: the simulation core. Pure functions, no DOM:
   - `bffRun(tape, offset, maxSteps)`: runs one 128-byte tape in place and returns the instruction count
     (no-ops excluded). Semantics match cubff `bff_noheads` (heads and IP start at 0; heads wrap mod 128;
     unmatched bracket or IP leaving the tape halts; 8,192 step limit counts no-ops too).
   - `makeRng(seed)`: sfc32 PRNG. `initSoup`, `mutateSoup` (geometric skipping), `pairMixed` (Fisher–Yates),
     `pairGrid` (cubff-style: each program in random order picks one neighbour within Chebyshev distance 2;
     pair forms only if both are free), `packPairs` / `unpackPairs`.
   - The same text is reused three ways: run on the page, injected into Web Workers via a Blob URL, and loaded by
     `tools/headless.js` through `vm`. **Keep it self-contained** (no references to page globals) so all three
     stay in sync.
2. Main IIFE script: state object `S`, worker pool, epoch loop, sampling, rendering, controls.

## Epoch order (determinism depends on this)

`mutateSoup` → pair (`pairMixed` or `pairGrid`) → pack pairs into worker buffers → workers run tapes →
unpack. All randomness comes from `S.rng` on the main thread, in that order; workers are deterministic.
Same seed, soup size and mutation rate give identical runs regardless of thread count, and match
`tools/headless.js`. Don't add `S.rng` calls elsewhere, or seeds stop reproducing.

## Gotchas

- **Never edit `S.soup` while an epoch is in flight.** Workers hold packed copies and `unpackPairs` overwrites the
  soup when they return. UI actions that change the soup (Inoculate) go through `S.pendingEdit`, applied at the
  start of the next `stepEpoch`.
- Reset waits for the loop to stop (`stopAndWait`) before reallocating buffers.
- Workers are created from a Blob URL and pinged with a 3-second timeout; on failure, the page runs on the main
  thread with `setTimeout` yields.
- Sampling (about once a second while running) copies the soup, then computes byte entropy, deflate size via
  `CompressionStream('deflate-raw')` and an exact-copy census (53-bit FNV-style hash). History is halved past
  1,500 points.
- Takeover is flagged when the sampled mean instructions per interaction exceeds 1,000 (pre-life ~60–250,
  post-takeover ~1,200–1,800). `S.inoculatedAt` marks runs that were seeded by hand.
- Rendering: each program is an 8×8 block of pixels, written into a `Uint32Array` view of one `ImageData`, with
  adaptive throttling. Mixed-mode layouts: 4,096 → 64×64, 16,384 → 128×128, 65,536 → 256×256,
  131,072 → 512×256 programs.
- Theming uses CSS custom properties with `prefers-color-scheme` and `[data-theme]` overrides. The soup canvas is
  always dark. Byte colours are defined once in `OPINFO` / `ZERO_COLOR`.
- `EVOLVED` is a base64 blob of 128 programs (8 KB) sampled from a cubff soup after takeover. It is used only by
  Inoculate.

## Likely next tasks

- Add this app to the owner's portal site (link card or route). As a static file it can live in a subfolder
  (e.g. `/bff-soup/index.html`) or be served by GitHub Pages from this repo's root.
- Ideas: export/import soup snapshots; plant a chosen program; per-slot "who copied whom" lineage; colour by
  species; a Forth variant (the paper's Forth soups replicate much faster).
