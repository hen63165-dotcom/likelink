const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repo = 'C:\\Users\\User\\Desktop\\likelink2';
let log = [];

function run(cmd) {
    log.push(`CMD: ${cmd}`);
    try {
        const out = execSync(cmd, { 
            cwd: repo, 
            encoding: 'utf8', 
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            timeout: 30000
        });
        log.push(`OUT: ${out}`);
        return out;
    } catch(e) {
        const errMsg = e.stderr ? e.stderr.toString() : e.message;
        const outMsg = e.stdout ? e.stdout.toString() : '';
        log.push(`ERR: ${e.message}\nSTDOUT: ${outMsg}\nSTDERR: ${errMsg}`);
        return outMsg;
    }
}

// Write results incrementally so we can see progress
function save() {
    fs.writeFileSync(path.join(repo, '_git_result.txt'), log.join('\n\n'));
}

// Stage all changes
run('git add -A');
save();

// Check status
run('git status --porcelain');
save();

// Commit
run('git commit -m "Fix: use relative module path in index.html for Vercel Vite build"');
save();

// Get HEAD
const head = run('git rev-parse HEAD');
fs.writeFileSync(path.join(repo, '_git_head.txt'), head);

// Push (may fail due to auth/network, that's OK)
run('git push');
save();

// Get origin status
const origin = run('git rev-parse origin/main');
fs.writeFileSync(path.join(repo, '_git_origin.txt'), origin);

fs.writeFileSync(path.join(repo, '_git_done.txt'), 'DONE');
