import { addTitleUnderscore, patchTitleCredit } from './title-credit.mjs';
import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const names = ['metalslug-part1.data', 'metalslug-part2.data'];
const limit = 20_000_000;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestPath = join(dist, 'metalslug-parts.json');

if (process.argv[2] === '--verify') {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.parts?.length !== names.length) throw new Error('Expected two package parts.');
  const buffers = await Promise.all(names.map(async (name, i) => {
    const bytes = await readFile(join(dist, name));
    const part = manifest.parts[i];
    if (part.file !== name || part.size !== bytes.length || !bytes.length || part.sha256 !== digest(bytes)) {
      throw new Error('Invalid package part: ' + name);
    }
    return bytes;
  }));
  const data = Buffer.concat(buffers);
  if (data.length !== manifest.size || digest(data) !== manifest.sha256) throw new Error('Package does not match its manifest.');
  for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile() || entry.name === 'metalslug.data' ||
        (await stat(join(entry.parentPath, entry.name))).size >= limit) {
      throw new Error('Invalid Pages artifact file: ' + entry.name);
    }
  }
  console.log('Verified ' + data.length + ' bytes in two parts.');
} else {
  if (!process.argv[2]) throw new Error('Specify the Emscripten output folder or --verify.');
  const bin = resolve(process.argv[2]);
  const data = await readFile(join(bin, 'metalslug.data'));
  const loader = await readFile(join(bin, 'metalslug.js'), 'utf8');
  const entries = new Map(Array.from(
    loader.matchAll(/"?filename"?\s*:\s*"\/roms\/([^"]+)"\s*,\s*"?start"?\s*:\s*(\d+)\s*,\s*"?end"?\s*:\s*(\d+)/g),
    ([, name, start, end]) => [name, data.subarray(Number(start), Number(end))],
  ));
  for (const [name, edit] of [['201-p1.p1', patchTitleCredit], ['201-s1.s1', addTitleUnderscore]]) {
    if (!entries.has(name)) throw new Error('The Emscripten package is missing ' + name);
    edit(entries.get(name));
  }
  const cut = Math.ceil(data.length / 2);
  if (data.length < 2 || cut >= limit) throw new Error('Cannot package data as two files smaller than 20 MB.');
  const chunks = [data.subarray(0, cut), data.subarray(cut)];
  const parts = await Promise.all(chunks.map(async (bytes, i) => {
    await writeFile(join(dist, names[i]), bytes);
    return { file: names[i], size: bytes.length, sha256: digest(bytes) };
  }));
  for (const name of ['metalslug.js', 'metalslug.wasm']) await copyFile(join(bin, name), join(dist, name));
  for (const name of ['character.png', 'logo.png']) await copyFile(join(root, 'media', name), join(dist, name));
  await writeFile(manifestPath, JSON.stringify({ size: data.length, sha256: digest(data), parts }, null, 2) + '\n');
}
