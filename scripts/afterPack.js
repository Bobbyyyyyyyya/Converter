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

  const { sign } = require('@electron/osx-sign');
  const { execSync } = require('child_process');

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
};
