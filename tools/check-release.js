// Also called by Gradle preReleaseBuild, including direct Android Studio builds.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function assertReleaseAssets(directory) {
  const root = path.resolve(directory), html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const info = JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8'));
  if (info.mode !== 'release') throw Error('Release blocked: development web assets. Run npm run cap:sync.');
  if (info.htmlSha256 !== crypto.createHash('sha256').update(html).digest('hex')) throw Error('Release blocked: web assets changed since build. Run npm run cap:sync.');
  if (!html.includes("const STORE_KEY = 'bukang-sea-v1';") || !html.includes('const unlocked = i => i === 0 ||')) throw Error('Release blocked: normal progression missing.');
  const forbidden = /bukang-sea-development|bukang-development-camera|data-development-build|bukang-sea-playtest|bukang-view-comparison|window\.boardQA|const skinEarned = s => true;/;
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw Error('Release blocked: asset symlink ' + file);
      if (entry.isDirectory()) visit(file);
      else if (/\.(html|js|json)$/.test(entry.name) && forbidden.test(fs.readFileSync(file, 'utf8'))) throw Error('Release blocked: development content in ' + file);
    }
  };
  visit(root);
  return info;
}
if (require.main === module) {
  try { assertReleaseAssets(process.argv[2] || path.join(__dirname, '../www')); console.log('Release assets verified: normal progression, isolated development content excluded.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { assertReleaseAssets };
