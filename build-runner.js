import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const projectRoot = 'C:\\Users\\User\\Desktop\\likelink2';
const outputFile = 'C:\\Users\\User\\Desktop\\likelink2\\build-result.txt';
const nodePath = 'C:\\Program Files\\nodejs\\node.exe';

writeFileSync(outputFile, 'STARTED - node at: ' + nodePath);

try {
  const stdout = execFileSync(nodePath, ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  writeFileSync(outputFile, 'BUILD_SUCCESS\n' + stdout);
} catch (e) {
  const err = e.stderr || e.stdout || e.message || 'Unknown error';
    writeFileSync(outputFile, 'BUILD_FAILED\n' + err + '\nExit code: ' + e.status + '\nSignal: ' + e.signal);
}