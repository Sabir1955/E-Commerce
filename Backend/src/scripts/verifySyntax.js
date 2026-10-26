const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules')) {
        results = results.concat(walk(file));
      }
    } else if (file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk(path.join(__dirname, '..'));
let errors = 0;
files.forEach(f => {
  try {
    execSync(`node -c "${f}"`);
  } catch (err) {
    console.error('Syntax error in file:', f);
    errors++;
  }
});
if (errors === 0) {
  console.log(`SUCCESS: All ${files.length} JavaScript files in Backend/src passed syntax check!`);
} else {
  console.error(`FAILED: Found ${errors} syntax errors.`);
  process.exit(1);
}
