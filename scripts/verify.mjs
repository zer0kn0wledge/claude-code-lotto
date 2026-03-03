#!/usr/bin/env node
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Colors
const G = '\x1b[32m', R = '\x1b[31m', C = '\x1b[36m', Y = '\x1b[33m', D = '\x1b[2m', B = '\x1b[1m', X = '\x1b[0m';

function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

function createPRNG(seedHex) {
  let counter = 0;
  return function next() {
    const input = seedHex + ':' + counter;
    counter++;
    const hash = sha256(input);
    const value = parseInt(hash.slice(0, 8), 16);
    return value / 0x100000000;
  };
}

function seededShuffle(array, seedHex) {
  const rng = createPRNG(seedHex);
  const a = [...array];
  for (let i = a.length - 1; i >= 1; i--) {
    const r = rng();
    const j = Math.floor(r * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function line(char = '─', len = 60) {
  return D + char.repeat(len) + X;
}

console.log();
console.log(line('═'));
console.log(`${B}${G}  CLAUDE CODE LOTTO — VERIFICATION${X}`);
console.log(line('═'));
console.log();

// Load data
let entrantsData, resultsData;
try {
  entrantsData = JSON.parse(readFileSync(join(root, 'data', 'entrants.json'), 'utf-8'));
} catch (e) {
  console.error(`${R}ERROR: Cannot read data/entrants.json${X}`);
  process.exit(1);
}
try {
  resultsData = JSON.parse(readFileSync(join(root, 'data', 'results.json'), 'utf-8'));
} catch (e) {
  console.error(`${R}ERROR: Cannot read data/results.json${X}`);
  process.exit(1);
}

if (resultsData.status === 'pending') {
  console.log(`${Y}Draw has not been executed yet.${X}`);
  process.exit(0);
}

const { server_seed, seed_hash_sha256, shuffle_key, winners, entrant_count } = resultsData;
const entrants = entrantsData.entrants;

let allPass = true;

// Step 1: Hash verification
console.log(`${B}${C}Step 1: Seed Hash Verification${X}`);
console.log(`${D}  Server Seed:   ${X}${server_seed.slice(0, 40)}...`);
const computedHash = sha256(server_seed);
console.log(`${D}  Expected Hash: ${X}${seed_hash_sha256}`);
console.log(`${D}  Computed Hash: ${X}${computedHash}`);
const hashMatch = computedHash === seed_hash_sha256;
if (hashMatch) {
  console.log(`  ${G}✅ MATCH${X}`);
} else {
  console.log(`  ${R}❌ MISMATCH${X}`);
  allPass = false;
}
console.log();

// Step 2: Shuffle key verification
console.log(`${B}${C}Step 2: Shuffle Key Derivation${X}`);
const shuffleInput = server_seed + ':' + entrants.length;
console.log(`${D}  Input:         ${X}sha256(serverSeed + ":" + ${entrants.length})`);
const computedShuffleKey = sha256(shuffleInput);
console.log(`${D}  Expected Key:  ${X}${shuffle_key}`);
console.log(`${D}  Computed Key:  ${X}${computedShuffleKey}`);
const keyMatch = computedShuffleKey === shuffle_key;
if (keyMatch) {
  console.log(`  ${G}✅ MATCH${X}`);
} else {
  console.log(`  ${R}❌ MISMATCH${X}`);
  allPass = false;
}
console.log();

// Step 3: Entrant count
console.log(`${B}${C}Step 3: Entrant Count${X}`);
console.log(`${D}  results.json:  ${X}${entrant_count}`);
console.log(`${D}  entrants.json: ${X}${entrants.length}`);
const countMatch = entrant_count === entrants.length;
if (countMatch) {
  console.log(`  ${G}✅ MATCH${X}`);
} else {
  console.log(`  ${R}❌ MISMATCH${X}`);
  allPass = false;
}
console.log();

// Step 4: Winner derivation
console.log(`${B}${C}Step 4: Winner Derivation${X}`);
const shuffled = seededShuffle(entrants, computedShuffleKey);
const derivedWinners = shuffled.slice(0, 3);
console.log(`${D}  Expected:  ${X}${winners.map(w => '@' + w).join(', ')}`);
console.log(`${D}  Derived:   ${X}${derivedWinners.map(w => '@' + w).join(', ')}`);
const winnersMatch = winners.length === derivedWinners.length &&
  winners.every((w, i) => w === derivedWinners[i]);
if (winnersMatch) {
  console.log(`  ${G}✅ MATCH${X}`);
} else {
  console.log(`  ${R}❌ MISMATCH${X}`);
  allPass = false;
}
console.log();

// Summary
console.log(line('═'));
if (allPass) {
  console.log(`${B}${G}  ✅ DRAW IS PROVABLY FAIR${X}`);
} else {
  console.log(`${B}${R}  ❌ VERIFICATION FAILED${X}`);
}
console.log(line('═'));
console.log();

if (!allPass) process.exit(1);
