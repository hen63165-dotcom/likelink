const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const REPO = 'C:\\Users\\User\\Desktop\\likelink2';
const GIT_DIR = path.join(REPO, '.git');

fs.writeFileSync(path.join(REPO, '_script_started.txt'), 'RUNNING');

function gitHash(objType, data) {
    const content = Buffer.concat([Buffer.from(objType + '\0'), data]);
    return crypto.createHash('sha1').update(content).digest('hex');
}

function writeObject(hash, objType, data) {
    const dir = path.join(GIT_DIR, 'objects', hash.substring(0, 2));
    const file = path.join(dir, hash.substring(2));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file)) {
        const compressed = zlib.deflateSync(Buffer.concat([Buffer.from(objType + '\0'), data]));
        fs.writeFileSync(file, compressed);
    }
}

function readObject(hash) {
    const dir = path.join(GIT_DIR, 'objects', hash.substring(0, 2));
    const file = path.join(dir, hash.substring(2));
    if (!fs.existsSync(file)) {
        fs.writeFileSync(path.join(REPO, '_script_started.txt'), 'OBJECT NOT FOUND: ' + hash);
        return null;
    }
    const compressed = fs.readFileSync(file);
    const decompressed = zlib.inflateSync(compressed);
    const nullIdx = decompressed.indexOf(0);
    const objType = decompressed.toString('utf8', 0, nullIdx);
    const data = decompressed.slice(nullIdx + 1);
    return { type: objType, data: data };
}

function parseTree(data) {
    const entries = [];
    let offset = 0;
    while (offset < data.length) {
        const spaceIdx = data.indexOf(32, offset);
        if (spaceIdx === -1) break;
        const mode = data.toString('utf8', offset, spaceIdx);
        const nullIdx = data.indexOf(0, spaceIdx);
        const name = data.toString('utf8', spaceIdx + 1, nullIdx);
        const sha = data.slice(nullIdx + 1, nullIdx + 21).toString('hex');
        entries.push({ mode, name, sha });
        offset = nullIdx + 21;
    }
        return entries;
}

// Main execution
const log = [];

try {
    const headHash = fs.readFileSync(path.join(GIT_DIR, 'refs', 'heads', 'main'), 'utf8').trim();
    log.push('HEAD: ' + headHash);
    fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'HEAD=' + headHash + '\n');

    const headCommit = readObject(headHash);
    if (!headCommit) throw new Error('Cannot read commit: ' + headHash);
    const headCommitStr = headCommit.data.toString('utf8');
    const treeMatch = headCommitStr.match(/tree (\w+)/);
    log.push('Tree: ' + treeMatch[1]);
    fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'TREE=' + treeMatch[1] + '\n');

    const treeObj = readObject(treeMatch[1]);
    if (!treeObj) throw new Error('Cannot read tree: ' + treeMatch[1]);
    const treeEntries = parseTree(treeObj.data);
    log.push('Tree has ' + treeEntries.length + ' entries');

    // Read the modified index.html
    const newContent = fs.readFileSync(path.join(REPO, 'index.html'));
    log.push('index.html size: ' + newContent.length);

    // Create new blob
    const blobHash = gitHash('blob', newContent);
    log.push('Blob: ' + blobHash);
    writeObject(blobHash, 'blob', newContent);
    fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'BLOB=' + blobHash + '\n');

    // Replace index.html in tree
    let found = false;
    const newTreeEntries = treeEntries.map(e => {
        if (e.name === 'index.html') { found = true; return { mode: e.mode, name: e.name, sha: blobHash }; }
        return e;
    });
    if (!found) newTreeEntries.push({ mode: '100644', name: 'index.html', sha: blobHash });

    const newTreeBuffer = Buffer.concat(newTreeEntries.map(e => {
        return Buffer.concat([Buffer.from(e.mode + ' ' + e.name), Buffer.from([0]), Buffer.from(e.sha, 'hex')]);
    }));
    const newTreeHash = gitHash('tree', newTreeBuffer);
    log.push('New tree: ' + newTreeHash);
    writeObject(newTreeHash, 'tree', newTreeBuffer);
    fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'TREE_NEW=' + newTreeHash + '\n');

    // Create commit
    const now = Math.floor(Date.now() / 1000);
    const author = 'hen63165-dotcom <hen63165@gmail.com>';
    const commitLine = 'tree ' + newTreeHash + '\nparent ' + headHash + '\nauthor ' + author + ' ' + now + ' +0000\ncommitter ' + author + ' ' + now + ' +0000\n\nFix: use relative module path in index.html for Vite build on Vercel';
    const commitContent = Buffer.from(commitLine);
    const commitHash = gitHash('commit', commitContent);
    log.push('Commit: ' + commitHash);
    writeObject(commitHash, 'commit', commitContent);
    fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'COMMIT=' + commitHash + '\n');

    // Update ref
    fs.writeFileSync(path.join(GIT_DIR, 'refs', 'heads', 'main'), commitHash + '\n');
    fs.appendFileSync(path.join(GIT_DIR, 'logs', 'HEAD'), headHash + ' ' + commitHash + ' ' + author + ' ' + now + ' +0000\tFix: relative module path in index.html\n');
    fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'UPDATED_REF\n');

    // Write debug log
    fs.writeFileSync(path.join(REPO, '_commit_debug.log'), log.join('\n'));

    // Push
    try {
        execSync('git push origin main --force-with-lease', {
            cwd: REPO, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 60000
        });
        fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'PUSH_OK\n');
    } catch (pe) {
        fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'PUSH_ERR: ' + (pe.stderr ? pe.stderr.toString() : pe.message) + '\n');
    }

    fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'DONE\n');

} catch (e) {
    fs.appendFileSync(path.join(REPO, '_script_started.txt'), 'ERROR: ' + e.message + '\n' + e.stack + '\n');
}

