// Full git automation script - add, commit, push to main
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repo = 'C:\\Users\\User\\Desktop\\likelink2';
const outFile = path.join(repo, '_git_result.txt');
const log = [];

function run(cmd) {
    try {
        const out = execSync(cmd, {
            cwd: repo,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat' },
            timeout: 60000
        });
        return out.toString().trim();
    } catch(e) {
        return 'EXIT_CODE=' + e.status + '\n' + (e.stdout ? e.stdout.toString() : '') + '\n' + (e.stderr ? e.stderr.toString() : '');
    }
}

log.push('===== 1. GIT STATUS (BEFORE) =====');
log.push(run('git status'));

log.push('\n===== 2. CHANGED FILES =====');
log.push(run('git diff --name-only'));
log.push(run('git diff --cached --name-only'));
log.push(run('git ls-files --others --exclude-standard'));

log.push('\n===== 3. GIT ADD =====');
log.push(run('git add -A') || '(all staged)');

log.push('\n===== 4. GIT STATUS (AFTER ADD) =====');
log.push(run('git status --porcelain'));

log.push('\n===== 5. GIT COMMIT =====');
log.push(run('git commit -m "fix: resolve studio login crash, handleForgot, autoPublish integration"'));

log.push('\n===== 6. GIT LOG =====');
log.push(run('git log --oneline -5'));

log.push('\n===== 7. GIT PUSH =====');
log.push(run('git push origin main'));

log.push('\n===== DONE =====');

try {
    fs.writeFileSync(outFile, log.join('\n'));
    console.log('Results written to: ' + outFile);
} catch(e) {
    console.error('Failed to write: ' + e.message);
}