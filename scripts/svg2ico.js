#!/usr/bin/env node

const { convert } = require('convert-svg-to-png');
const fs = require('fs');
const makeDir = require('make-dir');
const path = require('path');
const toIco = require('to-ico');
const util = require('util');

const ICO_IMAGE_SIZES = [16, 24, 32, 48, 64, 128, 256];
const [fsReadFile, fsWriteFile] = [fs.readFile, fs.writeFile].map(
  util.promisify,
);

async function main() {
  const sourceFileFullpath = path.resolve(process.argv[2]);
  const destFileFullpath = path.resolve(process.argv[3]);

  await makeDir(path.dirname(destFileFullpath));

  const svgData = await fsReadFile(sourceFileFullpath);
  const pngDataList = await Promise.all(
    ICO_IMAGE_SIZES.map(size =>
      convert(svgData, {
        baseFile: sourceFileFullpath,
        height: size,
        width: size,
      }),
    ),
  );
  const icoData = await toIco(pngDataList);

  await fsWriteFile(destFileFullpath, icoData);
}

(async () => {
  try {
    await main();
  } catch (error) {
    process.exitCode = 1;
    console.dir(error);
  }
})();
