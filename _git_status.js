const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repo = 'C:\\Users\\User\\Desktop\\likelink2';
let log = [];

function safeExec(cmd) {
    try {
        const out = execSync(cmd, { 
            cwd: repo, 
            encoding: 'utf8', 
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            timeout: 15000
        });
        return { ok: true, out: out };
    } catch(e) {
        return { ok: false, msg: e.message, stdout: e.stdout ? e.stdout.toString() : '', stderr: e.stderr ? e.stderr.toString() : '' };
    }
}

const r1 = safeExec('git status');
log.push('git status: ' + (r1.ok ? r1.out : JSON.stringify({ msg: r1.msg, stdout: r1.stdout, stderr: r1.stderr })));

const r2 = safeExec('git diff --stat');
log.push('git diff --stat: ' + (r2.ok ? r2.out : JSON.stringify({ msg: r2.msg, stdout: r2.stdout, stderr: r2.stderr })));

const r3 = safeExec('git log --oneline -1');
log.push('git log --oneline -1: ' + (r3.ok ? r3.out : JSON.stringify({ msg: r3.msg, stdout: r3.stdout, stderr: r3.stderr })));

fs.writeFileSync(path.join(repo, '_git_status_out.txt'), log.join('\n'));
