#!/usr/bin/env node

const fs = require('fs');
const makeDir = require('make-dir');
const path = require('path');
const pug = require('pug');
const util = require('util');

const [fsWriteFile] = [fs.writeFile].map(util.promisify);

async function main() {
  const sourceFileFullpath = path.resolve(process.argv[2]);
  const destDirFullpath = path.resolve(process.argv[3]);
  const destFileFullpath = path.join(destDirFullpath, path.basename(sourceFileFullpath, '.pug') + '.html');

  await makeDir(destDirFullpath);

  const compiledText = pug.renderFile(sourceFileFullpath, {
    cache: true,
  });

  await fsWriteFile(destFileFullpath, compiledText);
}

(async () => {
  try {
    main();
  } catch (error) {
    process.exitCode = 1;
    console.dir(error);
  }
})();
