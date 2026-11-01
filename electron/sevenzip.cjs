// 7-Zip engine wrapper: format detection, `7z l -slt` parsing, staged (piped) runs with progress tracking,
// and the argument builders for list / extract / test / compress / add / delete.
// Everything here is plain Node so the tests can drive it without Electron.
// RAR archives are read by 7-Zip; creating or modifying RAR runs the user's own RARLAB tool (rar / Rar.exe).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

// ---------------------------------------------------------------------------
// Tool locations

function toolsDir() {
  const sub = process.platform === 'win32' ? 'win' : 'mac';
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'bin'));
  candidates.push(path.join(__dirname, '..', 'bin', sub));
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, sevenZipExeName()))) return c;
  }
  return candidates[candidates.length - 1];
}

function sevenZipExeName() {
  return process.platform === 'win32' ? '7z.exe' : '7zz';
}

function sevenZipPath() {
  return path.join(toolsDir(), sevenZipExeName());
}

// ---------------------------------------------------------------------------
// Formats

const OPENABLE = new Set([
  'rar', 'zip', 'zipx', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz', 'tbz2', 'xz', 'txz', 'zst', 'tzst', 'lz4', 'lzma', 'tlz', 'lz', 'z',
  'cab', 'arj', 'lzh', 'lha', 'cpio', 'iso', 'udf', 'wim', 'swm', 'esd', 'deb', 'rpm', 'jar', 'war', 'ear', 'apk', 'ipa', 'xpi',
  'crx', 'nupkg', 'msi', 'chm', 'vhd', 'vhdx', 'vmdk', 'qcow2', 'squashfs', 'cramfs', 'hfs', 'hfsx', 'dmg', 'xar', 'pkg', 'ar',
  'a', 'lib', 'br', '001', 'uue', 'bzip2', 'gzip', 'sfx', 'img',
]);

const TAR_COMPRESSED_EXTS = ['tgz', 'tbz', 'tbz2', 'txz', 'tzst', 'tlz'];
const TAR_COMPRESSED_SUFFIXES = ['.tar.gz', '.tar.bz2', '.tar.xz', '.tar.zst', '.tar.lz4', '.tar.z', '.tar.lzma', '.tar.lz', '.tar.br'];

function extOf(p) {
  const base = path.basename(p).toLowerCase();
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1) : '';
}

function isArchive(p) {
  const ext = extOf(p);
  return OPENABLE.has(ext) || /^r\d\d$/.test(ext) || /^\d{3}$/.test(ext);
}

function isRar(p) {
  const ext = extOf(p);
  return ext === 'rar' || /^r\d\d$/.test(ext);
}

function isMultiVolume(p) {
  return /\.part\d+\.rar$|\.\d{3}$|\.r\d\d$|\.z\d\d$/i.test(path.basename(p));
}

function isTarCompressed(p) {
  const lower = path.basename(p).toLowerCase();
  if (TAR_COMPRESSED_EXTS.includes(extOf(p))) return true;
  return TAR_COMPRESSED_SUFFIXES.some((s) => lower.endsWith(s));
}

// Archive formats this app can create, with what each one supports (the compress dialog disables the rest).
const FORMATS = {
  '7z': { ext: '7z', password: true, encryptNames: true, solid: true, volumes: true, level: true, append: true },
  zip: { ext: 'zip', password: true, encryptNames: false, solid: false, volumes: true, level: true, append: true },
  tar: { ext: 'tar', password: false, encryptNames: false, solid: false, volumes: false, level: false, append: true },
  'tar.gz': { ext: 'tar.gz', password: false, encryptNames: false, solid: false, volumes: false, level: true, append: false, outer: 'gzip' },
  'tar.xz': { ext: 'tar.xz', password: false, encryptNames: false, solid: false, volumes: false, level: true, append: false, outer: 'xz' },
  'tar.bz2': { ext: 'tar.bz2', password: false, encryptNames: false, solid: false, volumes: false, level: true, append: false, outer: 'bzip2' },
  rar: { ext: 'rar', password: true, encryptNames: true, solid: true, volumes: true, level: true, append: true, recovery: true, needsRar: true },
};

// ---------------------------------------------------------------------------
// Archive paths

// "./a//b/" -> ["a", "b"]; absolute paths or ".." make the entry unsafe (null): it could write outside the target.
function safeComponents(raw) {
  const norm = String(raw).replace(/\\/g, '/');
  if (norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return null;
  const out = [];
  for (const part of norm.split('/')) {
    if (part === '..') return null;
    if (part && part !== '.') out.push(part);
  }
  return out;
}

function topLevel(raw) {
  const c = safeComponents(raw);
  return c && c.length ? c[0] : null;
}

// macOS metadata (__MACOSX folder, ._AppleDouble files): hidden in the window and skipped on extraction.
function isAppleMetadata(raw) {
  return String(raw).replace(/\\/g, '/').split('/').some((p) => p === '__MACOSX' || p.startsWith('._'));
}

function topLevelNames(entries, names) {
  const seen = new Set();
  const out = [];
  const src = names || entries.filter((e) => !isAppleMetadata(e.path)).map((e) => e.path);
  for (const n of src) {
    const t = topLevel(n);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// "dir/ad.part1.rar" -> "dir/ad", "x.7z.001" -> "x", "x.tar.gz" -> "x"
function folderNamedAfterArchive(archive) {
  const dir = path.dirname(archive);
  let base = path.basename(archive);
  const ext = extOf(archive);
  if (/^\d{3}$/.test(ext)) base = base.slice(0, -(ext.length + 1));
  const lower = base.toLowerCase();
  const suffix = TAR_COMPRESSED_SUFFIXES.find((s) => lower.endsWith(s));
  if (suffix) base = base.slice(0, -suffix.length);
  else {
    const i = base.lastIndexOf('.');
    if (i > 0) base = base.slice(0, i);
  }
  base = base.replace(/\.part\d+$/i, '');
  return path.join(dir, base || 'arsiv');
}

function uniquePath(p) {
  if (!fs.existsSync(p)) return p;
  const dir = path.dirname(p);
  const name = path.basename(p);
  const lower = name.toLowerCase();
  const suffix = TAR_COMPRESSED_SUFFIXES.find((s) => lower.endsWith(s)) || (path.extname(name) || '');
  const stem = suffix ? name.slice(0, name.length - suffix.length) : name;
  for (let i = 2; ; i++) {
    const c = path.join(dir, `${stem} ${i}${suffix}`);
    if (!fs.existsSync(c)) return c;
  }
}

// ---------------------------------------------------------------------------
// Running

function pw7z(pw) {
  // "-p" alone means an empty password: 7-Zip never stops to ask on the console.
  return '-p' + (pw || '');
}

// rar treats "-p-" literally, so without a password no switch is given at all.
function rarPasswordArgs(pw, encryptNames) {
  if (!pw) return [];
  return [(encryptNames ? '-hp' : '-p') + pw];
}

function spawnTool(stage, opts) {
  const exe = stage.tool === 'rar' ? opts.rarPath : opts.sevenZipPath || sevenZipPath();
  if (!exe) throw new Error('RAR tool not found');
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
  return spawn(exe, stage.args, { cwd: opts.cwd || undefined, env, windowsHide: true });
}

class Result {
  constructor(code, output, cancelled = false) {
    this.code = code;
    this.output = output;
    this.cancelled = cancelled;
  }
  get ok() {
    return !this.cancelled && (this.code === 0 || this.code === 1);
  }
  get wrongPassword() {
    return (
      this.code === 11 ||
      /Wrong password|Incorrect password|Cannot open encrypted archive|The specified password is incorrect/i.test(this.output)
    );
  }
  get notArchive() {
    return /Cannot open the file as archive|is not RAR archive|Can not open the file as archive|Can't open as archive/.test(this.output) && !this.wrongPassword;
  }
  // Short error text for the user.
  get errorSummary() {
    const lines = this.output
      .split('\n')
      .map((l) => l.replace(/\x08/g, '').trim())
      .filter((l) => l && !/^(7-Zip|64-bit|RAR |UNRAR |Trial version|Evaluation copy)/.test(l));
    const interesting = lines.filter((l) =>
      /error|incorrect|wrong|failed|not rar|cannot|can not|can't|no files|checksum|crc|denied|unexpected end|unsupported/i.test(l)
    );
    return (interesting.length ? interesting.slice(-8) : lines.slice(-6)).join('\n');
  }
  toJSON() {
    return {
      code: this.code,
      ok: this.ok,
      cancelled: this.cancelled,
      wrongPassword: this.wrongPassword,
      notArchive: this.notArchive,
      summary: this.errorSummary,
      output: this.output.slice(-20000),
    };
  }
}

// One job: stages piped together (stage[i].stdout -> stage[i+1].stdin); only the last stage's output is read.
// Emits 'file' (name), 'percent' (0-100) and 'done' (Result).
class Job extends EventEmitter {
  constructor(stages, opts = {}) {
    super();
    this.stages = stages;
    this.opts = opts;
    this.procs = [];
    this.cancelled = false;
    this.output = '';
    this.buffer = '';
    this.monitored = stages[stages.length - 1].tool;
  }

  start() {
    let prev = null;
    try {
      this.stages.forEach((st, i) => {
        const p = spawnTool(st, this.opts);
        p.on('error', (err) => {
          this.output += `\nERROR: ${err.message}\n`;
        });
        if (prev) {
          prev.stdout.pipe(p.stdin);
          p.stdin.on('error', () => {});
        } else {
          p.stdin.end();
        }
        if (i < this.stages.length - 1) {
          p.stderr.on('data', (d) => {
            const s = d.toString('utf8');
            if (/ERROR|Wrong password/i.test(s)) this.output += s;
          });
        }
        this.procs.push(p);
        prev = p;
      });
    } catch (err) {
      this.procs.forEach((p) => p.kill());
      setImmediate(() => this.emit('done', new Result(-1, `ERROR: ${err.message}`)));
      return this;
    }
    const last = this.procs[this.procs.length - 1];
    const onData = (d) => this.consume(d.toString('utf8'));
    last.stdout.on('data', onData);
    last.stderr.on('data', onData);
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      if (this.buffer) {
        this.output += this.buffer.replace(/\x08/g, '');
        this.buffer = '';
      }
      for (const p of this.procs) if (p !== last && p.exitCode === null) p.kill();
      this.emit('done', new Result(code == null ? -1 : code, this.output, this.cancelled));
    };
    last.on('close', finish);
    last.on('error', () => finish(-1));
    return this;
  }

  cancel() {
    this.cancelled = true;
    for (const p of this.procs) if (p.exitCode === null) p.kill();
  }

  consume(chunk) {
    this.buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\x08');
    let nl;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      this.output += lastSegment(line, true) + '\n';
      this.parse(lastSegment(line));
    }
    // Progress overwritten in place with backspaces and no newline yet: only read the latest state.
    if (this.buffer) {
      this.parse(lastSegment(this.buffer.slice(-512)));
      if (this.buffer.length > 64 * 1024) {
        const cut = this.buffer.lastIndexOf('\x08');
        if (cut >= 0) this.buffer = this.buffer.slice(cut + 1);
      }
    }
  }

  parse(raw) {
    const line = raw.replace(/\x08/g, '').trim();
    if (!line) return;
    let pct = null;
    let file = null;
    if (this.monitored === '7z') {
      const m = /^(\d{1,3})%/.exec(line);
      if (m) pct = Number(m[1]);
      if (!/ERROR/.test(line) && !line.endsWith('--') && !/ Open /.test(line)) {
        const n = /(?:^|\s)([-+TU=])\s(\S.*)$/.exec(line);
        if (n) {
          const name = n[2].trim().replace(/\/$/, '');
          if (name && !name.startsWith('Everything')) file = name;
        }
      }
    } else {
      const all = [...line.matchAll(/(\d{1,3})%/g)];
      if (all.length) pct = Number(all[all.length - 1][1]);
      let cand = null;
      if (line.startsWith('... ')) cand = line.slice(4);
      else {
        for (const verb of ['Extracting', 'Adding', 'Testing', 'Updating', 'Creating', 'Deleting', 'Compressing', 'Fresh', 'Calculating']) {
          if (line.startsWith(verb + ' ')) {
            const rest = line.slice(verb.length).trim();
            if (!rest.startsWith('from ') && !rest.startsWith('archive ')) cand = rest;
            break;
          }
        }
      }
      if (cand) {
        let name = cand.trim();
        let prevName;
        do {
          prevName = name;
          name = name.replace(/\s*(\d{1,3}%|OK|Failed|CRC failed)\s*$/, '');
        } while (name !== prevName);
        file = name.trim();
      }
    }
    if (file) this.emit('file', file);
    if (pct !== null && pct <= 100) this.emit('percent', pct);
  }
}

// What the screen shows of a line overwritten with backspaces.
function lastSegment(s, keepAll = false) {
  const parts = s.split('\x08').filter((p) => p.trim());
  if (keepAll) return parts.filter((p) => !/^\s*\d{1,3}%( \d+)?\s*$/.test(p)).join(' ');
  return parts.length ? parts[parts.length - 1] : '';
}

function run(stages, opts = {}) {
  return new Promise((resolve) => {
    new Job(stages, opts).on('done', resolve).start();
  });
}

// ---------------------------------------------------------------------------
// Listing

function listStages(archive, password) {
  if (isTarCompressed(archive)) {
    return [
      { tool: '7z', args: ['x', '-so', '-sccUTF-8', pw7z(password), '--', archive] },
      { tool: '7z', args: ['l', '-si', '-ttar', '-slt', '-sccUTF-8'] },
    ];
  }
  return [{ tool: '7z', args: ['l', '-slt', '-sccUTF-8', pw7z(password), '--', archive] }];
}

function parseListing(out, archive) {
  const lines = out.split('\n');
  let sep = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '----------') {
      sep = i;
      break;
    }
  }
  const headerLines = sep >= 0 ? lines.slice(0, sep) : lines;
  const entryLines = sep >= 0 ? lines.slice(sep + 1) : [];

  // The last "Type =" is the real archive type; outer layers (split, gzip) come first.
  let type = '';
  let solid = false;
  let volumes = 0;
  let physicalSize = 0;
  let method = '';
  for (const raw of headerLines) {
    const line = raw.trim();
    const i = line.indexOf(' = ');
    if (i < 0) continue;
    const key = line.slice(0, i);
    const value = line.slice(i + 3);
    if (key === 'Type') type = value;
    else if (key === 'Solid') solid = value === '+';
    else if (key === 'Volumes') volumes = Number(value) || 0;
    else if (key === 'Physical Size') physicalSize = Number(value) || 0;
    else if (key === 'Method') method = value;
  }
  if (isTarCompressed(archive) && !type) type = 'tar';

  const entries = [];
  let block = {};
  const flush = () => {
    const name = block.Path;
    const b = block;
    block = {};
    if (!name || isAppleMetadata(name)) return;
    const attrs = b.Attributes || '';
    const isDir = b.Folder === '+' || attrs.startsWith('D');
    const p = name.replace(/\\/g, '/').replace(/\/+$/, '');
    const size = Number(b.Size) || 0;
    const packed = Number(b['Packed Size']) || 0;
    entries.push({
      path: p,
      name: p.split('/').pop(),
      isDir,
      size,
      packed,
      ratio: size > 0 && packed > 0 ? Math.round((packed * 100) / size) : null,
      mtime: b.Modified ? b.Modified.slice(0, 19) : '',
      crc: b.CRC || '',
      encrypted: b.Encrypted === '+',
      method: b.Method || '',
      attributes: attrs,
    });
  };
  for (const raw of entryLines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const i = line.indexOf(' = ');
    if (i < 0) {
      if (line.endsWith(' =')) block[line.slice(0, -2)] = '';
      continue;
    }
    const key = line.slice(0, i);
    if (key === 'Path' && block.Path !== undefined) flush();
    block[key] = line.slice(i + 3);
  }
  flush();

  const lowerType = type.toLowerCase();
  let pretty = lowerType === 'rar5' ? 'RAR 5' : lowerType === 'rar' ? 'RAR 4' : lowerType === '7z' ? '7z' : type.toUpperCase() || '?';
  if (isTarCompressed(archive)) pretty = `TAR + ${extOf(archive).toUpperCase()}`;
  return {
    path: archive,
    name: path.basename(archive),
    type: pretty,
    rawType: lowerType,
    solid,
    volumes,
    method,
    physicalSize,
    isRar: lowerType.startsWith('rar') || isRar(archive),
    tarCompressed: isTarCompressed(archive),
    multiVolume: isMultiVolume(archive) || volumes > 1,
    headersEncrypted: false,
    entries,
  };
}

// {status:'ok', info} | {status:'password', wrong} | {status:'error', notArchive, summary, output}
// The listing is tried without a password first: only when that fails are the headers (file names) encrypted.
async function list(archive, password, opts = {}) {
  let r = await run(listStages(archive, null), opts);
  let headersEncrypted = false;
  if (r.wrongPassword) {
    if (!password) return { status: 'password', wrong: false };
    r = await run(listStages(archive, password), opts);
    if (r.wrongPassword) return { status: 'password', wrong: true };
    headersEncrypted = true;
  }
  if (r.notArchive || (!r.ok && !r.output.includes('----------'))) {
    return { status: 'error', notArchive: r.notArchive, summary: r.errorSummary, output: r.output.slice(-20000) };
  }
  const info = parseListing(r.output, archive);
  info.headersEncrypted = headersEncrypted;
  info.hasEncrypted = info.headersEncrypted || info.entries.some((e) => e.encrypted);
  info.hasUnsafePaths = info.entries.some((e) => safeComponents(e.path) === null);
  info.supportsModification = !info.tarCompressed && !info.multiVolume && (info.isRar || ['7z', 'zip', 'tar'].includes(info.rawType));
  try {
    info.archiveSize = fs.statSync(archive).size;
  } catch {
    info.archiveSize = info.physicalSize;
  }
  return { status: 'ok', info };
}

// ---------------------------------------------------------------------------
// Extract / test

const SKIP_METADATA = ['-xr!__MACOSX', '-xr!._*'];

// mode: 'overwrite' | 'rename' | 'skip'
function extractStages(info, names, dest, password, mode = 'rename', flat = false) {
  const ow = mode === 'overwrite' ? '-aoa' : mode === 'skip' ? '-aos' : '-aou';
  const cmd = flat ? 'e' : 'x';
  if (info.tarCompressed) {
    const inner = [cmd, '-si', '-ttar', '-y', '-bb1', '-sccUTF-8', ow, '-o' + dest, ...SKIP_METADATA];
    if (names && names.length) inner.push('--', ...names);
    return [
      { tool: '7z', args: ['x', '-so', '-sccUTF-8', pw7z(password), '--', info.path] },
      { tool: '7z', args: inner },
    ];
  }
  const args = [cmd, '-y', '-bsp1', '-bb1', '-sccUTF-8', ow, pw7z(password), '-o' + dest, ...SKIP_METADATA, '--', info.path];
  if (names && names.length) args.push(...names);
  return [{ tool: '7z', args }];
}

function testStages(info, password) {
  if (info.tarCompressed) {
    return [
      { tool: '7z', args: ['x', '-so', '-sccUTF-8', pw7z(password), '--', info.path] },
      { tool: '7z', args: ['t', '-si', '-ttar', '-bb1', '-sccUTF-8'] },
    ];
  }
  return [{ tool: '7z', args: ['t', '-bsp1', '-bb1', '-sccUTF-8', pw7z(password), '--', info.path] }];
}

// ---------------------------------------------------------------------------
// Compress / add / delete

// Six levels (0 store .. 5 best) mapped to 7-Zip -mx values.
const MX = [0, 1, 3, 5, 7, 9];

function formatFromPath(p) {
  const lower = p.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'tar.xz';
  if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.tbz')) return 'tar.bz2';
  const ext = extOf(p);
  return FORMATS[ext] && !ext.includes('.') ? ext : null;
}

function replaceFormatExt(p, format) {
  const dir = path.dirname(p);
  let name = path.basename(p);
  const lower = name.toLowerCase();
  const known = ['.tar.gz', '.tar.xz', '.tar.bz2', '.tgz', '.txz', '.tbz2', '.7z', '.zip', '.tar', '.rar'].find((s) => lower.endsWith(s));
  if (known) name = name.slice(0, -known.length);
  return path.join(dir, `${name}.${FORMATS[format].ext}`);
}

function defaultArchivePath(items, format = 'zip') {
  if (!items.length) return `arsiv.${FORMATS[format].ext}`;
  const first = items[0];
  const parent = path.dirname(first);
  let base;
  if (items.length === 1) {
    base = path.basename(first);
    let isDir = false;
    try {
      isDir = fs.statSync(first).isDirectory();
    } catch {}
    if (!isDir && path.extname(base)) base = base.slice(0, -path.extname(base).length);
  } else {
    base = path.basename(parent);
  }
  if (!base || base === path.sep) base = 'arsiv';
  return path.join(parent, `${base}.${FORMATS[format].ext}`);
}

// opts: {archivePath, format, level 0-5, password, encryptNames, solid, volumeSize ("100m"), recovery, deleteAfter}
// Returns sequential steps; tar.gz-like formats pack a temporary tar first and compress it in a second step.
function compressSteps(items, opts) {
  const f = FORMATS[opts.format];
  if (!f) throw new Error('Unknown format: ' + opts.format);
  const level = Math.max(0, Math.min(5, opts.level ?? 3));
  const mx = MX[level];
  const vol = f.volumes && opts.volumeSize ? String(opts.volumeSize).trim() : '';
  const pw = f.password ? opts.password || '' : '';
  const base = ['a', '-y', '-bsp1', '-bb1', '-sccUTF-8'];
  if (vol) base.push('-v' + vol);
  if (opts.deleteAfter) base.push('-sdel');

  switch (opts.format) {
    case 'rar': {
      const a = ['a', '-ep1', '-y', `-m${level}`, '-ma5'];
      if (opts.solid) a.push('-s');
      if (opts.recovery) a.push('-rr3');
      if (vol) a.push('-v' + vol);
      if (opts.deleteAfter) a.push('-df');
      a.push(...rarPasswordArgs(pw, opts.encryptNames));
      return [{ title: 'compress', tool: 'rar', args: [...a, '--', opts.archivePath, ...items] }];
    }
    case '7z': {
      const a = [...base, '-t7z', `-mx=${mx}`, opts.solid ? '-ms=on' : '-ms=off'];
      if (pw) {
        a.push('-p' + pw);
        if (opts.encryptNames) a.push('-mhe=on');
      }
      return [{ title: 'compress', tool: '7z', args: [...a, '--', opts.archivePath, ...items] }];
    }
    case 'zip': {
      const a = [...base, '-tzip', `-mx=${mx}`];
      if (pw) a.push('-p' + pw, '-mem=AES256');
      return [{ title: 'compress', tool: '7z', args: [...a, '--', opts.archivePath, ...items] }];
    }
    case 'tar':
      return [{ title: 'pack', tool: '7z', args: [...base, '-ttar', '--', opts.archivePath, ...items] }];
    default: {
      const tmpTar = path.join(os.tmpdir(), `sikistirma-${process.pid}-${Date.now()}.tar`);
      const step1 = ['a', '-y', '-bsp1', '-bb1', '-sccUTF-8', '-ttar'];
      if (opts.deleteAfter) step1.push('-sdel');
      return [
        { title: 'pack', tool: '7z', args: [...step1, '--', tmpTar, ...items], cleanup: tmpTar },
        {
          title: 'compress',
          tool: '7z',
          args: ['a', '-y', '-bsp1', '-bb1', '-sccUTF-8', `-t${f.outer}`, `-mx=${mx}`, '--', opts.archivePath, tmpTar],
          cleanup: tmpTar,
        },
      ];
    }
  }
}

function addStages(info, items, password) {
  if (info.isRar) {
    return [{ tool: 'rar', args: ['a', '-ep1', '-y', ...rarPasswordArgs(password, info.headersEncrypted), '--', info.path, ...items] }];
  }
  // For "a" an empty "-p" makes 7-Zip ask on the console, so the switch is only given with a password.
  const args = ['a', '-y', '-bsp1', '-bb1', '-sccUTF-8'];
  if (password) args.push('-p' + password);
  if (info.headersEncrypted && info.rawType === '7z') args.push('-mhe=on');
  if (info.rawType === 'zip' && password) args.push('-mem=AES256');
  return [{ tool: '7z', args: [...args, '--', info.path, ...items] }];
}

function deleteStages(info, names, password) {
  if (info.isRar) {
    return [{ tool: 'rar', args: ['d', '-y', ...rarPasswordArgs(password), '--', info.path, ...names] }];
  }
  const args = ['d', '-y', '-bsp1', '-bb1', '-sccUTF-8'];
  if (password) args.push('-p' + password);
  return [{ tool: '7z', args: [...args, '--', info.path, ...names] }];
}

module.exports = {
  FORMATS,
  MX,
  toolsDir,
  sevenZipPath,
  isArchive,
  isRar,
  isMultiVolume,
  isTarCompressed,
  safeComponents,
  topLevel,
  topLevelNames,
  isAppleMetadata,
  folderNamedAfterArchive,
  uniquePath,
  formatFromPath,
  replaceFormatExt,
  defaultArchivePath,
  pw7z,
  rarPasswordArgs,
  Result,
  Job,
  run,
  listStages,
  parseListing,
  list,
  extractStages,
  testStages,
  compressSteps,
  addStages,
  deleteStages,
};
