const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repo = 'C:\\Users\\User\\Desktop\\likelink2';
const logFile = path.join(repo, '_git_everything_out.txt');
const log = [];

function safeExec(cmd) {
    try {
        const out = execSync(cmd, {
            cwd: repo,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' },
            timeout: 20000
        });
        return { ok: true, out: out.toString() };
    } catch(e) {
        return {
            ok: false,
            msg: e.message,
            stdout: e.stdout ? e.stdout.toString() : '',
            stderr: e.stderr ? e.stderr.toString() : ''
        };
    }
}

log.push('===== GIT STATUS =====');
const r1 = safeExec('git status --porcelain');
log.push(r1.ok ? r1.out : 'ERROR: ' + r1.msg + '\nSTDERR: ' + r1.stderr);

log.push('\n===== GIT DIFF STAT =====');
const r2 = safeExec('git diff --stat');
log.push(r2.ok ? r2.out : 'ERROR: ' + r2.msg + '\nSTDERR: ' + r2.stderr);

log.push('\n===== STAGED FILES =====');
const r3 = safeExec('git diff --cached --name-only');
log.push(r3.ok ? r3.out : 'ERROR: ' + r3.msg + '\nSTDERR: ' + r3.stderr);

log.push('\n===== GIT ADD =====');
const r4 = safeExec('git add -A');
log.push(r4.ok ? 'OK' : 'ERROR: ' + r4.msg + '\nSTDERR: ' + r4.stderr);

log.push('\n===== GIT STATUS AFTER ADD =====');
const r5 = safeExec('git status --porcelain');
log.push(r5.ok ? r5.out : 'ERROR: ' + r5.msg);

log.push('\n===== GIT COMMIT =====');
const r6 = safeExec('git commit -m "fix: studio login crash, handleForgot, autoPublish integration"');
log.push(r6.ok ? r6.out : 'ERROR: ' + r6.msg + '\nSTDERR: ' + r6.stderr);

log.push('\n===== GIT LOG =====');
const r7 = safeExec('git log --oneline -3');
log.push(r7.ok ? r7.out : 'ERROR: ' + r7.msg);

log.push('\n===== GIT PUSH =====');
const r8 = safeExec('git push origin main');
log.push(r8.ok ? r8.out : 'ERROR: ' + r8.msg + '\nSTDERR: ' + r8.stderr);

log.push('\n===== DONE =====');
fs.writeFileSync(logFile, log.join('\n'));
console.log('Output written to: ' + logFile);