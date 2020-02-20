/**
 * metalsmith-layoutsのようなことをmetalsmith-pug-extraに対応した感じでやるやつ
 * @see https://github.com/sounisi5011/metalsmith-pug-extra/blob/v1.1.3/src/compile.ts
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

const matter = require('gray-matter');
const {
  default: compileTemplateMap,
} = require('metalsmith-pug-extra/dist/compileTemplateMap');
const { createEachPlugin } = require('metalsmith-pug-extra/dist/utils');
const pug = require('pug');

const readFileAsync = util.promisify(fs.readFile);

function assignDefaultProps(target, source) {
  for (const prop of Reflect.ownKeys(source)) {
    if (!Object.prototype.hasOwnProperty.call(target, prop)) {
      Object.defineProperty(
        target,
        prop,
        Object.getOwnPropertyDescriptor(source, prop),
      );
    }
  }
  return target;
}

function getLayoutFullpath({
  metalsmith,
  layoutDirectory,
  layoutFilename,
  filename,
}) {
  return path.resolve(
    /^\.{1,2}[/\\]/.test(layoutFilename)
      ? path.dirname(path.resolve(metalsmith.source(), filename))
      : metalsmith.path(layoutDirectory),
    layoutFilename,
  );
}

const layoutFileDataMap = new Map();
async function readLayoutFile(filepath) {
  const fullpath = path.resolve(filepath);

  let result = layoutFileDataMap.get(fullpath);
  if (result) return result;

  const filedata = await readFileAsync(fullpath, 'utf8');
  result = matter(filedata);

  layoutFileDataMap.set(fullpath, result);
  return result;
}

const defaultOptions = {
  pattern: '**',
  directory: 'layouts',
};

exports.compile = opts => {
  const { pattern, directory, ...pugOptions } = { ...defaultOptions, ...opts };
  return createEachPlugin(async (filename, files, metalsmith) => {
    const filedata = files[filename];
    const layoutFilename = filedata.layout;
    if (!layoutFilename) return;

    const layoutFullpath = getLayoutFullpath({
      metalsmith,
      layoutDirectory: directory,
      layoutFilename,
      filename,
    });
    const { content, data } = await readLayoutFile(layoutFullpath);
    const compileTemplate = pug.compile(content, {
      ...pugOptions,
      filename: layoutFullpath,
    });

    assignDefaultProps(filedata, data);
    compileTemplateMap.set(filedata, compileTemplate);
  }, pattern);
};
