const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const runtime = path.resolve(process.argv[2] || path.join(root, 'build-state-tests/runtime/metalslug.js'));
const createMetalSlug = require(runtime);

(async () => {
  const data = Buffer.concat([1, 2].map(i => fs.readFileSync(path.join(root, 'dist/metalslug-part' + i + '.data'))));
  for (let mission = 1; mission <= 6; mission++) {
    const game = await createMetalSlug({
      getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    });
    game._web_options(mission, 1);
    game._web_mod_options(1, 2);
    game.FS.writeFile('/input.txt', '900-910 coin\n1000-1010 start\n1300-2500 right+a\n');
    const code = game.callMain(['--headless', '--rom-path', '/roms', '--frames', '2500', '--input', '/input.txt']);
    if (code) throw new Error('Mission ' + mission + ' regression failed: ' + code);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
