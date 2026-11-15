# Sürüm çıkarma kontrol listesi

Sürüm numarasının **tek kaynağı `package.json` içindeki `version`** alanıdır. Başka hiçbir yere elle sürüm yazılmaz.

## Otomatik türetilenler
| Yer | Nasıl |
|---|---|
| Uygulama içi sürüm (`v.x.y.z`) | `vite.config.ts` → `__APP_VERSION__` |
| Kurulum dosyası / dmg / zip adları, macOS `CFBundleShortVersionString`, Windows dosya sürümü | electron-builder `package.json`'dan alır |
| `build/license.txt` → `Sürüm:` satırı (NSIS lisans anlaşması) | `scripts/surum-esitle.cjs` |
| Güncelleme akışı (`latest.yml`, `latest-mac.yml`) | `electron-builder` üretir; GitHub Releases'e yüklenir |

Telif yılı `package.json` içindeki `copyright` ile `build.copyright` ve lisans metinlerinde aynı olmalıdır; farklıysa betik hata verir.

## Adımlar
1. `main` güncel ve temiz olsun; yeni bir dalda çalış (main'e doğrudan push yok).
2. `npm version patch` (ya da `minor` / `major`): `package.json` ve `package-lock.json` yükselir, `version` kancası lisans anlaşmasını (`build/license.txt`) eşitler, hepsi tek commit ve `v…` etiketi olur. (Etiket oluşmasın istenirse `--no-git-tag-version`; bu durumda `npm run surum-esitle` elle çalıştırılır.)
3. `npm run surum-kontrol` ve `npm test` yeşil olmalı.
4. `npm run build` (öncesinde `prebuild` uyuşmazlıkta durdurur).
5. Pakette: `npm run dist:mac` / `npm run dist:win`. Çıktıda dosya adındaki sürümü kontrol et.
6. Hakkında/ayarlar ekranında sürümün doğru göründüğünü bir kez gözle doğrula.
7. PR aç, CI yeşilse birleştir, etiketi ve sürüm notlarını GitHub Releases'e koy (`latest*.yml` dosyalarıyla birlikte).
8. Sürüm notunu Kılavuz'a da yaz.

## Sorun giderme
- «Sürüm/telif uyuşmazlığı» hatası: `npm run surum-esitle` çalıştır, değişikliği commit et.
- Betik: `scripts/surum-esitle.cjs`; testi: `test/surum-esitle.test.cjs`.
- Eski etiket önek içermez (`0.0.1`); `npm version` varsayılan olarak `v0.0.2` üretir. Aynı biçimi korumak için `npm version patch --tag-version-prefix=`.
