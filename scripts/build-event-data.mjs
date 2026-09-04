// Build src/data/events.json and events.ts — one record per shipped event
// script — from two inputs outside this repository:
//   event_chain.json    one row per script: map, starters, gates, chain
//                       edges, verdict — the output of a static walk of
//                       every event, map and NPC script read from the disc
//   evd_symbols.json    event-file and map names
//
// This script only reshapes that output: nothing here decides a verdict.
//
//   node scripts/build-event-data.mjs --source "/path/to/inputs"
//   DOCS_SOURCE="/path/to/inputs" node scripts/build-event-data.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const argIdx = process.argv.indexOf('--source');
const SOURCE =
  (argIdx !== -1 ? process.argv[argIdx + 1] : undefined) ?? process.env.DOCS_SOURCE ?? null;
if (!SOURCE) {
  console.error('cannot generate: pass --source <dir> or set DOCS_SOURCE');
  process.exit(1);
}

const CHAIN = join(SOURCE, 'docs/event_chain/event_chain.json');
const SYMBOLS = join(SOURCE, 'docs/evd_symbols.json');
// The rows go in a JSON file the TypeScript module loads as raw text. A 660 KB
// array literal inside a .ts file makes `astro check` infer its type record by
// record and run out of memory; a `?raw` import is typed as `string`.
const OUT = join(ROOT, 'src/data/events.ts');
const OUT_JSON = join(ROOT, 'src/data/events.json');

const missing = Object.entries({ CHAIN, SYMBOLS }).filter(([, p]) => !existsSync(p));
if (missing.length) {
  console.error('cannot generate: required input(s) not found');
  for (const [k, p] of missing) console.error(`  ${k.padEnd(8)} ${p}`);
  console.error(`\nsource directory: ${SOURCE}\npass --source <path> or set DOCS_SOURCE to override.`);
  process.exit(1);
}

const rows = JSON.parse(readFileSync(CHAIN, 'utf8'));
const symbols = JSON.parse(readFileSync(SYMBOLS, 'utf8').replace(/^\uFEFF/, ''));

const hexKeyed = (table) =>
  new Map(Object.entries(table).map(([k, v]) => [parseInt(k, 16), v]));
const eventNames = hexKeyed(symbols.event);
const mapNames = hexKeyed(symbols.location);

/**
 * The verdict strings are the analysis's own wording. Each is folded onto one
 * of nine classes so the table can colour and filter them; the full string is
 * kept as well.
 */
function verdictClass(verdict, inBattle) {
  if (inBattle) return 'in-battle';
  if (verdict.startsWith('standalone')) return 'standalone';
  if (verdict.startsWith('chained but self-contained')) return 'chained';
  if (verdict.startsWith('chained, only obi')) return 'cosmetic';
  if (verdict.startsWith('map-triggered')) return 'map';
  if (verdict.startsWith('generic')) return 'generic';
  if (verdict.startsWith('post-battle')) return 'battle';
  if (verdict.startsWith('NPC-launched')) return 'npc';
  if (verdict.startsWith('mid-chain')) return 'mid-chain';
  if (verdict.startsWith('root with dependencies')) return 'unresolved';
  throw new Error(`unclassified verdict: ${verdict}`);
}

/** `chains_to_guarded` entries, rendered the way event_chain.csv renders them. */
function guarded(g) {
  let s = g.to;
  if (g.guard?.length) s += `[${g.guard.join(' & ')}]`;
  if (g.other?.length) s += `{${g.other.join(' & ')}}`;
  if (g.stacked) s += '+stacked';
  if (g.note) s += ` (${g.note})`;
  return s;
}

/**
 * Gates are per launch. When several map scripts launch the same event, name
 * each source rather than pooling their conditions — the same rule
 * write_csv.py applies.
 */
function perSource(launches, sourceOf) {
  const bySrc = new Map();
  for (const l of launches) {
    const src = sourceOf(l);
    if (!bySrc.has(src)) bySrc.set(src, new Set());
    for (const g of l.gates ?? []) bySrc.get(src).add(g);
  }
  if (bySrc.size === 0) return [];
  if (bySrc.size === 1) {
    const only = [...bySrc.values()][0];
    return only.size ? [[...only].sort().join(' & ')] : [];
  }
  return [...bySrc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([src, g]) => `${src}: ${[...g].sort().join(' & ') || '-'}`);
}

const npcSource = (n) => {
  const m = /^p(\d+)_list(\d+)_(m2_\d+|m4_\d+|mC|mD)$/.exec(n.from);
  return m
    ? `person ${+m[1]} list ${+m[2]} ${m[3].replace('_', ' ')}`
    : n.from;
};

const keyOf = (k) => k.split('/').map(Number);
const records = Object.entries(rows)
  .sort(([a], [b]) => {
    const [fa, sa] = keyOf(a);
    const [fb, sb] = keyOf(b);
    return fa - fb || sa - sb;
  })
  .map(([key, r]) => {
    const inBattle = r.file >= 0x8000;
    // Disk-file-187 scripts carry bit 15; show them as the file id the
    // scripts use (0x8001 → 1 with the high-bit table).
    const fileId = inBattle ? r.file - 0x8000 : r.file;
    const launchMaps = [...new Set(r.map_launch_story.map((l) => l.map))].sort((a, b) => a - b);
    // The analysis writes one map, a list of candidate maps (a generic contact
    // event, a map-triggered event launched from several maps, an ambiguous
    // inheritance), or nothing. Always a list here.
    const maps = Array.isArray(r.map) ? r.map : r.map == null ? [] : [r.map];
    return {
      key,
      file: r.file,
      script: r.script,
      inBattle,
      label: inBattle ? `${fileId}/${r.script} (high)` : key,
      fileName: inBattle ? null : (eventNames.get(r.file) ?? null),
      ownMap: r.own_map,
      maps,
      mapNames: maps.map((m) => mapNames.get(m) ?? null),
      mapResolution: r.map_resolution,
      startedBy: r.started_by,
      predecessors: r.predecessors,
      chainsTo: r.chains_to,
      chainsToGuarded: r.chains_to_guarded.map(guarded),
      launchMaps,
      contactMaps: r.contact_maps,
      npcLaunchedBy: r.npc_launched_by,
      npcGates: perSource(r.npc_launches, npcSource),
      npcGatesOther: r.npc_gates_other,
      npcListGates: r.npc_list_gates,
      postBattleFrom: r.post_battle_from,
      preBattleMaps: r.pre_battle_maps,
      battleMaps: r.battle_maps,
      handsOffToMap: r.hands_off_to_map,
      preloadsForSuccessor: r.preloads_for_successor,
      gates: perSource(r.map_launch_story, (l) => `map ${l.map} script ${l.map_script}`),
      gatesOther: r.gates_other,
      gateNotes: r.gate_notes,
      inheritedChars: r.inherited_chars,
      setupOnlyInDebug: r.setup_only_in_debug,
      verdict: r.verdict,
      verdictClass: verdictClass(r.verdict, inBattle),
      reasons: r.reasons,
      coldStart: r.cold_start,
    };
  });

const files = [...new Set(records.map((r) => r.file))].sort((a, b) => a - b);
const counts = {};
for (const r of records) counts[r.verdictClass] = (counts[r.verdictClass] ?? 0) + 1;

const header = `/**
 * Every shipped event script — the ${records.length} scripts of disk files 186 and
 * 187 — with where it runs, what starts it, the save-state gate in front of
 * each start, and a verdict on whether it can be started on its own.
 *
 * GENERATED by scripts/build-event-data.mjs — do not hand-edit this file or
 * events.json beside it, which holds the rows. The verdicts and gates are the
 * output of a static walk over every event, map and NPC script read from the
 * USA disc; see /events/chains/ for what each column means.
 *
 * Gate notation: \`flag N set\` / \`clear\`, \`flags N..M is V\` (a run of flags
 * read as one number), \`value N is V\` / \`not V\` / \`>= V\` …, \`state:…\` for a
 * save-state test that is not a flag, \`other:…\` for a runtime test, and
 * \`computed:…\` for a value the launching script wrote itself before testing.
 */

export type EventVerdictClass =
  | 'standalone'
  | 'chained'
  | 'cosmetic'
  | 'map'
  | 'generic'
  | 'battle'
  | 'npc'
  | 'mid-chain'
  | 'unresolved'
  | 'in-battle';

export interface EventRecord {
  /** "402/1" — event file and script number, the way the scripts name them. */
  key: string;
  /** Event file id as the scripts pass it; disk-file-187 scripts carry bit 15. */
  file: number;
  script: number;
  /** Lives in disk file 187: a scripted-battle script, not a field cutscene. */
  inBattle: boolean;
  /** Display form of the key. */
  label: string;
  /** The event file's name from the community symbol table, if it has one. */
  fileName: string | null;
  /** The map the script loads into the displayed slot itself. */
  ownMap: number | null;
  /**
   * The map it runs on once inheritance is resolved. One entry normally;
   * several when it is launched from more than one map (a generic contact
   * event, a map-triggered event, an ambiguous inheritance); empty when it has
   * no map of its own and nothing to inherit from.
   */
  maps: number[];
  /** Parallel to maps: the map's name from the symbol table, or null. */
  mapNames: (string | null)[];
  mapResolution: string;
  /** Every start source: event predecessors, map scripts, contact scripts, battles, NPC scripts. */
  startedBy: string[];
  predecessors: string[];
  chainsTo: string[];
  /** Successors with the walked gate on each start: to[gate]{other}+stacked. */
  chainsToGuarded: string[];
  /** Maps whose init or story scripts launch this event. */
  launchMaps: number[];
  /** Maps whose contact scripts (100–199) launch this event. */
  contactMaps: number[];
  npcLaunchedBy: string[];
  npcGates: string[];
  npcGatesOther: string[];
  npcListGates: string[];
  postBattleFrom: string[];
  preBattleMaps: number[];
  battleMaps: number[];
  handsOffToMap: number[];
  preloadsForSuccessor: number[];
  /** The save-state gate on each map-side launch. */
  gates: string[];
  /** Runtime and computed conditions on those launches. */
  gatesOther: string[];
  gateNotes: string[];
  inheritedChars: number[];
  setupOnlyInDebug: string[];
  verdict: string;
  verdictClass: EventVerdictClass;
  reasons: string[];
  coldStart: string;
}

export const EVENT_VERDICT_LABELS: Record<EventVerdictClass, string> = {
  standalone: 'standalone',
  chained: 'chained, self-contained',
  cosmetic: 'chained, obi/music inherited',
  map: 'map-triggered',
  generic: 'generic contact event',
  battle: 'post-battle, inherits map',
  npc: 'NPC-launched, inherits map',
  'mid-chain': 'mid-chain',
  unresolved: 'unresolved root',
  'in-battle': 'in-battle script',
};

/** Event file ids in the order they appear. */
export const EVENT_FILES: number[] = ${JSON.stringify(files)};

export const EVENT_VERDICT_COUNTS: Record<EventVerdictClass, number> = ${JSON.stringify(counts)};

// The rows, one JSON object per line in events.json. Loaded as text so the
// type checker does not infer a ${records.length}-element literal.
import raw from './events.json?raw';

export const EVENTS: EventRecord[] = JSON.parse(raw) as EventRecord[];
`;

// One record per line: compact enough to check in, still diffable per script.
const lines = records.map((r) => `  ${JSON.stringify(r)}`);
const body = `[\n${lines.join(',\n')}\n]\n`;

writeFileSync(OUT_JSON, body);
writeFileSync(OUT, header);

console.log(`records          : ${records.length}`);
console.log(`event files      : ${files.length}`);
console.log(`named files      : ${records.filter((r) => r.fileName).length} records`);
console.log(`named maps       : ${records.filter((r) => r.mapNames.some(Boolean)).length} of ${records.filter((r) => r.maps.length).length} with a map`);
console.log(`verdict classes  : ${JSON.stringify(counts)}`);
console.log(`wrote ${OUT_JSON} and ${OUT}`);
