#!/usr/bin/env node
/**
 * Invariant checks for src/data/events.json, the rows behind src/data/events.ts.
 *
 * Runs against the checked-in dataset alone — no external inputs — so it is
 * reproducible in CI. Corpus-derived counts are pinned here as constants with a
 * note on how they were established; if the analysis is re-run and a constant
 * changes, this file changes with it.
 *
 *   npm run validate:events
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Disk file 186 holds 107 event files with 859 scripts; disk file 187 holds
 * 7 files with 34. Read from the USA disc through the datacenter's two event
 * tables (slots 0 and 9 of disk file 5). The analysis drops the debug room —
 * event file 802 (29 scripts) and 800/6 — so 829 field scripts remain.
 */
const FIELD_SCRIPTS = 829;
const BATTLE_SCRIPTS = 34;
const FIELD_FILES = 106;
const BATTLE_FILES = 7;

const VERDICT_CLASSES = [
  'standalone', 'chained', 'cosmetic', 'map', 'generic', 'battle', 'npc',
  'mid-chain', 'unresolved', 'in-battle',
];

/** The 17 field scripts that must be entered from a predecessor. */
const MID_CHAIN_FIELD = 17;

export function validate(src) {
  const problems = [];
  const fail = (m) => problems.push(m);
  const records = parse(src);
  gates(records, fail);
  return { records, problems };
}

function parse(src) {
  const records = JSON.parse(src);
  if (!Array.isArray(records)) throw new Error('events.json: expected an array of records');
  return records;
}

function gates(records, fail) {
  const field = records.filter((r) => !r.inBattle);
  const battle = records.filter((r) => r.inBattle);
  if (field.length !== FIELD_SCRIPTS)
    fail(`expected ${FIELD_SCRIPTS} field scripts, found ${field.length}`);
  if (battle.length !== BATTLE_SCRIPTS)
    fail(`expected ${BATTLE_SCRIPTS} in-battle scripts, found ${battle.length}`);

  const fieldFiles = new Set(field.map((r) => r.file));
  const battleFiles = new Set(battle.map((r) => r.file));
  if (fieldFiles.size !== FIELD_FILES)
    fail(`expected ${FIELD_FILES} field event files, found ${fieldFiles.size}`);
  if (battleFiles.size !== BATTLE_FILES)
    fail(`expected ${BATTLE_FILES} in-battle event files, found ${battleFiles.size}`);
  if (fieldFiles.has(802)) fail('the debug room (event file 802) must be excluded');
  if (records.some((r) => r.key === '800/6')) fail('the debug mission-flag tool 800/6 must be excluded');

  // Keys unique, sorted numerically, and consistent with file/script.
  const seen = new Set();
  let prev = [-1, -1];
  for (const r of records) {
    if (seen.has(r.key)) fail(`duplicate key ${r.key}`);
    seen.add(r.key);
    if (r.key !== `${r.file}/${r.script}`) fail(`${r.key}: key does not match file/script`);
    const cur = [r.file, r.script];
    if (cur[0] < prev[0] || (cur[0] === prev[0] && cur[1] <= prev[1]))
      fail(`${r.key}: records are not in numeric order`);
    prev = cur;
    if (r.inBattle !== r.file >= 0x8000) fail(`${r.key}: inBattle disagrees with the file id`);
  }

  // Every chain edge points at a record that exists.
  for (const r of records) {
    for (const to of [...r.chainsTo, ...r.predecessors]) {
      if (!seen.has(to)) fail(`${r.key}: edge to unknown script ${to}`);
    }
    // Every guarded successor names a successor.
    for (const g of r.chainsToGuarded) {
      const to = g.split(/[\[{+ (]/)[0];
      if (!r.chainsTo.includes(to)) fail(`${r.key}: guarded edge ${g} is not in chainsTo`);
    }
  }

  // Predecessor edges are symmetric with chainsTo.
  const byKey = new Map(records.map((r) => [r.key, r]));
  for (const r of records) {
    for (const to of r.chainsTo) {
      if (!byKey.get(to).predecessors.includes(r.key))
        fail(`${r.key} -> ${to}: successor does not list the predecessor`);
    }
  }

  // Verdict vocabulary, and the classes the pages count on.
  for (const r of records) {
    if (!VERDICT_CLASSES.includes(r.verdictClass))
      fail(`${r.key}: unknown verdict class "${r.verdictClass}"`);
    if (r.inBattle && r.verdictClass !== 'in-battle')
      fail(`${r.key}: in-battle script classed as ${r.verdictClass}`);
    if (!r.inBattle && r.verdictClass === 'in-battle')
      fail(`${r.key}: field script classed as in-battle`);
  }
  const midChain = field.filter((r) => r.verdictClass === 'mid-chain');
  if (midChain.length !== MID_CHAIN_FIELD)
    fail(`expected ${MID_CHAIN_FIELD} mid-chain field scripts, found ${midChain.length}`);
  for (const r of midChain) {
    if (r.predecessors.length === 0) fail(`${r.key}: mid-chain with no predecessor`);
  }
  for (const r of field) {
    if (r.verdictClass === 'unresolved' && r.startedBy.length)
      fail(`${r.key}: unresolved root but has a starter (${r.startedBy[0]})`);
    if (r.verdictClass === 'standalone' && r.predecessors.length)
      fail(`${r.key}: standalone but has a predecessor`);
    if ((r.verdictClass === 'standalone' || r.verdictClass === 'chained') && r.ownMap == null)
      fail(`${r.key}: ${r.verdictClass} without a map of its own`);
  }

  // A resolved map has at least one number; an unresolved one has none; an
  // own map is exactly the script's own load.
  for (const r of records) {
    if (!Array.isArray(r.maps) || r.mapNames.length !== r.maps.length)
      fail(`${r.key}: maps and mapNames must be parallel arrays`);
    if (r.mapResolution === 'unresolved' && r.maps.length)
      fail(`${r.key}: unresolved map resolution with a map`);
    if (r.mapResolution === 'own' && !(r.maps.length === 1 && r.maps[0] === r.ownMap))
      fail(`${r.key}: own-map resolution but maps is not exactly ownMap`);
    if (/generic|map trigger|ambiguous/.test(r.mapResolution) && r.maps.length < 2 && r.mapResolution !== 'launched by a map trigger')
      fail(`${r.key}: "${r.mapResolution}" with fewer than two maps`);
  }

  // Gate strings use the documented notation.
  const GATE = /^(flag \d+ (set|clear)|flags \d+\.\.\d+ (is|not|>=|>|<|<=) -?\d+|value \d+ (is|not|>=|>|<|<=) -?\d+( \[.*\])?|state:.+|map \d+ script \d+: .*|-)$/;
  for (const r of records) {
    for (const g of r.gates) {
      for (const part of g.includes(': ') ? [g] : g.split(' & ')) {
        if (!GATE.test(part)) fail(`${r.key}: gate "${part}" is not in the documented notation`);
      }
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const src = readFileSync(join(root, 'src/data/events.json'), 'utf8');
  const { records, problems } = validate(src);
  if (problems.length) {
    console.error(`events.json FAILED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const field = records.filter((r) => !r.inBattle).length;
  console.log(
    `events.json OK — ${records.length} scripts (${field} field, ${records.length - field} in-battle), ` +
      `${new Set(records.map((r) => r.file)).size} event files, edges symmetric, gate notation clean`
  );
}
