// RARLAB's command-line RAR (rar on macOS, Rar.exe from WinRAR on Windows). It may not be redistributed, so it is
// never bundled: the user installs it and this module only finds it. 7-Zip reads RAR without it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const DOWNLOAD_PAGE = 'https://www.rarlab.com/download.htm';

function candidates(customPath, installDir) {
  const list = [];
  if (customPath) list.push(customPath);
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)']) {
      if (base) list.push(path.join(base, 'WinRAR', 'Rar.exe'));
    }
  } else {
    if (installDir) list.push(path.join(installDir, 'rar'));
    list.push('/usr/local/bin/rar', '/opt/homebrew/bin/rar', path.join(os.homedir(), 'bin', 'rar'));
  }
  return [...new Set(list)];
}

function isUsableFile(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findRar(customPath, installDir) {
  return candidates(customPath, installDir).find(isUsableFile) || null;
}

// "RAR 7.13" or null when the binary does not run.
function rarVersion(rarPath) {
  if (!rarPath) return null;
  try {
    const r = spawnSync(rarPath, [], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const out = `${r.stdout || ''}\n${r.stderr || ''}`;
    for (const line of out.split(/\r?\n/)) {
      const m = /^\s*(RAR \d+\.\d+)/.exec(line);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

// Accepts the rar program itself, the folder holding it, or (macOS) the rarmacos-*.tar.gz from RARLAB, which is
// unpacked with the bundled 7-Zip into installDir. Returns the path to use.
function installFrom(selected, installDir, sevenZip) {
  const exeName = process.platform === 'win32' ? 'Rar.exe' : 'rar';
  let st;
  try {
    st = fs.statSync(selected);
  } catch {
    throw new Error('not_found');
  }
  if (st.isDirectory()) {
    const found = findInDir(selected, exeName);
    if (!found) throw new Error('not_found');
    return found;
  }
  const lower = selected.toLowerCase();
  if (process.platform !== 'win32' && (lower.endsWith('.tar.gz') || lower.endsWith('.tgz'))) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rar-install-'));
    try {
      execFileSync(sevenZip, ['x', '-y', `-o${tmp}`, selected], { stdio: 'ignore' });
      const tar = fs.readdirSync(tmp).find((f) => f.endsWith('.tar'));
      if (tar) execFileSync(sevenZip, ['x', '-y', `-o${tmp}`, path.join(tmp, tar)], { stdio: 'ignore' });
      const dir = findInDir(tmp, exeName);
      if (!dir) throw new Error('not_found');
      fs.rmSync(installDir, { recursive: true, force: true });
      fs.mkdirSync(installDir, { recursive: true });
      for (const name of fs.readdirSync(path.dirname(dir))) {
        const s = path.join(path.dirname(dir), name);
        if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(installDir, name));
      }
      const rar = path.join(installDir, 'rar');
      fs.chmodSync(rar, 0o755);
      try { execFileSync('xattr', ['-dr', 'com.apple.quarantine', installDir], { stdio: 'ignore' }); } catch {}
      return rar;
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  if (path.basename(selected).toLowerCase() === exeName.toLowerCase()) {
    if (process.platform !== 'win32') {
      try { fs.chmodSync(selected, 0o755); } catch {}
    }
    return selected;
  }
  throw new Error('not_found');
}

function findInDir(dir, exeName, depth = 0) {
  const direct = path.join(dir, exeName);
  if (isUsableFile(direct)) return direct;
  if (depth > 3) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const f = findInDir(path.join(dir, e.name), exeName, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

module.exports = { DOWNLOAD_PAGE, findRar, rarVersion, installFrom };
