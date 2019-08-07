const netlifyPublishedDate = require('@sounisi5011/metalsmith-netlify-published-date');
const cheerio = require('cheerio');
const Metalsmith = require('metalsmith');
const assetsConvention = require('metalsmith-assets-convention');
const collections = require('metalsmith-collections');
const excerpts = require('metalsmith-excerpts');
const ignore = require('metalsmith-ignore');
const permalinks = require('metalsmith-permalinks');
const {
  compile: pugCompile,
  render: pugRender,
} = require('metalsmith-pug-extra');

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
    description: 'sounisi5011の創作とソーシャルサービスの集約サイト',
    generator: 'Metalsmith',
    globalPageStyles: ['/default.css', '/footer.css'],
    rootURL:
      (process.env.CONTEXT === 'production'
        ? process.env.URL
        : process.env.DEPLOY_URL) || '',
    title: 'sounisi5011.jp',
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
      .use(less())
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
      contentsConverter(contents) {
        /**
         * @see https://github.com/sounisi5011/metalsmith-netlify-published-date/blob/v0.1.0/example/remove-time-elem.js
         */

        try {
          const $ = cheerio.load(contents.toString());

          const $timeElems = $(
            'time[itemprop~=datePublished],time[itemprop~=dateModified]',
          );

          // Note: If the file contents is not valid HTML, cheerio will not throw an error.
          //       However, the number of detected "time" elements will be 0.
          if ($timeElems.length >= 1) {
            $timeElems.each((index, element) => {
              const $time = $(element);
              $time.empty();
              if ($time.is('[datetime]')) {
                $time.attr('datetime', '');
              }
            });
            return Buffer.from($.html());
          }
        } catch (err) {
          //
        }

        return contents;
      },
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
