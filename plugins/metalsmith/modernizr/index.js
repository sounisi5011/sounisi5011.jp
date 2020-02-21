const path = require('path');

const sha1 = require('@sounisi5011/sha1');
const modernizr = require('modernizr');
const multimatch = require('multimatch');

function isObject(value) {
  return typeof value === 'object' && value;
}

function callbackOptionGetter(filename, filedata, files, metalsmith) {
  return (optionValue, ...args) =>
    typeof optionValue === 'function'
      ? optionValue(...args, filename, filedata, files, metalsmith)
      : optionValue;
}

async function buildModernizr(config) {
  return new Promise(resolve => {
    modernizr.build(config, result => {
      resolve(result);
    });
  });
}

function getModernizrFilename(modernizrSource) {
  return `${sha1(modernizrSource)}.js`;
}

module.exports = opts => {
  const options = {
    config: null,
    outputDir: 'modernizr',
    outputProp: 'modernizrFilename',
    pattern: '**/*.html',
    ...opts,
  };

  return (files, metalsmith, done) => {
    const generatedFileMap = new Map();
    Promise.all(
      multimatch(Object.keys(files), options.pattern).map(async filename => {
        const filedata = files[filename];
        const getOption = callbackOptionGetter(
          filename,
          filedata,
          files,
          metalsmith,
        );

        const config = getOption(options.config);

        if (isObject(config)) {
          const outputDir = getOption(options.outputDir);

          const modernizrSource = await buildModernizr(config);
          const modernizrFilename = getModernizrFilename(modernizrSource);
          const modernizrFilepath =
            typeof outputDir === 'string' && outputDir
              ? path.join(outputDir, modernizrFilename)
              : modernizrFilename;

          const outputProp = getOption(options.outputProp, modernizrFilepath);
          if (typeof outputProp === 'string') {
            filedata[outputProp] = modernizrFilepath;
          }
          generatedFileMap.set(modernizrFilepath, modernizrSource);
        }
      }),
    )
      .then(() => {
        generatedFileMap.forEach((modernizrSource, modernizrFilepath) => {
          files[modernizrFilepath] = {
            contents: Buffer.from(modernizrSource, 'utf8'),
            mode: '0644',
          };
        });

        done();
      })
      .catch(error => {
        done(error);
      });

    done();
  };
};
