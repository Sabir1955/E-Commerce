const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');
const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));

console.log('=== INSPECTING MONGOOSE MODELS ===\n');

files.forEach(f => {
  try {
    const model = require(path.join(modelsDir, f));
    if (model && model.schema) {
      console.log(`Model: ${model.modelName || f.replace('.js', '')}`);
      console.log(`Collection: ${model.collection?.name || 'unknown'}`);
      const paths = model.schema.paths;
      const pathInfo = Object.keys(paths).map(p => {
        const pathObj = paths[p];
        const instance = pathObj.instance;
        const required = pathObj.isRequired ? 'REQUIRED' : 'optional';
        const defaultVal = pathObj.defaultValue !== undefined ? `default:${JSON.stringify(pathObj.defaultValue)}` : '';
        return `  - ${p}: ${instance} (${required}) ${defaultVal}`;
      });
      console.log(pathInfo.join('\n'));
      console.log('');
    }
  } catch (err) {
    console.error(`Error loading model ${f}:`, err.message);
  }
});
