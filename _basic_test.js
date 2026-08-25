const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('git', ['status'], {
    cwd: 'C:\\Users\\User\\Desktop\\likelink2',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 10000
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => { stdout += data.toString(); });
child.stderr.on('data', (data) => { stderr += data.toString(); });

child.on('close', (code) => {
    const result = `EXIT_CODE: ${code}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`;
    fs.writeFileSync('C:\\Users\\User\\Desktop\\likelink2\\_basic_test_out.txt', result);
});

child.on('error', (err) => {
    fs.writeFileSync('C:\\Users\\User\\Desktop\\likelink2\\_basic_test_out.txt', `SPAWN ERROR: ${err.message}`);
});

// Also write immediately to prove the script starts
fs.writeFileSync('C:\\Users\\User\\Desktop\\likelink2\\_basic_test_started.txt', 'SCRIPT_STARTED');
