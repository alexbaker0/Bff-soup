# BFF Primordial Soup

An in-browser version of the self-replicator experiment from
[*Computational Life: How Well-formed, Self-replicating Programs Emerge from Simple Interaction*](https://arxiv.org/abs/2406.19108)
(Agüera y Arcas et al., 2024).

A soup of random 64-byte programs is run epoch after epoch. Each epoch, programs are paired, joined into a
128-byte tape, executed, and split back. Code and data share the tape, so programs can rewrite themselves and
each other. Nobody writes a replicator, yet one usually appears and takes over.

**Run it:** open `index.html` in a browser. It is a single self-contained file with no build step and no dependencies
(Google Fonts load if online, with system-font fallbacks otherwise).

## Features

- Well-mixed soups of 4,096 to 131,072 programs (paper size), or 2D grids (120 × 68, and the paper's 240 × 135) where
  programs only meet neighbours within 2 cells.
- Multi-threaded: tapes are executed in Web Workers (one per core, up to 8), with a main-thread fallback.
- Deterministic: the same soup size, seed and mutation rate always produce the same run, whatever the thread count.
- Live view of every byte, colour-coded by instruction.
- Traces of high-order entropy and instructions per interaction, with the takeover epoch marked.
- Inspector for any program slot, and a census of the most common exact programs.
- "Inoculate with evolved replicators": seeds 2% of the soup (or a 9 × 9 grid patch) with programs from a soup in
  which replicators had already emerged. Takeover usually follows within a few hundred epochs.

## The BFF language

Two heads (`head0`, `head1`) and an instruction pointer all start at 0 on the 128-byte tape. Execution stops after
8,192 steps, when the pointer runs off the end, or on an unmatched bracket. Heads wrap around the tape.

| Byte | Effect |
|---|---|
| `<` `>` | move head 0 left / right |
| `{` `}` | move head 1 left / right |
| `+` `-` | increment / decrement the byte at head 0 |
| `.` | copy byte at head 0 to head 1 |
| `,` | copy byte at head 1 to head 0 |
| `[` | if byte at head 0 is zero, jump past the matching `]` |
| `]` | if byte at head 0 is non-zero, jump back to the matching `[` |
| anything else | no-op (data) |

This matches the `bff_noheads` language in Google's [cubff](https://github.com/paradigms-of-intelligence/cubff),
including bracket matching, step counting and the mutation rate (1/4096 per byte per epoch).

## What to watch

Before takeover, the mean instructions per interaction sits around 60–250 and high-order entropy (Shannon entropy
minus compressed bits per byte) stays under about 1 bit. When replicators take over, instructions per interaction
jump to roughly 1,200–1,800 and entropy rises to 3–5 bits. The page flags takeover when instructions per interaction
exceed 1,000.

Emergence is random. With cubff at 131,072 programs, seed 0 took over around epoch 2,400. In the paper, roughly 40% of
runs at that size took over within 16,000 epochs. Smaller soups run faster per epoch but replicators arise less often.

Entropy here is measured with deflate (the browser's `CompressionStream`) rather than brotli, so values differ slightly
from the paper's.

## Headless runs

`tools/headless.js` runs the identical simulation core (it loads the `<script id="core">` block from `index.html`) in
Node, which is handy for scanning seeds:

```sh
node tools/headless.js --mode mixed --size 65536 --seed 7 --epochs 20000 --every 250
node tools/headless.js --mode grid --size 240x135 --seed 3 --save soup.bin
```

A seed that takes over headlessly will take over at the same epoch in the browser with the same settings.

## Files

- `index.html`: the whole app (simulation core, worker bootstrap, UI).
- `tools/headless.js`: command-line runner using the same core.
- `CLAUDE.md`: architecture notes for working on the code.

## Credits and licence

Based on Agüera y Arcas, Alakuijala, Evans, Laurie, Mordvintsev, Niklasson, Randazzo and Versari,
*Computational Life* (2024), and Google's cubff (Apache-2.0). The interpreter is an independent JavaScript
implementation of cubff's `bff_noheads` semantics. The 128 programs used by "Inoculate" were sampled from a soup
evolved with cubff (`bff_noheads`, 131,072 programs, seed 0, epoch 3,200).

Released under the Apache License 2.0; see `LICENSE` and `NOTICE`.
