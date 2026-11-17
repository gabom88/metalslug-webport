import { createHash } from 'node:crypto';

export function patchTitleCredit(program) {
  // 201-p1.p1 from the verified MAME "mslug" set. Decode its little-endian
  // word layout before writing 68000 instructions, then restore it.
  const expected = '53406b796e4def5df52d4169bafb4384ad80d787792e8efe46c7298d46f98ea5';
  if (createHash('sha256').update(program).digest('hex') !== expected) {
    throw new Error('The native title credit requires the verified 201-p1.p1 ROM.');
  }
  program.swap16();

  // The fixed bank's title routine (68k $091618) jumps to a stub in the
  // banked ROM's trailing zero padding. $05DAD8 prints a FE-ended string
  // from A2 to the FIX tile map at A1, with D0 selecting the title font.
  const titleRoutine = 0x191618;
  const padding = 0xfff00;
  const address = 0x2fff00;
  const text = [
    Buffer.from('Metal Slug port by Bardock\xfe', 'latin1'),
    Buffer.from('https://x.com/bardock_dev\xfe', 'latin1'),
  ];
  const stub = Buffer.alloc(46);
  let labelAddress = address + stub.length;
  for (let line = 0; line < text.length; ++line) {
    const offset = line * 22;
    stub.writeUInt16BE(0x227c, offset);      // MOVEA.L #tile position,A1
    stub.writeUInt32BE(0x70fa + line, offset + 2);
    stub.writeUInt16BE(0x45f9, offset + 6);  // LEA string,A2
    stub.writeUInt32BE(labelAddress, offset + 8);
    stub.writeUInt16BE(0x303c, offset + 12); // MOVE.W #$2300,D0
    stub.writeUInt16BE(0x2300, offset + 14);
    stub.writeUInt16BE(0x4eb9, offset + 16); // JSR $05DAD8
    stub.writeUInt32BE(0x05dad8, offset + 18);
    labelAddress += text[line].length;
  }
  stub.writeUInt16BE(0x4e75, 44);           // RTS
  Buffer.concat([stub, ...text]).copy(program, padding);
  program.writeUInt16BE(0x4ef9, titleRoutine); // JMP stub
  program.writeUInt32BE(address, titleRoutine + 2);
  program.swap16();
}

export function addTitleUnderscore(font) {
  const expected = '55f8d5e3750f174416b2adcff938d9ef2e44ae1aef36948f3de50c45f010e714';
  if (createHash('sha256').update(font).digest('hex') !== expected) {
    throw new Error('The title underscore requires the verified 201-s1.s1 ROM.');
  }

  // Font page $300 leaves "_" blank. Reuse the dash's ink and shadow
  // at rows 6 and 7 of that glyph, in the FIX tile's packed column pairs.
  const dash = 0x32d * 32;
  const underscore = 0x35f * 32;
  for (const pair of [0, 8, 16, 24]) {
    font.copy(font, underscore + pair + 6, dash + pair + 3, dash + pair + 5);
  }
}
