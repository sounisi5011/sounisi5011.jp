const Metalsmith = require('metalsmith');
const assets = require('metalsmith-assets-convention');
const ignore = require('metalsmith-ignore');
const inplace = require('metalsmith-in-place');
const rename = require('metalsmith-rename');

const anotherSource = require('./src/plugins/another-source');
const less = require('./src/plugins/less');
const mustache = require('./src/plugins/mustache');
const netlifyMetadata = require('./src/plugins/netlifyMetadata');
const preloadList = require('./src/plugins/preload-list');

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
  .use((files, metalsmith, done) => {
    const metadata = metalsmith.metadata();
    const rootURL = metadata.url;

    Object.entries(files)
      .map(([filepath, filedata]) => [
        filepath
          .replace(/\.pug$/, '.html')
          .replace(/(?:^|\/)index\.html?$/, ''),
        filedata,
      ])
      .forEach(([filepath, filedata]) => {
        filedata.rootURL = rootURL;
        filedata.canonicalURL =
          rootURL.replace(/\/*$/, '') + filepath.replace(/^\/*/, '/');
      });

    done();
  })
  .use(preloadList())
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
  .use(rename([[/^styles\//, '']]))
  .build(function(err, files) {
    if (err) {
      throw err;
    }
  });
