const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const certPath = path.join(__dirname, '..', 'build-assets', 'codesign.p12');
const certPass = 'converter';

exports.default = async function (context) {
  const platform = context.electronPlatformName;
  const appDir = context.appOutDir;

  if (platform === 'darwin') {
    await stripAllSignatures(appDir, context.packager.appInfo.productName);
  } else if (platform === 'win32') {
    await signWin(appDir);
  }
};

async function stripAllSignatures(appDir, appName) {
  const appPath = [path.join(appDir, `${appName}.app`), path.join(appDir, 'Converter.app')].find(p => fs.existsSync(p));
  if (!appPath) {
    console.log('No .app found in', appDir, 'contents:', fs.readdirSync(appDir));
    return;
  }

  console.log(`\n=== macOS: stripping all ad-hoc signatures from ${appPath} ===`);

  try {
    execSync(`find "${appPath}" -type f -perm +0111 -exec codesign --remove-signature {} \\; 2>/dev/null`, { stdio: 'inherit' });
  } catch (e) {
    console.error('Signature stripping failed:', e.message);
  }

  const mainExe = path.join(appPath, 'Contents', 'MacOS', appName);
  if (fs.existsSync(mainExe)) {
    execSync(`codesign --remove-signature "${mainExe}" 2>/dev/null`, { stdio: 'inherit' });
  }

  console.log('All ad-hoc signatures removed');

  try {
    execSync(`codesign -dv --verbose=4 "${appPath}" 2>&1`, { stdio: 'inherit' });
  } catch (e) {
    console.log('App is now unsigned (expected)');
  }

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
