// Builds the Android app with JDK 21 (Capacitor 8 / Gradle 8.14 need 21; the system JDK here is 17 for other work
// and Android Studio's bundled JBR is 25, which this Gradle cannot run on).
//   node tools/android.js            -> android/app/build/outputs/apk/debug/app-debug.apk
// JDK lookup: $JAVA21_HOME, else ~/.jdks/jdk-21*. SDK: $ANDROID_HOME, else %LOCALAPPDATA%\Android\Sdk.
// Run `npm run cap:sync` first so the latest www/ is inside the app (npm run android:debug does both).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const jdksDir = path.join(os.homedir(), '.jdks');
const jdk = process.env.JAVA21_HOME
  || (fs.existsSync(jdksDir) && fs.readdirSync(jdksDir).filter(d => /^jdk-21/.test(d)).map(d => path.join(jdksDir, d))[0]);
if (!jdk) { console.error('JDK 21 not found. Put one in ~/.jdks/jdk-21... or set JAVA21_HOME.'); process.exit(1); }
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'Android'), 'Android', 'Sdk');
if (!fs.existsSync(sdk)) { console.error(`Android SDK not found at ${sdk}. Finish the Android Studio setup wizard first.`); process.exit(1); }

const gradlew = path.join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
console.log(`JDK ${jdk}\nSDK ${sdk}`);
const r = spawnSync(gradlew, ['assembleDebug', '--console=plain'], {
  cwd: path.join(root, 'android'), stdio: 'inherit', shell: process.platform === 'win32',
  env: { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk },
});
if (r.status === 0) console.log('\nAPK: android/app/build/outputs/apk/debug/app-debug.apk');
process.exit(r.status == null ? 1 : r.status);
