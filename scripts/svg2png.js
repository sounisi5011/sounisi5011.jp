#!/usr/bin/env node

const path = require('path');

const { convertFile } = require('convert-svg-to-png');
const makeDir = require('make-dir');

async function main() {
  const sourceFileFullpath = path.resolve(process.argv[2]);
  const destFileFullpath = path.resolve(process.argv[3]);

  await makeDir(path.dirname(destFileFullpath));

  await convertFile(sourceFileFullpath, {
    outputFilePath: destFileFullpath,
    puppeteer: { args: ['--allow-file-access-from-files'] },
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
