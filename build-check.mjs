import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

const projectRoot = 'C:\\Users\\User\\Desktop\\likelink2';
const outputFile = 'C:\\Users\\User\\Desktop\\likelink2\\build-check-result.txt';
const nodePath = 'C:\\Program Files\\nodejs\\node.exe';

writeFileSync(outputFile, 'SCRIPT_STARTED\n');

try {
  writeFileSync(outputFile, 'TRYING_BUILD\n');
  const stdout = execFileSync(nodePath, ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  writeFileSync(outputFile, 'BUILD_SUCCESS\n' + stdout);
} catch (e) {
  writeFileSync(outputFile, 'BUILD_FAILED\n' +
    JSON.stringify({
      stderr: e.stderr || 'null',
      stdout: e.stdout || 'null',
      message: e.message || 'null',
      status: e.status,
      signal: e.signal
    }, null, 2) + '\nExit code: ' + e.status + '\nSignal: ' + e.signal);
}
