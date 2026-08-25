import subprocess, traceback
try:
    r = subprocess.run(
        ['node', 'node_modules/vite/bin/vite.js', 'build'],
        capture_output=True, text=True, cwd='C:\\Users\\User\\Desktop\\likelink2',
        timeout=120
    )
    content = "STDOUT:\n" + r.stdout + "\nSTDERR:\n" + r.stderr + "\nEXIT CODE: " + str(r.returncode)
    open('C:\\Users\\User\\Desktop\\likelink2\\build-result.txt', 'w').write(content)
    print("Build completed with exit code:", r.returncode)
except Exception as e:
    content = "EXCEPTION: " + str(e) + "\n\nTRACEBACK:\n" + traceback.format_exc()
    open('C:\\Users\\User\\Desktop\\likelink2\\build-result.txt', 'w').write(content)
    print("Build failed with exception:", e)