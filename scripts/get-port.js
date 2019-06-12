#!/usr/bin/env node

const spawn = require('cross-spawn');
const getPort = require('get-port');

async function main() {
  const [, , command, ...commandArgs] = process.argv;

  const port = await getPort();
  const replacedCommandArgs = commandArgs.map(arg =>
    arg.replace(/\{\}/g, port),
  );

  const commandText = [command, ...replacedCommandArgs].join(' ');
  console.log(`$ ${commandText}`);

  const child = spawn(command, replacedCommandArgs, { stdio: 'inherit' });
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
