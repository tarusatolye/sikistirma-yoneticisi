// electron-builder afterSign kancası: macOS uygulamasını Apple'a notarize eder ve
// bileti uygulamaya zımbalar (staple). Kimlik bilgisi repoda tutulmaz; notarytool'un
// anahtar zincirindeki profili kullanılır (varsayılan: tarus-notary,
// APPLE_KEYCHAIN_PROFILE ile değiştirilebilir). NOTARIZE=0 ile atlanır (yerel deneme).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

exports.default = async function notarize(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.NOTARIZE === '0') {
    console.log('  • notarize atlandı (NOTARIZE=0)');
    return;
  }
  const profile = process.env.APPLE_KEYCHAIN_PROFILE || 'tarus-notary';
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notarize-'));
  const zip = path.join(tmp, 'app.zip');
  try {
    console.log(`  • notarize     app=${appPath} profile=${profile}`);
    execFileSync('ditto', ['-c', '-k', '--keepParent', appPath, zip], { stdio: 'inherit' });
    execFileSync('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', profile, '--wait'], { stdio: 'inherit' });
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};
