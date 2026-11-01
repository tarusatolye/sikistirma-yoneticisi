// Downloads the official 7-Zip command-line engine into bin/<platform>/ (bundled through extraResources).
//   bin/mac/7zz              universal macOS binary from 7z<ver>-mac.tar.xz
//   bin/win/7z.exe, 7z.dll   full 7-Zip (RAR, ISO, CAB... support) from the x64 installer, which is itself a 7z SFX
// Usage: node scripts/fetch-tools.cjs [--platform mac|win|all] [--force]
// RARLAB's rar is not downloaded: it may not be redistributed, users install it themselves.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const VERSION = process.env.SEVENZIP_VERSION || '2604'; // 7-Zip 26.04
const TAG = `${VERSION.slice(0, 2)}.${VERSION.slice(2)}`;
const BASE = `https://github.com/ip7z/7zip/releases/download/${TAG}`;
const root = path.join(__dirname, '..');
const binDir = path.join(root, 'bin');

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const pIdx = argv.indexOf('--platform');
const hostPlatform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : null;
const wanted = pIdx >= 0 ? argv[pIdx + 1] : hostPlatform;

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'sikistirma-yoneticisi-fetch-tools' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects > 5) return reject(new Error('Too many redirects: ' + url));
          return resolve(download(new URL(res.headers.location, url).toString(), dest, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sy-7zip-'));
}

async function fetchMac() {
  const dir = path.join(binDir, 'mac');
  if (!force && fs.existsSync(path.join(dir, '7zz'))) return console.log('✔ bin/mac/7zz already present');
  if (process.platform === 'win32') throw new Error('The macOS engine can only be prepared on macOS or Linux (needs tar -J).');
  console.log(`▸ Downloading 7-Zip ${TAG} for macOS`);
  const tmp = tmpDir();
  try {
    const archive = path.join(tmp, '7z-mac.tar.xz');
    await download(`${BASE}/7z${VERSION}-mac.tar.xz`, archive);
    execFileSync('tar', ['-xJf', archive, '-C', tmp]);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(tmp, '7zz'), path.join(dir, '7zz'));
    fs.copyFileSync(path.join(tmp, 'License.txt'), path.join(dir, '7zip-license.txt'));
    fs.chmodSync(path.join(dir, '7zz'), 0o755);
    try { execFileSync('xattr', ['-c', path.join(dir, '7zz')]); } catch {}
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('✔ bin/mac/7zz ready');
}

async function fetchWin() {
  const dir = path.join(binDir, 'win');
  if (!force && fs.existsSync(path.join(dir, '7z.exe')) && fs.existsSync(path.join(dir, '7z.dll'))) {
    return console.log('✔ bin/win/7z.exe already present');
  }
  console.log(`▸ Downloading 7-Zip ${TAG} for Windows (x64)`);
  const tmp = tmpDir();
  try {
    const installer = path.join(tmp, '7z-x64.exe');
    await download(`${BASE}/7z${VERSION}-x64.exe`, installer);
    // The installer is a 7z SFX: any 7z extractor reads it. On Windows the standalone 7zr.exe does it,
    // on macOS the 7zz fetched above.
    let extractor;
    if (process.platform === 'win32') {
      extractor = path.join(tmp, '7zr.exe');
      await download(`${BASE}/7zr.exe`, extractor);
    } else {
      await fetchMac();
      extractor = path.join(binDir, 'mac', '7zz');
    }
    fs.mkdirSync(dir, { recursive: true });
    execFileSync(extractor, ['x', '-y', '-t7z', `-o${dir}`, installer, '7z.exe', '7z.dll', 'License.txt'], { stdio: 'ignore' });
    fs.renameSync(path.join(dir, 'License.txt'), path.join(dir, '7zip-license.txt'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('✔ bin/win/7z.exe ready');
}

(async () => {
  if (!wanted) {
    console.log('fetch-tools: no 7-Zip build for this platform; skipping.');
    return;
  }
  if (wanted === 'mac' || wanted === 'all') await fetchMac();
  if (wanted === 'win' || wanted === 'all') await fetchWin();
})().catch((err) => {
  console.error('✖ fetch-tools failed:', err.message);
  process.exit(1);
});
