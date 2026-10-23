// Rewrites a fragmented MP4 (what Chromium's MediaRecorder writes: empty sample tables, duration 0, moof/mdat pairs)
// as an ordinary progressive MP4 with the moov first. Samples are copied byte for byte, so nothing is re-encoded.
// Phone galleries and upload pickers can read the length and seek from the sample tables.
//   const { toProgressive } = require('./mp4-progressive'); fs.writeFileSync(out, toProgressive(fs.readFileSync(input)));
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'edts', 'dinf', 'moof', 'traf']);

function boxes(buf, start = 0, end = buf.length) {
  const list = [];
  for (let p = start; p < end;) {
    let size = buf.readUInt32BE(p), header = 8;
    const type = buf.toString('latin1', p + 4, p + 8);
    if (size === 1) { size = Number(buf.readBigUInt64BE(p + 8)); header = 16; } else if (size === 0) size = end - p;
    if (size < header || p + size > end) throw new Error(`broken ${type} box at ${p}`);
    list.push({ type, start: p, end: p + size, body: p + header });
    p += size;
  }
  return list;
}
const child = (buf, box, type) => boxes(buf, box.body, box.end).find(b => b.type === type);
const children = (buf, box, type) => boxes(buf, box.body, box.end).filter(b => b.type === type);
const u64 = (buf, p) => Number(buf.readBigUInt64BE(p));

function box(type, ...parts) {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length + 8); head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}
function full(type, version, flags, ...parts) {
  const vf = Buffer.alloc(4); vf.writeUInt32BE((version << 24 | flags) >>> 0);
  return box(type, vf, ...parts);
}
function u32s(values) { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32BE(v >>> 0, i * 4)); return b; }
// A box with extra children appended after it was built needs its size field rewritten.
function withSize(b) { b.writeUInt32BE(b.length); return b; }
// Rebuilds a box with some children replaced (null drops it); other children are copied unchanged.
function rebuild(buf, b, replace) {
  return box(b.type, ...boxes(buf, b.body, b.end).map(c => c.type in replace ? replace[c.type](c) : buf.subarray(c.start, c.end)).filter(Boolean));
}

function toProgressive(buf) {
  const top = boxes(buf), moov = top.find(b => b.type === 'moov');
  if (!moov) throw new Error('no moov box');
  if (!top.some(b => b.type === 'moof')) return buf;   // already progressive
  const trex = new Map(), mvex = child(buf, moov, 'mvex');
  if (mvex) for (const t of children(buf, mvex, 'trex')) {
    const d = t.body + 4;
    trex.set(buf.readUInt32BE(d), { duration: buf.readUInt32BE(d + 8), size: buf.readUInt32BE(d + 12), flags: buf.readUInt32BE(d + 16) });
  }
  // Samples per track, and chunks (one run of one fragment = one chunk) in file order.
  const tracks = new Map(), chunks = [];
  const track = id => { if (!tracks.has(id)) tracks.set(id, { samples: [], chunks: [] }); return tracks.get(id); };
  for (const moof of top.filter(b => b.type === 'moof')) {
    for (const traf of children(buf, moof, 'traf')) {
      const tfhd = child(buf, traf, 'tfhd'), tf = buf.readUInt32BE(tfhd.body) & 0xffffff;
      let q = tfhd.body + 4;
      const id = buf.readUInt32BE(q); q += 4;
      const def = { ...(trex.get(id) || { duration: 0, size: 0, flags: 0 }) };
      let base = moof.start;
      if (tf & 0x1) { base = u64(buf, q); q += 8; }
      if (tf & 0x2) q += 4;
      if (tf & 0x8) { def.duration = buf.readUInt32BE(q); q += 4; }
      if (tf & 0x10) { def.size = buf.readUInt32BE(q); q += 4; }
      if (tf & 0x20) { def.flags = buf.readUInt32BE(q); q += 4; }
      const t = track(id);
      let pos = base;
      for (const trun of children(buf, traf, 'trun')) {
        const version = buf[trun.body], fl = buf.readUInt32BE(trun.body) & 0xffffff, n = buf.readUInt32BE(trun.body + 4);
        let r = trun.body + 8, first = null;
        if (fl & 0x1) { pos = base + buf.readInt32BE(r); r += 4; }
        if (fl & 0x4) { first = buf.readUInt32BE(r); r += 4; }
        const chunk = { track: id, start: pos, length: 0, count: n };
        for (let i = 0; i < n; i++) {
          const s = { duration: def.duration, size: def.size, flags: i === 0 && first !== null ? first : def.flags, cto: 0 };
          if (fl & 0x100) { s.duration = buf.readUInt32BE(r); r += 4; }
          if (fl & 0x200) { s.size = buf.readUInt32BE(r); r += 4; }
          if (fl & 0x400) { s.flags = buf.readUInt32BE(r); r += 4; if (i === 0 && first !== null) s.flags = first; }
          if (fl & 0x800) { s.cto = version ? buf.readInt32BE(r) : buf.readUInt32BE(r); r += 4; }
          t.samples.push(s); chunk.length += s.size; pos += s.size;
        }
        if (n) { t.chunks.push(chunk); chunks.push(chunk); }
      }
    }
  }
  // New mdat: the same chunks, in the same interleaved order.
  let at = 0;
  for (const c of chunks) { c.offset = at; at += c.length; }
  const mvhd = child(buf, moov, 'mvhd'), movieScale = buf.readUInt32BE(mvhd.body + (buf[mvhd.body] ? 20 : 12));
  let movieDuration = 0;
  const trakOut = offsetBase => children(buf, moov, 'trak').map(trak => {
    const tkhd = child(buf, trak, 'tkhd'), id = buf.readUInt32BE(tkhd.body + (buf[tkhd.body] ? 20 : 12));
    const t = tracks.get(id) || { samples: [], chunks: [] };
    const mdia = child(buf, trak, 'mdia'), mdhd = child(buf, mdia, 'mdhd');
    const scale = buf.readUInt32BE(mdhd.body + (buf[mdhd.body] ? 20 : 12));
    const total = t.samples.reduce((a, s) => a + s.duration, 0), inMovie = Math.round(total * movieScale / scale);
    movieDuration = Math.max(movieDuration, inMovie);
    const stts = [];
    for (const s of t.samples) { const last = stts[stts.length - 1]; if (last && last[1] === s.duration) last[0]++; else stts.push([1, s.duration]); }
    const stsc = [];
    t.chunks.forEach((c, i) => { if (!stsc.length || stsc[stsc.length - 1][1] !== c.count) stsc.push([i + 1, c.count, 1]); });
    const sync = t.samples.map((s, i) => (s.flags & 0x10000) ? 0 : i + 1).filter(Boolean);
    const ctts = [];
    if (t.samples.some(s => s.cto)) for (const s of t.samples) { const last = ctts[ctts.length - 1]; if (last && last[1] === s.cto) last[0]++; else ctts.push([1, s.cto]); }
    const tables = {
      stts: () => full('stts', 0, 0, u32s([stts.length, ...stts.flat()])),
      stsc: () => full('stsc', 0, 0, u32s([stsc.length, ...stsc.flat()])),
      stsz: () => full('stsz', 0, 0, u32s([0, t.samples.length, ...t.samples.map(s => s.size)])),
      stco: () => full('stco', 0, 0, u32s([t.chunks.length, ...t.chunks.map(c => offsetBase + c.offset)])),
      co64: () => null, stss: () => null, ctts: () => null,
    };
    const stbl = child(buf, child(buf, mdia, 'minf'), 'stbl');
    const extra = [];
    if (sync.length && sync.length < t.samples.length) extra.push(full('stss', 0, 0, u32s([sync.length, ...sync])));
    if (ctts.length) extra.push(full('ctts', ctts.some(([, v]) => v < 0) ? 1 : 0, 0, u32s([ctts.length, ...ctts.flat()])));
    const setDuration = (b, offsetV1, offsetV0, value) => {
      const copy = Buffer.from(buf.subarray(b.start, b.end)), v = buf[b.body], o = b.body - b.start + (v ? offsetV1 : offsetV0);
      if (v) copy.writeBigUInt64BE(BigInt(value), o); else copy.writeUInt32BE(value, o);
      return copy;
    };
    return rebuild(buf, trak, {
      tkhd: b => setDuration(b, 28, 20, inMovie),
      edts: () => null,
      mdia: m => rebuild(buf, m, {
        mdhd: b => setDuration(b, 24, 16, total),
        minf: mi => rebuild(buf, mi, { stbl: st => withSize(Buffer.concat([rebuild(buf, st, tables), ...extra])) }),
      }),
    });
  });
  const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), u32s([512]), Buffer.from('isomiso2avc1mp41', 'latin1'));
  const build = base => {
    const traks = trakOut(base);
    const mvhdOut = Buffer.from(buf.subarray(mvhd.start, mvhd.end)), v = buf[mvhd.body], o = mvhd.body - mvhd.start + (v ? 24 : 16);
    if (v) mvhdOut.writeBigUInt64BE(BigInt(movieDuration), o); else mvhdOut.writeUInt32BE(movieDuration, o);
    return box('moov', mvhdOut, ...traks, ...boxes(buf, moov.body, moov.end).filter(c => !['mvhd', 'trak', 'mvex'].includes(c.type)).map(c => buf.subarray(c.start, c.end)));
  };
  const size = build(0).length, dataStart = ftyp.length + size + 8;
  const moovOut = build(dataStart);
  if (moovOut.length !== size) throw new Error('moov size changed between passes');
  if (dataStart + at > 0xffffffff) throw new Error('over 4 GB needs co64');
  const mdatHead = Buffer.alloc(8); mdatHead.writeUInt32BE(at + 8); mdatHead.write('mdat', 4, 'latin1');
  return Buffer.concat([ftyp, moovOut, mdatHead, ...chunks.map(c => buf.subarray(c.start, c.start + c.length))]);
}

// Track summary for checks and reports: duration, sample and sync counts, whether the file is still fragmented.
function describe(buf) {
  const top = boxes(buf), moov = top.find(b => b.type === 'moov'), mvhd = child(buf, moov, 'mvhd');
  const v = buf[mvhd.body], scale = buf.readUInt32BE(mvhd.body + (v ? 20 : 12)), dur = v ? u64(buf, mvhd.body + 24) : buf.readUInt32BE(mvhd.body + 16);
  const tracks = children(buf, moov, 'trak').map(trak => {
    const mdia = child(buf, trak, 'mdia'), stbl = child(buf, child(buf, mdia, 'minf'), 'stbl');
    const hdlr = child(buf, mdia, 'hdlr'), stsz = child(buf, stbl, 'stsz'), stss = child(buf, stbl, 'stss');
    return { handler: buf.toString('latin1', hdlr.body + 8, hdlr.body + 12), samples: buf.readUInt32BE(stsz.body + 8), sync: stss ? buf.readUInt32BE(stss.body + 4) : null };
  });
  return { order: top.map(b => b.type).filter((t, i, a) => a.indexOf(t) === i), fragmented: top.some(b => b.type === 'moof'), seconds: +(dur / scale).toFixed(2), tracks };
}

module.exports = { toProgressive, describe };
