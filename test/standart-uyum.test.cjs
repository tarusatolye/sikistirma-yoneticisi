const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const kok = path.join(__dirname, '..');

function kaynaklar(dir, desen = /\.tsx?$/) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return kaynaklar(p, desen);
    return desen.test(e.name) ? [p] : [];
  });
}

test('arayüzde yerel select, alert ve confirm kullanılmaz', () => {
  const kaba = [];
  for (const f of kaynaklar(path.join(kok, 'src'))) {
    const s = fs.readFileSync(f, 'utf8');
    if (/<select[\s>]/.test(s)) kaba.push(`${f}: <select>`);
    if (/\b(window\.)?(alert|confirm)\(/.test(s)) kaba.push(`${f}: alert/confirm`);
  }
  assert.deepEqual(kaba, []);
});

test('modal perdesi sabit bg-black yerine --perde token\'ından gelir', () => {
  const kaba = [];
  for (const f of kaynaklar(path.join(kok, 'src', 'components'))) {
    const s = fs.readFileSync(f, 'utf8');
    if (/fixed inset-0[^"`']*\bbg-black\//.test(s)) kaba.push(`${f}: bg-black perde`);
  }
  assert.deepEqual(kaba, []);
  const css = fs.readFileSync(path.join(kok, 'src', 'index.css'), 'utf8');
  assert.match(css, /\.modal-perde\s*{[^}]*var\(--perde\)/);
});

test('arayüz metninde uzun tire, büyük harf CSS ve gizli satır işlemi yok', () => {
  const kaba = [];
  for (const f of kaynaklar(path.join(kok, 'src'))) {
    const s = fs.readFileSync(f, 'utf8');
    if (/—/.test(s)) kaba.push(`${f}: uzun tire`);
    if (/\buppercase\b/.test(s)) kaba.push(`${f}: uppercase`);
    if (/opacity-0[^"`']*group-hover:opacity-100/.test(s)) kaba.push(`${f}: satır işlemi gizli`);
  }
  assert.deepEqual(kaba, []);
});

test('arayüzde "tarus" yazmaz; başlık ve ikon seti yerinde', () => {
  const html = fs.readFileSync(path.join(kok, 'index.html'), 'utf8');
  assert.match(html, /<title>Sıkıştırma Yöneticisi<\/title>/);
  const kaba = [];
  for (const f of [...kaynaklar(path.join(kok, 'src')), path.join(kok, 'index.html')]) {
    const s = fs.readFileSync(f, 'utf8').replace(/tarusatolye|tarus-satir-islem/g, ''); // org name and the shared CSS class are not UI text
    if (/\btarus\b/i.test(s)) kaba.push(f);
  }
  assert.deepEqual(kaba, []);
  const ikonlar = [
    [/<link rel="icon" href="\/favicon\.ico" sizes="48x48"/, 'favicon.ico'],
    [/<link rel="icon" type="image\/svg\+xml" sizes="any" href="\/favicon\.svg"/, 'favicon.svg'],
    [/<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32\.png"/, 'favicon-32.png'],
    [/<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/, 'apple-touch-icon.png'],
  ];
  for (const [desen, dosya] of ikonlar) {
    assert.match(html, desen);
    assert.ok(fs.existsSync(path.join(kok, 'public', dosya)), `public/${dosya} yok`);
  }
  for (const f of ['icon.svg', 'icon.png', 'icon.ico', 'icon.icns']) {
    assert.ok(fs.existsSync(path.join(kok, 'docs', f)), `docs/${f} yok`);
  }
});

test('sürüm numarası yalnız package.json\'da yazılır', () => {
  const kaba = [];
  for (const f of [...kaynaklar(path.join(kok, 'src')), ...kaynaklar(path.join(kok, 'electron'), /\.cjs$/)]) {
    if (/['"`>]v?\.?\d+\.\d+\.\d+['"`<]/.test(fs.readFileSync(f, 'utf8'))) kaba.push(f);
  }
  assert.deepEqual(kaba, []);
});

test('lisans her iki telif satırını korur', () => {
  const lic = fs.readFileSync(path.join(kok, 'LICENSE'), 'utf8');
  assert.match(lic, /Copyright \(c\) 2026 tarusatolye/);
  assert.match(lic, /Copyright \(c\) 2026 Mesut Çevik/);
});
