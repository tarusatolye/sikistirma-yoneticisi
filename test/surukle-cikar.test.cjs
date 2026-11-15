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

const dragBlock = (m) => m.slice(m.indexOf("ipcMain.on('drag-out-sync'"), m.indexOf("ipcMain.on('renderer-ready'"));

// Electron: startDrag dragstart'a yanıt olarak, dosyalar varken, eşzamanlı çağrılmalı (macOS fare basılıyken ister).
test('ana süreç eşzamanlı çıkarıp aynı işleyicide startDrag çağırır', () => {
  const m = read('electron/main.cjs');
  const drag = dragBlock(m);
  assert.match(drag, /sz\.runSync\(/);
  assert.doesNotMatch(drag, /await /);
  assert.ok(drag.indexOf('runSync(') < drag.indexOf('startDrag('));
  assert.match(drag, /startDrag\(\{[^}]*files/);
  assert.match(read('electron/preload.cjs'), /sendSync\('drag-out-sync'/);
});

// HATA-0415: paketlenen uygulamada docs/ yok (build.files); boş ikonla startDrag hata verir.
test('sürükleme ikonu paketlenmeyen docs/ klasöründen alınmaz', () => {
  const m = read('electron/main.cjs');
  const pkg = JSON.parse(read('package.json'));
  const icon = m.slice(m.indexOf('function dragIconSync'), m.indexOf("ipcMain.on('drag-out-sync'"));
  assert.ok(!pkg.build.files.some((f) => f.startsWith('docs')));
  assert.doesNotMatch(dragBlock(m) + icon, /'docs'/);
  assert.match(dragBlock(m), /icon: dragIconSync\(\)/);
  assert.match(icon, /createFromPath\(/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'favicon-32.png')));
});

test('tek arşiv bırakılınca soru sorulmadan açılır', () => {
  const a = read('src/App.tsx');
  assert.match(a, /if \(singleArchive\) \{\s*openArchive\(paths\[0\]\);/);
});
