// Sürüm tek kaynaktan gelir: package.json "version".
//   node scripts/surum-esitle.cjs            → türetilen dosyaları package.json'a eşitler
//   node scripts/surum-esitle.cjs --kontrol  → hiçbir şey yazmaz; uyuşmazlıkta hata verir (çıkış kodu 1)
// `npm version` sırasında (version kancası) eşitler, `npm run build` öncesinde (prebuild) denetler.
const fs = require('fs');
const path = require('path');

const kok = path.join(__dirname, '..');
const kontrolModu = process.argv.includes('--kontrol');
const oku = (g) => fs.readFileSync(path.join(kok, g), 'utf8');
const pkg = JSON.parse(oku('package.json'));
const hatalar = [];
const yazilanlar = [];

if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) hatalar.push(`package.json sürümü x.y.z olmalı: "${pkg.version}"`);

// Telif yılı: package.json "copyright" ile electron-builder "build.copyright" aynı olmalı.
if (pkg.copyright !== pkg.build.copyright) {
  hatalar.push(`package.json copyright ("${pkg.copyright}") ile build.copyright ("${pkg.build.copyright}") farklı`);
}
const yil = (pkg.copyright.match(/\b(20\d\d)\b/) || [])[1];
if (!yil) hatalar.push('package.json copyright içinde yıl yok');

// Türetilen dosyayı eşitle ya da denetle.
function esitle(gorece, donustur, aciklama) {
  const p = path.join(kok, gorece);
  if (!fs.existsSync(p)) return;
  const eski = fs.readFileSync(p, 'utf8');
  const yeni = donustur(eski);
  if (yeni === null) { hatalar.push(`${gorece}: ${aciklama} bulunamadı`); return; }
  if (yeni === eski) return;
  if (kontrolModu) hatalar.push(`${gorece}: ${aciklama} package.json (${pkg.version}) ile uyuşmuyor — "npm run surum-esitle" çalıştırın`);
  else { fs.writeFileSync(p, yeni); yazilanlar.push(gorece); }
}

// NSIS lisans anlaşması: "Sürüm: x.y.z" satırı (yoksa "Ürün:" satırından sonra eklenir).
esitle('build/license.txt', (s) => {
  if (/^Sürüm:.*$/m.test(s)) return s.replace(/^Sürüm:.*$/m, `Sürüm: ${pkg.version}`);
  if (/^Ürün:.*$/m.test(s)) return s.replace(/^(Ürün:.*)$/m, `$1\nSürüm: ${pkg.version}`);
  return null;
}, '"Sürüm:" satırı');

// Tarayıcı eklentisi manifesti (varsa).
esitle('Extension/manifest.json', (s) => (/"version":\s*"[^"]*"/.test(s)
  ? s.replace(/("version":\s*")[^"]*(")/, `$1${pkg.version}$2`) : null), '"version" alanı');

// Telif yılı lisans metinlerinde package.json ile aynı olmalı (elle yıl yazılmışsa yakalanır).
for (const g of ['build/license.txt', 'LICENSE']) {
  if (!fs.existsSync(path.join(kok, g)) || !yil) continue;
  const yillar = [...oku(g).matchAll(/\(c\)\s*(20\d\d)/gi)].map((m) => m[1]);
  for (const y of yillar) if (y !== yil) hatalar.push(`${g}: telif yılı ${y}, package.json'da ${yil}`);
}

if (hatalar.length) {
  console.error('Sürüm/telif uyuşmazlığı:\n - ' + hatalar.join('\n - '));
  process.exit(1);
}
if (yazilanlar.length) console.log(`Sürüm ${pkg.version} → ${yazilanlar.join(', ')}`);
else if (kontrolModu) console.log(`Sürüm ${pkg.version}: tüm dosyalar uyumlu`);
