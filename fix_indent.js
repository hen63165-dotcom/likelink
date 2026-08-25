const fs = require('fs');
const file = 'C:\\Users\\User\\Desktop\\likelink2\\src\\App.jsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (trimmed === ')}') {
    lines[i] = '          )}';
    console.log('Fixed line ' + (i + 1) + ': )} -> 10 spaces');
  }
  if (trimmed === '</Suspense>') {
    lines[i] = '        </Suspense>';
    console.log('Fixed line ' + (i + 1) + ': </Suspense> -> 8 spaces');
  }
    if (trimmed === '</main>') {
    lines[i] = '      </main>';
    console.log('Fixed line ' + (i + 1) + ': </main> -> 6 spaces');
  }
  if (trimmed === 'setActiveNav={setActiveNav}') {
    lines[i] = '              setActiveNav={setActiveNav}';
    console.log('Fixed line ' + (i + 1) + ': setActiveNav -> 14 spaces');
  }
}
fs.writeFileSync(file, lines.join('\n'));
console.log('DONE');
