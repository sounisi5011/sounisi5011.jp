#!/usr/bin/env node

const fs = require('fs');
const less = require('less');
const makeDir = require('make-dir');
const path = require('path');
const recursive = require('recursive-readdir');
const util = require('util');

const [fsReadFile, fsWriteFile] = [fs.readFile, fs.writeFile].map(
  util.promisify,
);

async function genLess(sourceFilepath, destFilepath) {
  const destMapFilepath = `${destFilepath}.map`;
  const sourceDirpath = path.dirname(sourceFilepath);

  const options = {
    filename: sourceFilepath,
    paths: [sourceDirpath],
    sourceMap: {
      sourceMapInputFilename: sourceFilepath,
      sourceMapOutputFilename: path.basename(destFilepath),
      sourceMapFullFilename: destMapFilepath,
      sourceMapFilename: path.basename(destMapFilepath),
      sourceMapBasepath: sourceDirpath,
      sourceMapRootpath: path.relative(
        path.dirname(destMapFilepath),
        sourceDirpath,
      ),
    },
  };

  const lessText = await fsReadFile(sourceFilepath, 'utf8');
  const { css: cssText, map: mapText } = await less.render(lessText, options);

  await Promise.all([
    fsWriteFile(destFilepath, cssText),
    fsWriteFile(destMapFilepath, mapText),
  ]);
}

async function main() {
  const sourceDirFullpath = path.resolve(process.argv[2]);
  const destDirFullpath = path.resolve(process.argv[3]);

  await makeDir(destDirFullpath);

  const fileList = await recursive(sourceDirFullpath, ['_*']);

  await Promise.all(
    fileList
      .filter(filepath => /\.less$/.test(filepath))
      .map(async sourceFullpath => {
        const sourceFilepath = path.relative(sourceDirFullpath, sourceFullpath);
        const destCssFilepath = sourceFilepath.replace(/\.less$/, '.css');
        const destCssFullpath = path.join(destDirFullpath, destCssFilepath);
        await genLess(sourceFullpath, destCssFullpath);
      }),
  );
}

(async () => {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    console.dir(error);
  }
})();
