const Metalsmith = require('metalsmith');
const assets = require('metalsmith-assets-convention');
const collections = require('metalsmith-collections');
const ignore = require('metalsmith-ignore');
const inplace = require('metalsmith-in-place');
const permalinks = require('metalsmith-permalinks');

const anotherSource = require('./src/plugins/another-source');
const blankshield = require('./src/plugins/blankshield');
const commentFrontmatter = require('./src/plugins/comment-matters');
const copy = require('./src/plugins/copy-convention');
const download = require('./src/plugins/download-convention');
const less = require('./src/plugins/less');
const mergePreloadDependencies = require('./src/plugins/merge-preload-dependencies');
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
  .use(
    collections({
      characters: {
        pattern: ['characters/*.pug', 'characters/*/*.pug'],
        refer: false,
      },
    }),
  )
  .use(anotherSource('./src/assets'))
  .use(netlifyMetadata())
  .use(assets())
  .use(copy())
  .use(download())
  .use(pageURLData())
  .use(svg2png())
  .use(svg2ico())
  .use(
    anotherSource('./src/styles')
      .use(commentFrontmatter())
      .use(less())
      .use(mergePreloadDependencies())
      .use(ignore('**/*.less')),
  )
  .use(mergePreloadDependencies())
  .use(preloadList({ preloadListIncludeKeys: ['preloadDependencies'] }))
  .use(
    inplace({
      pattern: ['**', '!_*/**', '!**/_*', '!**/_*/**'],
      setFilename: true,
    }),
  )
  .use(mustache())
  .use(ignore(['**/*.pug']))
  .use(svgo())
  .use(
    permalinks({
      relative: false,
    }),
  )
  .use(blankshield({ insertNoreferrer: true }))
  .build(function(err, files) {
    if (err) {
      throw err;
    }
  });
