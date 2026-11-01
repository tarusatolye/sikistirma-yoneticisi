// Drives the real 7-Zip binary in bin/ (fetched by `npm install`): builds archives, lists and extracts them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sz = require('../electron/sevenzip.cjs');

const haveEngine = fs.existsSync(sz.sevenZipPath());
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sy-test-'));
const src = path.join(tmp, 'kaynak');

test.before(() => {
  fs.mkdirSync(path.join(src, 'alt klasör'), { recursive: true });
  fs.writeFileSync(path.join(src, 'merhaba.txt'), 'merhaba dünya\n'.repeat(200));
  fs.writeFileSync(path.join(src, 'alt klasör', 'çğışöü.txt'), 'Türkçe ad\n');
  fs.writeFileSync(path.join(src, 'alt klasör', 'veri.bin'), Buffer.alloc(64 * 1024, 7));
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function compress(format, extra = {}) {
  const archivePath = path.join(tmp, `deneme-${format}-${Object.keys(extra).join('-') || 'duz'}.${sz.FORMATS[format].ext}`);
  const steps = sz.compressSteps([src], { archivePath, format, level: 3, ...extra });
  for (const step of steps) {
    const r = await sz.run([step]);
    assert.ok(r.ok, `${format} ${step.title}: ${r.errorSummary}`);
  }
  for (const s of steps) if (s.cleanup) fs.rmSync(s.cleanup, { force: true });
  return archivePath;
}

function paths(info) {
  return info.entries.map((e) => e.path).sort();
}

const EXPECTED = ['kaynak', 'kaynak/alt klasör', 'kaynak/alt klasör/veri.bin', 'kaynak/alt klasör/çğışöü.txt', 'kaynak/merhaba.txt'];

for (const format of ['zip', '7z', 'tar', 'tar.gz', 'tar.xz', 'tar.bz2']) {
  test(`${format}: oluştur, listele, çıkart`, { skip: !haveEngine && '7-Zip yok (npm run fetch-tools)' }, async () => {
    const archive = await compress(format);
    const res = await sz.list(archive, null);
    assert.equal(res.status, 'ok', res.summary);
    assert.deepEqual(paths(res.info).filter((p) => !p.startsWith('.')), EXPECTED);
    const file = res.info.entries.find((e) => e.path === 'kaynak/merhaba.txt');
    assert.equal(file.size, 'merhaba dünya\n'.repeat(200).length * 1 + 200);
    assert.equal(res.info.tarCompressed, format.startsWith('tar.'));
    assert.equal(res.info.supportsModification, ['zip', '7z', 'tar'].includes(format));

    const dest = path.join(tmp, `cikti-${format}`);
    const r = await sz.run(sz.extractStages(res.info, null, dest, null, 'overwrite'));
    assert.ok(r.ok, r.errorSummary);
    assert.equal(fs.readFileSync(path.join(dest, 'kaynak', 'alt klasör', 'çğışöü.txt'), 'utf8'), 'Türkçe ad\n');

    const t = await sz.run(sz.testStages(res.info, null));
    assert.ok(t.ok, t.errorSummary);
  });
}

test('seçilen öğeleri çıkartma yalnızca onları yazar', { skip: !haveEngine }, async () => {
  const archive = await compress('zip');
  const { info } = await sz.list(archive, null);
  const dest = path.join(tmp, 'secilen');
  const r = await sz.run(sz.extractStages(info, ['kaynak/alt klasör'], dest, null, 'overwrite'));
  assert.ok(r.ok, r.errorSummary);
  assert.ok(fs.existsSync(path.join(dest, 'kaynak', 'alt klasör', 'veri.bin')));
  assert.ok(!fs.existsSync(path.join(dest, 'kaynak', 'merhaba.txt')));
});

test('ilerleme olayları: dosya adı ve yüzde gelir', { skip: !haveEngine }, async () => {
  const archive = await compress('7z');
  const { info } = await sz.list(archive, null);
  const files = [];
  const pcts = [];
  const result = await new Promise((resolve) => {
    new sz.Job(sz.extractStages(info, null, path.join(tmp, 'ilerleme'), null, 'overwrite'))
      .on('file', (f) => files.push(f))
      .on('percent', (p) => pcts.push(p))
      .on('done', resolve)
      .start();
  });
  assert.ok(result.ok);
  assert.ok(files.includes('kaynak/merhaba.txt'), files.join(', '));
  assert.ok(pcts.every((p) => p >= 0 && p <= 100));
});

test('7z ad şifreleme: şifre sorulur, yanlışı ayırt edilir, doğrusuyla açılır', { skip: !haveEngine }, async () => {
  const archive = await compress('7z', { password: 'gizli', encryptNames: true });
  assert.deepEqual(await sz.list(archive, null), { status: 'password', wrong: false });
  assert.deepEqual(await sz.list(archive, 'yanlis'), { status: 'password', wrong: true });
  const ok = await sz.list(archive, 'gizli');
  assert.equal(ok.status, 'ok');
  assert.equal(ok.info.headersEncrypted, true);
  assert.ok(ok.info.hasEncrypted);

  const bad = await sz.run(sz.extractStages(ok.info, null, path.join(tmp, 'yanlis'), 'yanlis', 'overwrite'));
  assert.ok(!bad.ok);
  assert.ok(bad.wrongPassword);
  const good = await sz.run(sz.extractStages(ok.info, null, path.join(tmp, 'dogru'), 'gizli', 'overwrite'));
  assert.ok(good.ok, good.errorSummary);
});

test('şifreli zip: liste şifresiz açılır, dosyalar şifreli işaretlenir', { skip: !haveEngine }, async () => {
  const archive = await compress('zip', { password: 'gizli' });
  const res = await sz.list(archive, null);
  assert.equal(res.status, 'ok');
  assert.equal(res.info.headersEncrypted, false);
  assert.ok(res.info.entries.find((e) => e.path === 'kaynak/merhaba.txt').encrypted);
  const bad = await sz.run(sz.extractStages(res.info, null, path.join(tmp, 'zip-yanlis'), 'yok', 'overwrite'));
  assert.ok(bad.wrongPassword);
});

test('arşive dosya ekleme ve silme', { skip: !haveEngine }, async () => {
  const archive = await compress('7z');
  const extra = path.join(tmp, 'ek.txt');
  fs.writeFileSync(extra, 'ek');
  let { info } = await sz.list(archive, null);
  assert.ok((await sz.run(sz.addStages(info, [extra], null))).ok);
  ({ info } = await sz.list(archive, null));
  assert.ok(paths(info).includes('ek.txt'));
  assert.ok((await sz.run(sz.deleteStages(info, ['kaynak/merhaba.txt'], null))).ok);
  ({ info } = await sz.list(archive, null));
  assert.ok(!paths(info).includes('kaynak/merhaba.txt'));
  assert.ok(paths(info).includes('kaynak/alt klasör/veri.bin'));
});

test('parçalara bölünmüş 7z (.7z.001) tek arşiv gibi açılır', { skip: !haveEngine }, async () => {
  fs.writeFileSync(path.join(src, 'rastgele.bin'), require('crypto').randomBytes(300 * 1024));
  try {
    const archive = await compress('7z', { volumeSize: '100k' });
    assert.ok(fs.existsSync(archive + '.002'));
    const res = await sz.list(archive + '.001', null);
    assert.equal(res.status, 'ok', res.summary);
    assert.ok(res.info.multiVolume);
    assert.ok(paths(res.info).includes('kaynak/rastgele.bin'));
  } finally {
    fs.rmSync(path.join(src, 'rastgele.bin'));
  }
});

test('arşiv olmayan dosya hata verir', { skip: !haveEngine }, async () => {
  const f = path.join(tmp, 'duz.txt');
  fs.writeFileSync(f, 'arşiv değil');
  const res = await sz.list(f, null);
  assert.equal(res.status, 'error');
});

test('biçim ve yol yardımcıları', () => {
  assert.ok(sz.isArchive('a.part2.rar'));
  assert.ok(sz.isArchive('x.r01'));
  assert.ok(sz.isArchive('x.7z.001'));
  assert.ok(!sz.isArchive('x.txt'));
  assert.ok(sz.isTarCompressed('a.tar.gz') && sz.isTarCompressed('a.TGZ') && !sz.isTarCompressed('a.gz'));
  assert.ok(sz.isMultiVolume('film.part1.rar'));
  assert.equal(sz.folderNamedAfterArchive(path.join('d', 'film.part1.rar')), path.join('d', 'film'));
  assert.equal(sz.folderNamedAfterArchive(path.join('d', 'x.7z.001')), path.join('d', 'x'));
  assert.equal(sz.folderNamedAfterArchive(path.join('d', 'x.tar.gz')), path.join('d', 'x'));
  assert.equal(sz.safeComponents('../etc/passwd'), null);
  assert.equal(sz.safeComponents('/abs'), null);
  assert.deepEqual(sz.safeComponents('./a//b/'), ['a', 'b']);
  assert.ok(sz.isAppleMetadata('__MACOSX/a') && sz.isAppleMetadata('d/._x'));
  assert.equal(sz.replaceFormatExt(path.join('d', 'a.tar.gz'), 'zip'), path.join('d', 'a.zip'));
  assert.equal(sz.formatFromPath('a.tgz'), 'tar.gz');
});

test('biçimin desteklemediği seçenek komuta girmez', () => {
  const [step] = sz.compressSteps(['x'], { archivePath: 'a.tar', format: 'tar', password: 'p', volumeSize: '10m', solid: true });
  assert.ok(!step.args.some((a) => a.startsWith('-p') || a.startsWith('-v') || a.startsWith('-ms')));
  const [zip] = sz.compressSteps(['x'], { archivePath: 'a.zip', format: 'zip', password: 'p', encryptNames: true, level: 5 });
  assert.ok(zip.args.includes('-mem=AES256') && zip.args.includes('-mx=9') && !zip.args.includes('-mhe=on'));
  const [rar] = sz.compressSteps(['x'], { archivePath: 'a.rar', format: 'rar', password: 'p', encryptNames: true, solid: true, level: 0 });
  assert.equal(rar.tool, 'rar');
  assert.ok(rar.args.includes('-hpp') && rar.args.includes('-s') && rar.args.includes('-m0') && rar.args.includes('-ma5'));
  const [noPw] = sz.compressSteps(['x'], { archivePath: 'a.rar', format: 'rar' });
  assert.ok(!noPw.args.some((a) => a.startsWith('-p') || a.startsWith('-hp')));
});

test('7z ilerleme satırı ayrıştırılır', () => {
  const job = new sz.Job([{ tool: '7z', args: [] }]);
  const ev = [];
  job.on('file', (f) => ev.push(['f', f])).on('percent', (p) => ev.push(['p', p]));
  job.consume(' 42% 3 - kaynak/a.txt\x08\x08\x08\x08');
  job.consume('\n- kaynak/b.txt\n');
  assert.ok(ev.some(([k, v]) => k === 'f' && v === 'kaynak/a.txt'));
  assert.ok(ev.some(([k, v]) => k === 'f' && v === 'kaynak/b.txt'));
  assert.ok(ev.some(([k, v]) => k === 'p' && v === 42));
});
