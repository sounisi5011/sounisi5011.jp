#!/usr/bin/env node

const fs = require('fs');
const makeDir = require('make-dir');
const Mustache = require('mustache');
const path = require('path');
const util = require('util');

const [fsReadFile, fsWriteFile] = [fs.readFile, fs.writeFile].map(
  util.promisify,
);

async function main() {
  const sourceFileFullpath = path.resolve(process.argv[2]);
  const destDirFullpath = path.resolve(process.argv[3]);
  const destFileFullpath = path.join(
    destDirFullpath,
    path.basename(sourceFileFullpath, '.mustache'),
  );
  const env = process.env;

  await makeDir(destDirFullpath);

  const view = { env };

  {
    const match = /^https?:\/\/[0-9a-fA-F]+--([0-9a-zA-Z-]+\.netlify\.com)/.exec(
      env.DEPLOY_URL,
    );
    if (match) {
      view.netlifyDefaultSubdomain = match[1];
    }
  }

  {
    const match = /^https?:\/\/([0-9a-zA-Z.-]+)/.exec(env.URL);
    if (match) {
      view.primaryDomain = match[1];
    }
  }

  const templateText = await fsReadFile(sourceFileFullpath, 'utf8');
  const compiledText = Mustache.render(templateText, view);

  console.log(`  generated: ${path.relative('', destFileFullpath)}`);
  console.log(compiledText.replace(/^/gm, '  >'));

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
