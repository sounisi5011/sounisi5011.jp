const { URL } = require('url');

const netlifyPublishedDate = require('@sounisi5011/metalsmith-netlify-published-date');
const Metalsmith = require('metalsmith');
const assetsConvention = require('metalsmith-assets-convention');
const babel = require('metalsmith-babel');
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
  showContentsDifference,
  setPublishedDate,
} = require('./src/plugin-options/netlify-published-date');
const addFileMeta = require('./src/plugins/add-file-metadata');
const anotherSource = require('./src/plugins/another-source');
const blankshield = require('./src/plugins/blankshield');
const childPages = require('./src/plugins/child-pages');
const commentFrontmatter = require('./src/plugins/comment-matters');
const copyConvention = require('./src/plugins/copy-convention');
const downloadConvention = require('./src/plugins/download-convention');
const less = require('./src/plugins/less');
const mergePreloadDependencies = require('./src/plugins/merge-preload-dependencies');
const modernizr = require('./src/plugins/modernizr');
const mustache = require('./src/plugins/mustache');
const netlifyMetadata = require('./src/plugins/netlifyMetadata');
const pageQrCodeGenerator = require('./src/plugins/page-qr-code-gen');
const preloadList = require('./src/plugins/preload-list');
const sitemap = require('./src/plugins/sitemap');
const svg2ico = require('./src/plugins/svg-to-ico');
const svg2png = require('./src/plugins/svg-to-png');
const svgo = require('./src/plugins/svgo');
const tweetableParagraphs = require('./src/plugins/tweetable-paragraphs');
const templateFuncs = require('./src/utils/template-functions');

Metalsmith(__dirname)
  .metadata({
    /* eslint-disable sort-keys */
    siteName: 'sounisi5011.jp',
    generator: 'Metalsmith',
    globalPageStyles: ['/default.css', '/header.css', '/footer.css'],
    globalPageScripts: ['/add-header-height.js'],
    rootURL:
      (process.env.CONTEXT === 'production'
        ? process.env.URL
        : process.env.DEPLOY_URL) || '',
    visibleRootURL: process.env.URL,
    timezone: 9 * 60,
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
  .use((files, metalsmith, done) => {
    const metadata = metalsmith.metadata();
    if (!metadata.hasOwnProperty('preloadDependencies')) {
      metadata.preloadDependencies = [];
    }
    if (Array.isArray(metadata.preloadDependencies)) {
      const preloadDependenciesSet = new Set(metadata.preloadDependencies);
      [
        metadata.globalPageStyles,
        metadata.globalPageHeadScripts,
        metadata.globalPageScripts,
      ].forEach(pathList => {
        if (Array.isArray(pathList)) {
          pathList.forEach(url => preloadDependenciesSet.add(url));
        }
      });
      metadata.preloadDependencies = [...preloadDependenciesSet];
    }
    Object.values(files).forEach(filedata => {
      if (!filedata.hasOwnProperty('preloadDependencies')) {
        filedata.preloadDependencies = [];
      }

      if (!Array.isArray(filedata.localPageStyles)) {
        filedata.localPageStyles = [];
      }
      if (!Array.isArray(filedata.localPageScripts)) {
        filedata.localPageScripts = [];
      }
      if (filedata.tweetable) {
        filedata.localPageStyles.push('/paragraphs-share.css');
        filedata.localPageScripts.push('/paragraphs-share.js');
      }

      if (Array.isArray(filedata.preloadDependencies)) {
        const preloadDependenciesSet = new Set();
        [
          filedata.localPageStyles,
          filedata.localPageHeadScripts,
          filedata.localPageScripts,
        ].forEach(pathList => {
          if (Array.isArray(pathList)) {
            pathList.forEach(url => preloadDependenciesSet.add(url));
          }
        });
        filedata.preloadDependencies.forEach(url =>
          preloadDependenciesSet.add(url),
        );
        filedata.preloadDependencies = [...preloadDependenciesSet];
      }
    });
    done();
  })
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
      novels: {
        pattern: ['novels/*.html', 'novels/*/index.html'],
        refer: false,
        sortBy: 'sortOrder',
      },
      novelsPages: {
        pattern: ['novels/*/*.html', '!novels/*/index.html'],
        refer: false,
        sortBy: 'sortOrder',
      },
    }),
  )
  .use(childPages())
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
  .use(
    anotherSource('./src/scripts')
      .ignore('.eslintrc.*')
      .use(
        babel({
          comments: false,
          presets: [
            [
              '@babel/preset-env',
              {
                corejs: 3,
                exclude: [
                  /**
                   * Symbolsは使用しないので、Symbol関係のpolyfillを除外する
                   * @see https://github.com/zloirock/core-js/blob/v3.2.1/README.md#ecmascript-string-and-regexp
                   * @see https://github.com/zloirock/core-js/blob/v3.2.1/packages/core-js/modules/es.object.to-string.js
                   * @see https://github.com/zloirock/core-js/blob/v3.2.1/packages/core-js/internals/object-to-string.js
                   */
                  'es.string.match',
                  'es.string.replace',
                  'es.string.search',
                  'es.string.split',
                  'es.object.to-string',
                  /**
                   * RegExpのtoStringメソッドの関数名と、RegExpオブジェクトではないオブジェクトがthisだった場合に動作させる修正。
                   * このような機能に依存した処理を書くつもりは無いため、除外。
                   * @see https://github.com/zloirock/core-js/blob/v3.2.1/packages/core-js/modules/es.regexp.to-string.js
                   */
                  'es.regexp.to-string',
                  /**
                   * RegExp.lastIndexの値と、マッチしなかったグループの値がundefinedではない値になる、IE8のexecメソッドに関するバグ修正。
                   * こんな絶妙な使い方をすることはおそらく無く、またIE8など眼中に無いため、無効化。
                   * @see https://github.com/zloirock/core-js/blob/v3.2.1/packages/core-js/internals/regexp-exec.js
                   */
                  'es.regexp.exec',
                  /**
                   * 不正な形式のDateオブジェクトを文字列化した際に"Invalid Date"を返すpolyfill。
                   * この値に依存した処理を書くつもりは無いため、除外。
                   * @see https://github.com/zloirock/core-js/blob/v3.2.1/packages/core-js/modules/es.date.to-string.js
                   */
                  'es.date.to-string',
                ],
                useBuiltIns: 'usage',
              },
            ],
            'minify',
          ],
        }),
      ),
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
    modernizr({
      config(filename, filedata) {
        if (filedata.hasOwnProperty('modernizr-feature-detects')) {
          return {
            classPrefix: 'modernizr--',
            'feature-detects': filedata['modernizr-feature-detects'] || [],
            minify: true,
            options: filedata['modernizr-options'] || [],
          };
        }
      },
      outputProp(modernizrFilename, filename, filedata) {
        filedata.localPageScripts = [
          ...(filedata.localPageScripts || []),
          modernizrFilename,
        ];
      },
    }),
  )
  .use(
    addFileMeta((filename, filedata, files, metalsmith) => {
      const data = {
        ...metalsmith.metadata(),
        ...filedata,
      };
      const path = data.hasOwnProperty('path') ? data.path : filename;

      return {
        canonical: templateFuncs.canonicalURL(data.rootURL, path),
        visibleCanonical: templateFuncs.canonicalURL(data.visibleRootURL, path),
      };
    }),
  )
  .use(
    pageQrCodeGenerator({
      pageURL(filename, file, files, metalsmith) {
        return file.visibleCanonical;
      },
    }),
  )
  .use(
    netlifyPublishedDate({
      contentsConverter: ignoreContentsEquals,
      contentsEquals: showContentsDifference,
      metadataUpdater: setPublishedDate,
      plugins: [
        pugRender({
          locals: {
            env: process.env,
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
        tweetableParagraphs({
          filter(filename, filedata) {
            return filedata.tweetable;
          },
          generateFragmentPageURL(urlStr, id) {
            const url = new URL(urlStr);
            url.searchParams.set('fragment', id);
            return url.href;
          },
          ignoreElems: ['style', 'script', 'template', 'aside.message'],
          rootSelector: '.novel-body',
          textContentsReplacer($elem, childTextDataList) {
            const textData = childTextDataList[0];
            if (textData) {
              const isEmpty =
                $elem.is('[aria-hidden=true]') ||
                /^[\t\n\f\r ]+$/.test($elem.text());

              for (let lines = 30; lines; lines--) {
                if ($elem.is(`.spacing-${lines}`)) {
                  textData.margin.top = lines;
                  if (!isEmpty) {
                    textData.margin.bottom = lines;
                  }
                }
              }
            }
            return childTextDataList;
          },
        }),
      ],
    }),
  )
  .use(
    sitemap({
      hostname(files, metalsmith) {
        const metadata = metalsmith.metadata();
        return metadata.rootURL;
      },
      modifiedProperty: 'modified',
    }),
  )
  .build(err => {
    if (err) {
      throw err;
    }
  });
