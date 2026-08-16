const fs = require('fs');

// === Fix FeedView.jsx ===
const fPath = 'c:/Users/User/Desktop/likelink2/src/components/feed/FeedView.jsx';
let lines = fs.readFileSync(fPath, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  // Line with excessive indentation: "const image = safeImgSrc(catProducts[0]?.image);"
  if (lines[i].includes('safeImgSrc(catProducts[0]?.image);')) {
    lines[i] = '            const image = safeImgSrc(catProducts[0]?.image);';
    continue;
  }
  // Line with excessive indentation: style category grid <img src={image}...
  if (lines[i].includes('<img src={image} alt={c.label}')) {
    lines[i] = '                    <img src={image} alt={c.label} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} />';
    continue;
  }
  // Popular Today & Trending: replace {p.image ? ( with {safeImgSrc(p.image) ? (
  if (lines[i].includes('{p.image ? (')) {
    lines[i] = lines[i].replace('{p.image ? (', '{safeImgSrc(p.image) ? (');
    continue;
  }
  // Popular Today & Trending: replace <img src={p.image} alt="" loading="lazy" className="w-full h-full object-cover" />
  if (lines[i].includes('<img src={p.image} alt=""')) {
    lines[i] = lines[i].replace(
      '<img src={p.image} alt="" loading="lazy" className="w-full h-full object-cover" />',
      '<img src={safeImgSrc(p.image)} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} className="w-full h-full object-cover" />'
    );
    continue;
  }
}

fs.writeFileSync(fPath, lines.join('\n'));
console.log('FeedView.jsx fixed');

// === Fix ProductComponents.jsx ===
const pcPath = 'c:/Users/User/Desktop/likelink2/src/components/product/ProductComponents.jsx';
let pcLines = fs.readFileSync(pcPath, 'utf8').split('\n');

for (let i = 0; i < pcLines.length; i++) {
  // Line 10 has 4 spaces instead of 2: "    const [failed, setFailed] = React.useState(false);"
  if (pcLines[i].includes('const [failed, setFailed] = React.useState(false);') && pcLines[i].match(/^(\s*)/)[1].length === 4) {
    pcLines[i] = '  const [failed, setFailed] = React.useState(false);';
    continue;
  }
}

fs.writeFileSync(pcPath, pcLines.join('\n'));
console.log('ProductComponents.jsx fixed');
