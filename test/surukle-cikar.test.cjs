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
