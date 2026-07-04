const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productName;
  const appDir = context.appOutDir;

  const possiblePaths = [
    path.join(appDir, `${appName}.app`),
    path.join(appDir, 'Converter.app'),
  ];

  let appPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      appPath = p;
      break;
    }
  }

  if (!appPath) {
    console.log('No .app found in', appDir, 'contents:', fs.readdirSync(appDir));
    return;
  }

  console.log(`\n=== macOS post-pack fix for: ${appPath} ===`);

  const macDir = path.dirname(appPath);
  const contents = fs.readdirSync(macDir);
  console.log('Contents:', contents.join(', '));

  try {
    console.log('1. Clearing extended attributes...');
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('xattr failed:', e.message);
  }

  try {
    console.log('2. Ad-hoc signing all nested helpers...');
    const frameworks = path.join(appPath, 'Contents', 'Frameworks');
    if (fs.existsSync(frameworks)) {
      const items = fs.readdirSync(frameworks).filter(f => f.endsWith('.framework') || f.endsWith('.app'));
      for (const item of items) {
        const itemPath = path.join(frameworks, item);
        try {
          execSync(`codesign --force --sign - "${itemPath}"`, { stdio: 'inherit' });
        } catch (_) {}
      }
    }
    const loginItems = path.join(appPath, 'Contents', 'Library', 'LoginItems');
    if (fs.existsSync(loginItems)) {
      const items = fs.readdirSync(loginItems).filter(f => f.endsWith('.app'));
      for (const item of items) {
        try {
          execSync(`codesign --force --sign - "${path.join(loginItems, item)}"`, { stdio: 'inherit' });
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('Helper signing failed:', e.message);
  }

  try {
    console.log('3. Ad-hoc signing main app...');
    execSync(`codesign --force --sign - "${appPath}"`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('Main app signing failed:', e.message);
  }

  try {
    console.log('4. Verifying signature...');
    execSync(`codesign -dv "${appPath}" 2>&1`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('Verification failed (expected for ad-hoc):', e.message.slice(0, 200));
  }

  console.log('=== Done ===\n');
};
