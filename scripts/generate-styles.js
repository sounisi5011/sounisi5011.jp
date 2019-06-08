#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const util = require('util');
const less = require('less');
const makeDir = require('make-dir');
const recursive = require('recursive-readdir');

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
      sourceMapBasepath: sourceDirpath,
      sourceMapFilename: path.basename(destMapFilepath),
      sourceMapFullFilename: destMapFilepath,
      sourceMapInputFilename: sourceFilepath,
      sourceMapOutputFilename: path.basename(destFilepath),
      sourceMapRootpath: path.relative(
        path.dirname(destMapFilepath),
        sourceDirpath,
      ),
    },
  };

  const lessText = await fsReadFile(sourceFilepath, 'utf8');
  const { css: cssText, map: mapText } = await less.render(lessText, options);

  await makeDir(path.dirname(destFilepath));

  await Promise.all([
    fsWriteFile(destFilepath, cssText),
    fsWriteFile(destMapFilepath, mapText),
  ]);
}

async function main() {
  const sourceDirFullpath = path.resolve(process.argv[2]);
  const destDirFullpath = path.resolve(process.argv[3]);

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
