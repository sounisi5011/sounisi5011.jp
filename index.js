const Metalsmith = require('metalsmith');
const assets = require('metalsmith-assets-convention');
const ignore = require('metalsmith-ignore');
const inplace = require('metalsmith-in-place');
const rename = require('metalsmith-rename');

const anotherSource = require('./src/plugins/another-source');
const less = require('./src/plugins/less');
const mustache = require('./src/plugins/mustache');
const netlifyMetadata = require('./src/plugins/netlifyMetadata');
const pageURLData = require('./src/plugins/page-url-data');
const preloadList = require('./src/plugins/preload-list');
const svg2ico = require('./src/plugins/svg-to-ico');
const svg2png = require('./src/plugins/svg-to-png');
const svgo = require('./src/plugins/svgo');

Metalsmith(__dirname)
  .metadata({
    description: 'sounisi5011の創作とソーシャルサービスの集約サイト',
    generator: 'Metalsmith',
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
  .use(pageURLData())
  .use(preloadList())
  .use(svg2png())
  .use(svg2ico())
  .use(
    anotherSource('./src/styles')
      .ignore('_*')
      .use(less()),
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
  .use(rename([[/^styles\//, '']]))
  .build(function(err, files) {
    if (err) {
      throw err;
    }
  });
