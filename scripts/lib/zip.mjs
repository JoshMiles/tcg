// A tiny ZIP writer (deflate, no dependencies) so the Twitch package can be built with nothing but Node. Entries are written in the
// order given with a fixed timestamp, so the same files always produce the same zip.
import { crc32, deflateRawSync } from 'node:zlib';

const DOS_TIME = 0;                                   // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01

/** `files`: [{ name: 'panel.html', data: Buffer }]. Names use forward slashes and no leading slash. Returns the zip as a Buffer. */
export function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const packed = deflateRawSync(raw, { level: 9 });
    const useDeflate = packed.length < raw.length;
    const body = useDeflate ? packed : raw;
    const crc = crc32(raw) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);       // local file header signature
    local.writeUInt16LE(20, 4);               // version needed
    local.writeUInt16LE(0x0800, 6);           // flags: UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);         // central directory header signature
    dir.writeUInt16LE(20, 4);                 // version made by
    dir.writeUInt16LE(20, 6);                 // version needed
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(useDeflate ? 8 : 0, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);            // offset of the local header
    central.push(dir, name);
    offset += local.length + name.length + body.length;
  }
  const dirBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);           // end of central directory signature
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, dirBuf, end]);
}

/** Reads a zip made by makeZip back into [{ name, data }] (used by the checks to prove the file is a valid zip). */
export function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lnlen + lelen;
    const body = buf.subarray(start, start + csize);
    const data = method === 8 ? inflate(body) : body;
    if ((crc32(data) >>> 0) !== crc) throw new Error(`bad checksum for ${name}`);
    out.push({ name, data });
    p += 46 + nlen + elen + clen;
  }
  return out;
}
import { inflateRawSync } from 'node:zlib';
const inflate = b => inflateRawSync(b);
