// Dragging entries out of an archive: the extract helper behind the drag_out IPC.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sz = require('../electron/sevenzip.cjs');
const dragout = require('../electron/dragout.cjs');

const haveEngine = fs.existsSync(sz.sevenZipPath());
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-surukle-'));
const src = path.join(tmp, 'kaynak');

test.before(() => {
  fs.mkdirSync(path.join(src, 'alt klasör'), { recursive: true });
  fs.writeFileSync(path.join(src, 'merhaba.txt'), 'merhaba\n');
  fs.writeFileSync(path.join(src, 'çğışöü.txt'), 'Türkçe\n');
  fs.writeFileSync(path.join(src, 'alt klasör', 'veri.bin'), Buffer.alloc(1024, 7));
});
test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function makeZip(password) {
  const archivePath = path.join(tmp, password ? 'sifreli.zip' : 'duz.zip');
  const steps = sz.compressSteps([src], { archivePath, format: 'zip', level: 3, ...(password ? { password } : {}) });
  for (const s of steps) assert.ok((await sz.run([s])).ok);
  const res = await sz.list(archivePath, password || null);
  assert.equal(res.status, 'ok');
  return res.info;
}

test('sürükleme: iki dosya ve bir klasör geçici klasöre çıkar', { skip: !haveEngine }, async () => {
  const info = await makeZip();
  const names = ['kaynak/merhaba.txt', 'kaynak/çğışöü.txt', 'kaynak/alt klasör'];
  const r = await dragout.extractForDrag(info, names, null);
  assert.equal(r.status, 'ok');
  try {
    assert.ok(r.dir.startsWith(dragout.dragRoot() + path.sep));
    assert.deepEqual(
      r.paths.map((p) => path.relative(r.dir, p).split(path.sep).join('/')).sort(),
      [...names].sort()
    );
    for (const p of r.paths) assert.ok(fs.existsSync(p), p);
    assert.equal(fs.readFileSync(r.paths.find((p) => p.endsWith('merhaba.txt')), 'utf8'), 'merhaba\n');
    assert.ok(fs.existsSync(path.join(r.dir, 'kaynak', 'alt klasör', 'veri.bin')));
  } finally {
    fs.rmSync(r.dir, { recursive: true, force: true });
  }
});

test('sürükleme: şifreli arşivde şifre yoksa/yanlışsa password, doğruysa çıkar', { skip: !haveEngine }, async () => {
  const info = await makeZip('gizli');
  const names = ['kaynak/merhaba.txt'];
  assert.equal((await dragout.extractForDrag(info, names, null)).status, 'password');
  assert.equal((await dragout.extractForDrag(info, names, 'yanlis')).status, 'password');
  const r = await dragout.extractForDrag(info, names, 'gizli');
  assert.equal(r.status, 'ok');
  assert.ok(fs.existsSync(r.paths[0]));
  fs.rmSync(r.dir, { recursive: true, force: true });
});
