#!/usr/bin/env node

const { convertFile } = require('convert-svg-to-png');
const path = require('path');

async function main() {
  const sourceFileFullpath = path.resolve(process.argv[2]);
  const destFileFullpath = path.resolve(process.argv[3]);

  await convertFile(sourceFileFullpath, {
    outputFilePath: destFileFullpath,
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
