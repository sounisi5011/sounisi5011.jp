const Metalsmith = require('metalsmith');
const assets = require('metalsmith-assets-convention');
const ignore = require('metalsmith-ignore');
const inplace = require('metalsmith-in-place');
const metafiles = require('metalsmith-metafiles');

const anotherSource = require('./src/plugins/another-source');
const copy = require('./src/plugins/copy-convention');
const download = require('./src/plugins/download-convention');
const less = require('./src/plugins/less');
const mustache = require('./src/plugins/mustache');
const netlifyMetadata = require('./src/plugins/netlifyMetadata');
const pageURLData = require('./src/plugins/page-url-data');
const preloadList = require('./src/plugins/preload-list');
const svg2ico = require('./src/plugins/svg-to-ico');
const svg2png = require('./src/plugins/svg-to-png');
const svgo = require('./src/plugins/svgo');

function mergePreloadDependencies(opts) {
  const options = {
    dependenciesKey: 'dependencies',
    preloadURLsKey: 'preloadDependencies',
    ...opts,
  };

  return (files, metalsmith, done) => {
    for (const file of Object.values(files)) {
      if (
        file[options.dependenciesKey] &&
        (!file[options.preloadURLsKey] ||
          Array.isArray(file[options.preloadURLsKey]))
      ) {
        const newDependencies = Object.values(file[options.dependenciesKey])
          .filter(
            dependentFile =>
              dependentFile &&
              Array.isArray(dependentFile[options.preloadURLsKey]),
          )
          .map(dependentFile => dependentFile[options.preloadURLsKey]);
        file[options.preloadURLsKey] = (
          file[options.preloadURLsKey] || []
        ).concat(...newDependencies);
      }
    }
    done();
  };
}

Metalsmith(__dirname)
  .metadata({
    description: 'sounisi5011の創作とソーシャルサービスの集約サイト',
    generator: 'Metalsmith',
    globalPageStyles: ['/default.css'],
    title: 'sounisi5011.jp',
    url:
      (process.env.CONTEXT === 'production'
        ? process.env.URL
        : process.env.DEPLOY_URL) || '',
  })
  .source('./src/pages')
  .destination('./public')
  .clean(false)
  .use(netlifyMetadata())
  .use(assets())
  .use(copy())
  .use(download())
  .use(pageURLData())
  .use(preloadList())
  .use(svg2png())
  .use(svg2ico())
  .use(
    anotherSource('./src/styles')
      .use(
        metafiles({
          parsers: {
            '.yaml': true,
            '.yml': true,
          },
        }),
      )
      .use(less())
      .use(mergePreloadDependencies())
      .use(ignore('**/*.less')),
  )
  .use(
    inplace({
      pattern: ['**', '!_*/**', '!**/_*', '!**/_*/**'],
      setFilename: true,
    }),
  )
  .use(mustache())
  .use(ignore(['**/*.pug']))
  .use(svgo())
  .build(function(err, files) {
    if (err) {
      throw err;
    }
  });
