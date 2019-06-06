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
  const env = process.env;
  const options = { env, cache: true }

  options.rootURL = (((env.CONTEXT === 'production') ? env.URL : env.DEPLOY_URL) || '');
  options.canonicalURL = options.rootURL.replace(/\/*$/, '/');

  await makeDir(destDirFullpath);

  const compiledText = pug.renderFile(sourceFileFullpath, options);

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
