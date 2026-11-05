// HATA-0414: arşiv içeriği pencereden dışarı sürüklenebilmeli (satır draggable + ana süreçte startDrag).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('satırlar sürüklenebilir ve dragstart dışarı çıkarmayı başlatır', () => {
  const t = read('src/components/ArchiveTable.tsx');
  assert.match(t, /draggable/);
  assert.match(t, /onDragStart=\{[\s\S]*onDragOut\(/);
});

test('ana süreç drag_out ile geçici klasöre açıp startDrag çağırır', () => {
  const m = read('electron/main.cjs');
  assert.match(m, /case 'drag_out'/);
  assert.match(m, /startDrag\(\{[^}]*files/);
});

// HATA-0415: paketlenen uygulamada docs/ yok (build.files); boş ikonla startDrag hata verir, Windows'ta sürükleme hiç başlamaz.
test('sürükleme ikonu paketlenmeyen docs/ klasöründen alınmaz', () => {
  const m = read('electron/main.cjs');
  const pkg = JSON.parse(read('package.json'));
  const drag = m.slice(m.indexOf("case 'drag_out'"), m.indexOf("case 'reveal'"));
  const icon = m.slice(m.indexOf('async function dragIcon'), m.indexOf("ipcMain.on('renderer-ready'"));
  assert.ok(!pkg.build.files.some((f) => f.startsWith('docs')));
  assert.doesNotMatch(drag + icon, /'docs'/);
  assert.match(drag, /icon: await dragIcon\(/);
  assert.match(icon, /getFileIcon\(/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'favicon-32.png')));
});

// HATA-0416: macOS'ta yerel sürükleme yalnız fare tuşu basılıyken başlar; açma (7zz) bitene dek tuş bırakılmış olur.
test("macOS'ta sürükleme arşiv açılmadan önce başlar", () => {
  const m = read('electron/main.cjs');
  const drag = m.slice(m.indexOf("case 'drag_out'"), m.indexOf("case 'reveal'"));
  const early = drag.indexOf("process.platform === 'darwin'");
  assert.ok(early > 0);
  const firstDrag = drag.indexOf('startDrag(', early);
  assert.ok(firstDrag > early && firstDrag < drag.indexOf('sz.run('));
  assert.match(drag, /if \(!early\) e\.sender\.startDrag/);
});
