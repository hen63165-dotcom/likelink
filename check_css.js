const fs = require('fs');
const cssPath = 'C:/Users/User/Desktop/likelink2/dist/assets/index-DT3lHBXA.css';
const outPath = 'C:/Users/User/Desktop/likelink2/css_result.txt';
try {
  const content = fs.readFileSync(cssPath, 'utf8');
  if (content.includes('ll-canvas')) {
    fs.writeFileSync(outPath, 'LUXURY_CSS_FOUND\n');
  } else {
    fs.writeFileSync(outPath, 'LUXURY_CSS_NOT_FOUND\n');
  }
} catch (e) {
  fs.writeFileSync(outPath, 'ERROR: ' + e.message + '\n');
}
console.log('Done');
