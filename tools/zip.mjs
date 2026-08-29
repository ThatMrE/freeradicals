import { deflateRawSync } from 'node:zlib';

import { crc32 } from './crc32.mjs';

/**
 * A minimal, deterministic ZIP writer.
 *
 * The `zip` CLI stamps each entry with the current time, so two builds of an
 * identical tree produce different bytes and you can never answer "is the
 * artifact in this release the one I tested?" by comparing hashes. Every entry
 * here is stamped with a fixed timestamp and the entries are written in sorted
 * order, so the same input always produces byte-identical output.
 *
 * Store packages are small and flat; no ZIP64, no encryption, no directory
 * entries (every store accepts a zip with only file entries).
 */

// 1980-01-01 00:00:00, the earliest a DOS timestamp can express.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function localHeader(entry) {
  const buf = Buffer.alloc(30);
  buf.writeUInt32LE(0x04034b50, 0);
  buf.writeUInt16LE(20, 4);            // version needed
  buf.writeUInt16LE(0, 6);             // flags
  buf.writeUInt16LE(8, 8);             // method: deflate
  buf.writeUInt16LE(DOS_TIME, 10);
  buf.writeUInt16LE(DOS_DATE, 12);
  buf.writeUInt32LE(entry.crc, 14);
  buf.writeUInt32LE(entry.compressed.length, 18);
  buf.writeUInt32LE(entry.size, 22);
  buf.writeUInt16LE(entry.nameBuf.length, 26);
  buf.writeUInt16LE(0, 28);            // extra length
  return buf;
}

function centralHeader(entry) {
  const buf = Buffer.alloc(46);
  buf.writeUInt32LE(0x02014b50, 0);
  buf.writeUInt16LE(0x0314, 4);        // made by: unix, spec 2.0
  buf.writeUInt16LE(20, 6);
  buf.writeUInt16LE(0, 8);
  buf.writeUInt16LE(8, 10);
  buf.writeUInt16LE(DOS_TIME, 12);
  buf.writeUInt16LE(DOS_DATE, 14);
  buf.writeUInt32LE(entry.crc, 16);
  buf.writeUInt32LE(entry.compressed.length, 20);
  buf.writeUInt32LE(entry.size, 24);
  buf.writeUInt16LE(entry.nameBuf.length, 28);
  buf.writeUInt16LE(0, 30);            // extra
  buf.writeUInt16LE(0, 32);            // comment
  buf.writeUInt16LE(0, 34);            // disk number
  buf.writeUInt16LE(0, 36);            // internal attrs
  // `<< 16` overflows into a negative signed int32 in JS; coerce back.
  buf.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: regular file, 0644
  buf.writeUInt32LE(entry.offset, 42);
  return buf;
}

/**
 * @param {Array<{ name: string, data: Buffer }>} files
 * @returns {Buffer}
 */
export function createZip(files) {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const chunks = [];
  const entries = [];
  let offset = 0;

  for (const file of sorted) {
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const entry = {
      nameBuf: Buffer.from(file.name, 'utf8'),
      size: data.length,
      crc: crc32(data),
      compressed: deflateRawSync(data, { level: 9 }),
      offset,
    };
    const header = localHeader(entry);
    chunks.push(header, entry.nameBuf, entry.compressed);
    offset += header.length + entry.nameBuf.length + entry.compressed.length;
    entries.push(entry);
  }

  const cdStart = offset;
  for (const entry of entries) {
    const header = centralHeader(entry);
    chunks.push(header, entry.nameBuf);
    offset += header.length + entry.nameBuf.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(offset - cdStart, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);
  chunks.push(eocd);

  return Buffer.concat(chunks);
}
