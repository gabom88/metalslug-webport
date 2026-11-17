async function packageResponse(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
  return response;
}

export async function loadGameData() {
  const manifest = await (await packageResponse('./metalslug-parts.json')).json();
  const names = ['metalslug-part1.data', 'metalslug-part2.data'];
  if (manifest.parts?.length !== 2 || !manifest.parts.every((entry, i) =>
    entry.file === names[i] && Number.isInteger(entry.size) && entry.size > 0 && entry.size < 20_000_000
  ) || manifest.parts.reduce((total, entry) => total + entry.size, 0) !== manifest.size) {
    throw new Error('El manifiesto de datos del juego no es válido.');
  }
  const result = new Uint8Array(manifest.size);
  await Promise.all(manifest.parts.map(async ({ file, size, sha256 }, index) => {
    const part = await (await packageResponse(file)).arrayBuffer();
    if (part.byteLength !== size) throw new Error('La descarga está incompleta: ' + file);
    if (globalThis.crypto?.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', part);
      const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (hex !== sha256) throw new Error('Los datos no coinciden: ' + file);
    }
    result.set(new Uint8Array(part), index === 0 ? 0 : manifest.parts[0].size);
  }));
  return result.buffer;
}
