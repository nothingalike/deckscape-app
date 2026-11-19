import { crc32, deflateSync } from 'node:zlib';

// A standards-compliant opaque red pixel for bitmap/canvas integration checks.
// Unlike a signature-only fixture, every PNG chunk has its actual CRC.
export function redPixelPng() {
  function chunk(type, bytes) {
    const tag=Buffer.from(type);const length=Buffer.alloc(4);length.writeUInt32BE(bytes.length);
    const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([tag,bytes])));
    return Buffer.concat([length,tag,bytes,checksum]);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),
    chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);
}
