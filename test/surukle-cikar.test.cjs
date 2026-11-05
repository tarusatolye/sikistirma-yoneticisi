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
  assert.ok(!pkg.build.files.some((f) => f.startsWith('docs')));
  assert.doesNotMatch(drag, /'docs'/);
  assert.match(drag, /getFileIcon\(/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'favicon-32.png')));
});
