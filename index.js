const netlifyPublishedDate = require('@sounisi5011/metalsmith-netlify-published-date');
const Metalsmith = require('metalsmith');
const assetsConvention = require('metalsmith-assets-convention');
const collections = require('metalsmith-collections');
const excerpts = require('metalsmith-excerpts');
const ignore = require('metalsmith-ignore');
const permalinks = require('metalsmith-permalinks');
const postcss = require('metalsmith-postcss');
const {
  compile: pugCompile,
  render: pugRender,
} = require('metalsmith-pug-extra');

const {
  ignoreContentsEquals,
} = require('./src/plugin-options/netlify-published-date');
const anotherSource = require('./src/plugins/another-source');
const blankshield = require('./src/plugins/blankshield');
const commentFrontmatter = require('./src/plugins/comment-matters');
const copyConvention = require('./src/plugins/copy-convention');
const downloadConvention = require('./src/plugins/download-convention');
const less = require('./src/plugins/less');
const mergePreloadDependencies = require('./src/plugins/merge-preload-dependencies');
const mustache = require('./src/plugins/mustache');
const netlifyMetadata = require('./src/plugins/netlifyMetadata');
const pageQrCodeGenerator = require('./src/plugins/page-qr-code-gen');
const preloadList = require('./src/plugins/preload-list');
const svg2ico = require('./src/plugins/svg-to-ico');
const svg2png = require('./src/plugins/svg-to-png');
const svgo = require('./src/plugins/svgo');
const templateFuncs = require('./src/utils/template-functions');

Metalsmith(__dirname)
  .metadata({
    /* eslint-disable sort-keys */
    siteName: 'sounisi5011.jp',
    description: 'sounisi5011の創作とソーシャルサービスの集約サイト',
    generator: 'Metalsmith',
    globalPageStyles: ['/default.css', '/header.css', '/footer.css'],
    preloadDependencies: ['/default.css', '/header.css', '/footer.css'],
    rootURL:
      (process.env.CONTEXT === 'production'
        ? process.env.URL
        : process.env.DEPLOY_URL) || '',
    timezone: 9 * 60,
    title: 'sounisi5011.jp',
    ogpType: 'website',
    ogpImageList: [
      {
        url: '/images/ogp.png',
        width: 400,
        height: 400,
      },
    ],
    ogpLocale: 'ja_JP',
    /* eslint-enable */
  })
  .source('./src/pages')
  .destination('./public')
  .clean(false)
  .use(
    pugCompile({
      copyFileData: true,
      pattern: [
        ...pugCompile.defaultOptions.pattern,
        '!_*/**',
        '!**/_*',
        '!**/_*/**',
      ],
    }),
  )
  .use(
    collections({
      characters: {
        pattern: ['characters/*.html', 'characters/*/*.html'],
        refer: false,
        sortBy: 'sortOrder',
      },
    }),
  )
  .use(anotherSource('./src/assets'))
  .use(netlifyMetadata())
  .use(assetsConvention())
  .use(copyConvention())
  .use(downloadConvention())
  .use(svg2png())
  .use(svg2ico())
  .use(
    anotherSource('./src/styles')
      .use(commentFrontmatter())
      .use(less({ sourceMap: false }))
      .use(
        postcss({
          // Source Mapのファイル名が<input css>になってしまうため無効化
          map: false,
          plugins: [
            { autoprefixer: { remove: false } },
            { 'postcss-clean': { level: 2 } },
          ],
        }),
      )
      .use(mergePreloadDependencies())
      .use(ignore('**/*.less')),
  )
  .use(mergePreloadDependencies())
  .use(preloadList({ preloadListIncludeKeys: ['preloadDependencies'] }))
  .use(mustache())
  .use(ignore(['**/*.pug']))
  .use(svgo())
  .use(
    permalinks({
      relative: false,
    }),
  )
  .use(
    pageQrCodeGenerator({
      pageURL(filename, file, files, metalsmith) {
        const data = {
          ...metalsmith.metadata(),
          ...file,
        };
        return templateFuncs.canonicalURL(
          data.rootURL,
          data.hasOwnProperty('path') ? data.path : filename,
        );
      },
    }),
  )
  .use(
    netlifyPublishedDate({
      contentsConverter: ignoreContentsEquals,
      plugins: [
        pugRender({
          locals: {
            ...templateFuncs,
          },
          pattern: 'characters/**/*.html',
          useMetadata: true,
        }),
        excerpts(),
        pugRender({
          pattern: pugRender.defaultOptions.pattern,
          reuse: true,
        }),
        blankshield({ insertNoreferrer: true }),
      ],
    }),
  )
  .build(err => {
    if (err) {
      throw err;
    }
  });
