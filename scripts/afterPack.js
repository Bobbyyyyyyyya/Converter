const path = require('path');
const fs = require('fs');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productName;
  const appDir = context.appOutDir;

  const appPath = [path.join(appDir, `${appName}.app`), path.join(appDir, 'Converter.app')].find(p => fs.existsSync(p));
  if (!appPath) {
    console.log('No .app found in', appDir, 'contents:', fs.readdirSync(appDir));
    return;
  }

  console.log(`\n=== macOS ad-hoc signing: ${appPath} ===`);

  const { signAsync } = require('@electron/osx-sign');
  const { execSync } = require('child_process');

  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
    console.log('Extended attributes cleared');
  } catch (_) {}

  const binaries = [
    'Contents/Resources/app/node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg',
    'Contents/Resources/app/node_modules/@ffmpeg-installer/darwin-x64/ffmpeg',
  ];

  for (const rel of binaries) {
    const p = path.join(appPath, rel);
    if (fs.existsSync(p)) {
      try {
        execSync(`codesign --force --sign - "${p}"`, { stdio: 'inherit' });
        console.log(`Signed native binary: ${rel}`);
      } catch (e) {
        console.error(`Failed to sign ${rel}: ${e.message}`);
      }
    }
  }

  try {
    await signAsync({
      app: appPath,
      identity: '-',
      'hardened-runtime': false,
      'no-gatekeeper-assess': true,
    });
    console.log('Ad-hoc signing complete via @electron/osx-sign');
  } catch (e) {
    console.error('@electron/osx-sign failed:', e.message);
  }

  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
    console.log('Extended attributes cleared (after signing)');
  } catch (_) {}

  try {
    execSync(`codesign -dv "${appPath}" 2>&1`, { stdio: 'inherit' });
  } catch (_) {}

  console.log('=== Done ===\n');
};
