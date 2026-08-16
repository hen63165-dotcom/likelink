const fs = require('fs');
const path = require('path');

const root = 'c:/Users/User/Desktop/likelink2';

// === Fix ProductComponents.jsx ===
const pcPath = path.join(root, 'src/components/product/ProductComponents.jsx');
let pcLines = fs.readFileSync(pcPath, 'utf8').split('\n');

for (let i = 0; i < pcLines.length; i++) {
  if (pcLines[i].includes('const [failed, setFailed] = React.useState(false);')) {
    const m = pcLines[i].match(/^(\s*)const \[failed/);
    if (m && m[1].length === 4) {
      pcLines[i] = '  const [failed, setFailed] = React.useState(false);';
      console.log('PC: Fixed line ' + (i+1) + ' indentation (4->2)');
    }
  }
}
fs.writeFileSync(pcPath, pcLines.join('\n'));
console.log('ProductComponents.jsx saved');

// === Fix FeedView.jsx ===
const fvPath = path.join(root, 'src/components/feed/FeedView.jsx');
let lines = fs.readFileSync(fvPath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  // Fix: "const image = safeImgSrc(catProducts[0]?.image);" excessive indentation -> 14 spaces
  if (lines[i].includes('const image = safeImgSrc(catProducts[0]?.image);')) {
    const m = lines[i].match(/^(\s*)const image/);
    if (m && m[1].length !== 14) {
      lines[i] = '              const image = safeImgSrc(catProducts[0]?.image);';
      console.log('FV: Fixed line ' + (i+1) + ' image const indentation: ' + m[1].length + ' -> 14');
    }
  }

  // Fix: style category grid img excessive indentation -> 20 spaces
  if (lines[i].includes('<img src={image} alt={c.label}')) {
    const m = lines[i].match(/^(\s*)<img src=\{image\}/);
    if (m && m[1].length !== 20) {
      lines[i] = '                    <img src={image} alt={c.label} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} />';
      console.log('FV: Fixed line ' + (i+1) + ' style-grid img indentation: ' + m[1].length + ' -> 20');
    }
  }

  // Fix: Popular Today and Trending - replace {p.image ? ( with {safeImgSrc(p.image) ? (
  if (lines[i].includes('{p.image ? (')) {
    const m = lines[i].match(/^(\s*)\{p\.image/);
    const indent = m ? m[1] : '';
    lines[i] = indent + '{safeImgSrc(p.image) ? (';
    console.log('FV: Fixed line ' + (i+1) + ' ternary condition -> safeImgSrc');

    // Fix the img line on the next line
    if (lines[i + 1] && lines[i + 1].includes('<img src={p.image}')) {
      const m2 = lines[i + 1].match(/^(\s*)<img src=\{p\.image\}/);
      const indent2 = m2 ? m2[1] : '                    ';
      lines[i + 1] = indent2 + '<img src={safeImgSrc(p.image)} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />';
      console.log('FV: Fixed line ' + (i + 2) + ' img src -> safeImgSrc');
    }
  }
}

fs.writeFileSync(fvPath, lines.join('\n'));
console.log('FeedView.jsx saved');
console.log('All fixes complete.');
