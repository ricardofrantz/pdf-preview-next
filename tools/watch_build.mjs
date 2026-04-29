import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let shuttingDown = false;

const children = [
  ['tsc', ['run', 'watch:tsc', '--', '--preserveWatchOutput']],
  ['esbuild', ['run', 'watch:bundle']],
].map(([name, args]) => {
  const child = spawn(npmCommand, args, {
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    console.error(
      `${name} watcher exited${signal ? ` from ${signal}` : ` with ${code ?? 0}`}`,
    );
    shutdown(code ?? 1);
  });

  return child;
});

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exitCode = code;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}
