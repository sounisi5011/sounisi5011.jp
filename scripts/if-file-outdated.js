#!/usr/bin/env node

const fs = require('fs');
const spawn = require('cross-spawn');
const path = require('path');
const util = require('util');

const [fsStat] = [fs.stat].map(util.promisify);

function toFreshSec(freshTime) {
  const match = /^([0-9]+)([a-zA-Z]*)$/.exec(freshTime);
  if (!match) {
    return 0;
  }
  if (/^d(?:ay)?$/i.test(match[2])) {
    return Number(match[1]) * 24 * 60 * 60;
  } else if (/^h(?:our)?$/i.test(match[2])) {
    return Number(match[1]) * 60 * 60;
  } else if (/^m(?:in)?$/i.test(match[2])) {
    return Number(match[1]) * 60;
  } else {
    return Number(match[1]);
  }
}

async function getStats(targetFile) {
  try {
    return await fsStat(targetFile);
  } catch (err) {
    return null;
  }
}

function isOutdated(stats, freshSec) {
  if (!stats) {
    return true;
  }
  return stats.mtimeMs + freshSec * 1000 < Date.now();
}

async function main() {
  const [, , targetFile, freshTime, command, ...commandArgs] = process.argv;

  if (!targetFile || !freshTime || !command) {
    console.error(
      `Usage: ${path.relative(
        '',
        process.argv[1],
      )} <TargetFile> <FreshTime> <Command> [...args]`,
    );
    process.exitCode = 1;
    return;
  }

  const freshSec = toFreshSec(freshTime);
  const stats = await getStats(targetFile);

  if (isOutdated(stats, freshSec)) {
    return new Promise(resolve => {
      const child = spawn(command, commandArgs, { stdio: 'inherit' });
      child.on('close', exitCode => {
        process.exitCode = exitCode;
        resolve();
      });
    });
  }
}

(async () => {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    console.dir(error);
  }
})();
