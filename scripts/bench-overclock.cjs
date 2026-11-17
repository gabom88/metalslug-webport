// Measures slowdown per overclock factor: node scripts/bench-overclock.cjs OUT_DIR FRAMES 1 2 3 4
// Needs the build-state-tests runtime (WEB_REGRESSION_TEST=ON).
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const createMetalSlug = require(path.join(root, 'build-state-tests/runtime/metalslug.js'));
const [out, framesArg, ...ocs] = process.argv.slice(2);
const frames = Number(framesArg), every = 1500;
let script = '900-910 coin\n1000-1010 start\n';
script += `1300-${frames} right\n`;
for (let f = 1300; f < frames; f += 8) script += `${f}-${f + 3} a\n`;          // rapid fire
for (let f = 1320; f < frames; f += 45) script += `${f}-${f + 6} b\n`;          // jump
for (let f = 1400; f < frames; f += 400) script += `${f}-${f + 3} c\n`;         // grenade
for (let f = 1500; f < frames; f += 240) script += `${f}-${f + 5} coin\n${f + 20}-${f + 25} start\n`; // continue
(async () => {
  const data = Buffer.concat([1, 2].map(i => fs.readFileSync(path.join(root, 'dist/metalslug-part' + i + '.data'))));
  const runs = {};
  for (const oc of ocs.map(Number)) {
    const game = await createMetalSlug({ getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), printErr: () => {} });
    game._web_options(1, 0);
    game._web_overclock_set(oc);
    game.FS.writeFile('/input.txt', script);
    const args = ['--headless', '--rom-path', '/roms', '--frames', String(frames), '--input', '/input.txt'];
    for (let f = every; f < frames; f += every) args.push('--screenshot', f + ':/s' + f + '.png');
    const t = process.hrtime.bigint();
    game.callMain(args);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const n = game._web_bench_count(), p = game._web_bench_pcs(); const u8 = game.HEAPU8; const dv = new DataView(u8.buffer, u8.byteOffset);
    runs[oc] = Array.from({ length: n }, (_, i) => dv.getUint32(p + i * 4, true));
    for (let f = every; f < frames; f += every) try { fs.writeFileSync(path.join(out, `oc${oc}-f${f}.png`), game.FS.readFile('/s' + f + '.png')); } catch {}
    console.log(`x${oc}: ${(ms / frames).toFixed(2)} ms/frame`);
  }
  // Idle wait loop = PCs seen at VBlank in the most overclocked run.
  const hist = new Map();
  for (const pc of runs[Math.max(...ocs.map(Number))].slice(1300)) hist.set(pc, (hist.get(pc) || 0) + 1);
  const top = [...hist].sort((a, b) => b[1] - a[1]);
  console.log('top PCs at VBlank:', top.slice(0, 6).map(([pc, c]) => pc.toString(16) + ':' + c).join(' '));
  const idle = new Set(top.filter(([, c]) => c > 50).map(([pc]) => pc));
  for (const oc of ocs) {
    const pcs = runs[oc], win = [];
    let lag = 0;
    for (let s = 1300; s < pcs.length; s += 600) {
      const w = pcs.slice(s, s + 600).filter(pc => !idle.has(pc)).length; lag += w; win.push(w);
    }
    console.log(`x${oc}: late frames ${lag} / ${pcs.length - 1300}  per 10 s window: ${win.join(' ')}`);
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
