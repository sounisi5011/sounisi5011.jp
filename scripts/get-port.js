#!/usr/bin/env node

const path = require('path');

const spawn = require('cross-spawn');
const getPort = require('get-port');

async function main() {
  const [, , command, ...commandArgs] = process.argv;

  const port = await getPort();
  const replacedCommandArgs = commandArgs.map(arg =>
    arg.replace(/\{\}/g, port),
  );

  /**
   * @see https://github.com/mysticatea/npm-run-all/blob/v4.1.5/lib/run-task.js#L156-L174
   */
  const npmPath = process.env.npm_execpath;
  const npmPathIsJs =
    typeof npmPath === 'string' && /\.m?js/.test(path.extname(npmPath));
  const isYarn = path.basename(npmPath || 'npm').startsWith('yarn');
  const execPath = isYarn
    ? npmPathIsJs
      ? process.execPath
      : npmPath
    : command;
  const spawnArgs = [...replacedCommandArgs];

  if (execPath !== command) {
    spawnArgs.unshift(...(npmPathIsJs ? [npmPath] : []), 'run', command);
  } else {
    const commandText = [command, ...replacedCommandArgs].join(' ');
    console.log(`> ${commandText}\n`);
  }

  const child = spawn(execPath, spawnArgs, { stdio: 'inherit' });
  return new Promise(resolve => {
    child.on('close', exitCode => {
      process.exitCode = exitCode;
      resolve();
    });
  });
}

(async () => {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    console.dir(error);
  }
})();
