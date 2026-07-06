const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const certPath = path.join(__dirname, '..', 'build-assets', 'codesign.p12');
const certPass = 'converter';

exports.default = async function (context) {
  const platform = context.electronPlatformName;
  const appDir = context.appOutDir;

  if (platform === 'darwin') {
    await signMac(appDir, context.packager.appInfo.productName);
  } else if (platform === 'win32') {
    await signWin(appDir);
  }
};

async function signMac(appDir, appName) {
  const appPath = [path.join(appDir, `${appName}.app`), path.join(appDir, 'Converter.app')].find(p => fs.existsSync(p));
  if (!appPath) {
    console.log('No .app found in', appDir, 'contents:', fs.readdirSync(appDir));
    return;
  }

  console.log(`\n=== macOS ad-hoc signing: ${appPath} ===`);

  const { sign } = require('@electron/osx-sign');

  try {
    await sign({ app: appPath, identity: '-' });
    console.log('Ad-hoc signing complete via @electron/osx-sign');
  } catch (e) {
    console.error('@electron/osx-sign failed:', e.message);
    console.log('Falling back to manual codesign...');
    try {
      execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
      console.log('Manual ad-hoc signing complete');
    } catch (e2) {
      console.error('Manual codesign also failed:', e2.message);
    }
  }

  execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
  execSync(`codesign -dv --verbose=4 "${appPath}" 2>&1`, { stdio: 'inherit' });
  console.log('=== Done ===\n');
}

async function signWin(appDir) {
  if (!fs.existsSync(certPath)) {
    console.log('No codesign.p12 found — skipping Windows signing');
    return;
  }

  console.log(`\n=== Windows signing: ${appDir} ===`);

  const exes = fs.readdirSync(appDir).filter(f => f.endsWith('.exe'));
  if (exes.length === 0) {
    console.log('No .exe files found in', appDir);
    return;
  }

  const tmpExt = '.signed';
  for (const exe of exes) {
    const exePath = path.join(appDir, exe);
    console.log(`Signing: ${exe}`);

    try {
      const tmpPath = exePath + tmpExt;
      execSync(`osslsigncode sign -pkcs12 "${certPath}" -pass "${certPass}" -n "Converter" -i "https://converter.app" -in "${exePath}" -out "${tmpPath}"`, { stdio: 'inherit' });
      fs.renameSync(tmpPath, exePath);
      console.log(`Signed: ${exe} (osslsigncode)`);
      continue;
    } catch {
      // osslsigncode not available
    }

    try {
      execSync(`signtool sign /fd SHA256 /f "${certPath}" /p "${certPass}" /tr http://timestamp.digicert.com /td SHA256 "${exePath}"`, { stdio: 'inherit' });
      console.log(`Signed: ${exe} (signtool)`);
    } catch (e2) {
      console.log(`Signing skipped for ${exe} (no signing tool): ${e2.message}`);
    }
  }

  console.log('=== Done ===\n');
}
