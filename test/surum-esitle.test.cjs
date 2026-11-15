const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const kok = path.join(__dirname, '..');
const betik = path.join(kok, 'scripts', 'surum-esitle.cjs');

function kopya() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'surum-'));
  fs.mkdirSync(path.join(d, 'scripts'));
  fs.mkdirSync(path.join(d, 'build'));
  fs.copyFileSync(betik, path.join(d, 'scripts', 'surum-esitle.cjs'));
  fs.copyFileSync(path.join(kok, 'package.json'), path.join(d, 'package.json'));
  fs.copyFileSync(path.join(kok, 'build', 'license.txt'), path.join(d, 'build', 'license.txt'));
  if (fs.existsSync(path.join(kok, 'Extension'))) {
    fs.mkdirSync(path.join(d, 'Extension'));
    fs.copyFileSync(path.join(kok, 'Extension', 'manifest.json'), path.join(d, 'Extension', 'manifest.json'));
  }
  return d;
}
const calistir = (d, ...a) => spawnSync(process.execPath, [path.join(d, 'scripts', 'surum-esitle.cjs'), ...a], { encoding: 'utf8' });

test('gerçek depo: sürüm ve telif dosyaları package.json ile uyumlu', () => {
  const r = calistir(kok, '--kontrol');
  assert.equal(r.status, 0, r.stderr);
});

test('bozulmuş lisans sürümü denetimde hata verir, eşitleme düzeltir', () => {
  const d = kopya();
  const lic = path.join(d, 'build', 'license.txt');
  fs.writeFileSync(lic, fs.readFileSync(lic, 'utf8').replace(/^Sürüm:.*$/m, 'Sürüm: 9.9.9'));
  const r = calistir(d, '--kontrol');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /license\.txt/);
  assert.equal(calistir(d).status, 0);
  assert.equal(calistir(d, '--kontrol').status, 0);
  const { version } = require('../package.json');
  assert.match(fs.readFileSync(lic, 'utf8'), new RegExp(`^Sürüm: ${version.replace(/\./g, '\\.')}$`, 'm'));
});

test('telif yılı uyuşmazlığı hata verir', () => {
  const d = kopya();
  const lic = path.join(d, 'build', 'license.txt');
  fs.writeFileSync(lic, fs.readFileSync(lic, 'utf8').replace(/\(c\) 2026/, '(c) 2019'));
  const r = calistir(d, '--kontrol');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /telif yılı/);
});

test('package.json copyright ile build.copyright farklıysa hata verir', () => {
  const d = kopya();
  const p = path.join(d, 'package.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.build.copyright = 'Copyright © 2019 tarusatolye';
  fs.writeFileSync(p, JSON.stringify(j));
  assert.equal(calistir(d, '--kontrol').status, 1);
});
