#!/usr/bin/env node
/**
 * Builds a store package per browser target.
 *
 *   node tools/build.mjs                 all targets
 *   node tools/build.mjs chrome firefox  just those
 *
 * Produces, for each target:
 *   dist/<target>/            the unpacked tree (what Safari's converter reads,
 *                             and what you load unpacked to reproduce a bug)
 *   dist/freeradicals-<target>-<version>.zip
 *
 * Packages are byte-for-byte reproducible: the same source always yields the
 * same zip and the same SHA-256, so "is the artifact in this release the one
 * that passed CI?" is a question you can actually answer.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TARGETS, buildManifest, packageFiles } from './targets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

async function buildTarget(target, files) {
  const { createZip } = await import('./zip.mjs');
  const manifest = buildManifest({ target, version });
  const outDir = join(DIST, target);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const entries = [{ name: 'manifest.json', data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`) }];
  for (const rel of files) entries.push({ name: rel, data: readFileSync(join(ROOT, rel)) });

  for (const entry of entries) {
    const dest = join(outDir, entry.name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, entry.data);
  }

  const zip = createZip(entries);
  const zipPath = join(DIST, `freeradicals-${target}-${version}.zip`);
  writeFileSync(zipPath, zip);

  return {
    target,
    zipPath,
    files: entries.length,
    bytes: zip.length,
    sha256: createHash('sha256').update(zip).digest('hex'),
  };
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = requested.length ? requested : TARGETS;
for (const t of targets) {
  if (!TARGETS.includes(t)) {
    console.error(`unknown target "${t}" — expected one of: ${TARGETS.join(', ')}`);
    process.exit(1);
  }
}

mkdirSync(DIST, { recursive: true });
const files = packageFiles(ROOT);
const results = [];
for (const target of targets) results.push(await buildTarget(target, files));

console.log(`Free Radicals ${version} — ${files.length + 1} files per package\n`);
for (const r of results) {
  console.log(`  ${r.target.padEnd(8)} ${String(Math.round(r.bytes / 1024)).padStart(4)} KB  ${r.sha256.slice(0, 16)}…  ${relative(ROOT, r.zipPath)}`);
}

writeFileSync(
  join(DIST, 'checksums.txt'),
  `${results.map((r) => `${r.sha256}  ${relative(DIST, r.zipPath)}`).join('\n')}\n`,
);
