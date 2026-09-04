# Radiata Stories — documentation

Reverse-engineering reference for the PlayStation 2 game *Radiata Stories*,
built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build).

Published at <https://radiatastories.github.io/docs/>.

## Running it

Requires Node 18.20+, 20.3+, or 22+.

```bash
npm install
npm run dev
```

The dev server serves the site under the `/docs` base path, so open
<http://localhost:4321/docs/> rather than the bare origin.

| Command | Does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Static build into `dist/` |
| `npm run preview` | Serve the built output locally |
| `npm run check` | Validate the EVD dataset, run its gate tests, then type-check |
| `npm run validate:evd` | Check the EVD opcode dataset's invariants |
| `npm run test:evd` | Prove each validator gate still fails when it should |

## Layout

```
src/
  content/docs/        The pages. Markdown/MDX; the file path is the URL.
    index.mdx          Landing page (splash template)
    boot-sequence/      The boot chain, five parts
    method.mdx         Evidence markers, builds, address conventions
    rmf/               The RMF message format, six parts
    evd/               The EVD event-script format, five parts
    events/            Disk file 186 and the event chain, five parts
  pages/
    evd/commands/[hex].astro
                       One page per EVD opcode, generated from the dataset
  components/
    AddrRef.astro      Inline symbol name -> per-build address popup
    SymbolTable.astro  Renders the RMF §16 symbol reference
    EvdCommandTable.astro
                       Renders the 138-opcode EVD reference
    EventTable.astro   Renders the 863-script event reference
    FilterTable.astro  Adds a live text filter to a table
    Tag.astro          The confirmed / inferred markers
  data/
    addresses.ts       Per-build addresses for the RMF code path
    evd-commands.ts    The 138 EVD opcodes (generated)
    events.json        The 863 event scripts and their verdicts (generated)
    events.ts          Types and labels for them; loads events.json (generated)
  styles/custom.css    Palette and table/prose styling
```

### Data-driven pages

Three datasets drive everything that would otherwise be transcribed by hand.

`src/data/addresses.ts` is the only place an RMF per-build address should be
written. Both the `<AddrRef>` popups and the symbol reference table read from it,
so they cannot drift apart. An `<AddrRef sym="...">` naming a key that isn't in
that file fails the build rather than rendering a dead reference.

`src/data/evd-commands.ts` holds all 138 EVD opcodes — handler symbol,
signature, per-build addresses, engine calls, bitmasks and per-field
documentation. It drives the opcode reference table, the 138 generated command
pages under `/evd/commands/`, and the sidebar entries for them, so those three
can never disagree. **It is generated — do not hand-edit it.**

Regenerate with [`scripts/build-evd-data.mjs`](scripts/build-evd-data.mjs). It
reads inputs that are not part of this repository:

```bash
node scripts/build-evd-data.mjs --source "/path/to/inputs"
```

`DOCS_SOURCE` works as an environment variable too. Every input affects the
output, so a missing one is a hard error rather than a warning — the one input
that is not among them is checked in under `scripts/inputs/`.

`npm run validate:evd` enforces the dataset's invariants against the checked-in
file alone, with none of those inputs, so it runs in CI: 138 records, numerically
sorted and unique; evidence exactly matching corpus reachability; no duplicate
or divergent form names; no orphaned or over-promising text; every record with
a debug address. `npm run test:evd` mutates a copy of the dataset once per gate
and asserts each one rejects it, so a gate that quietly stops working fails the
build.

`src/data/events.json` holds one record per shipped event script — 829 field
scripts and 34 in-battle scripts — with the map it needs, what starts it, the
save-state gate on each start, its chain edges and a verdict;
`src/data/events.ts` carries its types and loads it. Together they drive the
event reference table under `/events/reference/`. **Both are generated — do
not hand-edit them.** Regenerate from the same tree:

```bash
node scripts/build-event-data.mjs --source "/path/to/inputs"
```

It reads the event-chain analysis output (one JSON row per script) and the
symbol tables for file and map names. `npm run validate:events` checks the
checked-in file alone: the script
and file counts, numeric order, symmetric chain edges, the verdict vocabulary,
the 17 mid-chain scripts, and that every gate string is in the documented
notation.

### Evidence markers

Use `<Tag kind="confirmed" />` for something read out of disassembly or
reproduced against real data, and `<Tag kind="inferred" />` for something the
surrounding code implies but nothing has proven. See
[Method and conventions](src/content/docs/method.mdx).

## Deployment

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds the site and publishes it to GitHub Pages.

This requires the repository's **Settings → Pages → Source** to be set to
**GitHub Actions** (not "Deploy from a branch").

The pre-Starlight URLs `/docs/BootSequence/`, `/docs/rmf/` and `/docs/evd/`
redirect to their new locations, so existing links keep working.
