const { URL } = require('url');

const addFileMeta = require('@sounisi5011/metalsmith-add-file-metadata');
const anotherSource = require('@sounisi5011/metalsmith-another-source');
const asciidoc = require('@sounisi5011/metalsmith-asciidoctor');
const blankshield = require('@sounisi5011/metalsmith-blankshield');
const clean = require('@sounisi5011/metalsmith-clean');
const commentFrontmatter = require('@sounisi5011/metalsmith-comment-matters');
const copyConvention = require('@sounisi5011/metalsmith-copy-convention');
const downloadConvention = require('@sounisi5011/metalsmith-download-convention');
const modernizr = require('@sounisi5011/metalsmith-modernizr');
const mustache = require('@sounisi5011/metalsmith-mustache');
const netlifyPublishedDate = require('@sounisi5011/metalsmith-netlify-published-date');
const pageQrCodeGenerator = require('@sounisi5011/metalsmith-page-qr-code-gen');
const preloadList = require('@sounisi5011/metalsmith-preload-list');
const {
  compile: pugLayoutsCompile,
} = require('@sounisi5011/metalsmith-pug-layouts');
const scriptModuleBundler = require('@sounisi5011/metalsmith-script-module-bundler');
const sitemap = require('@sounisi5011/metalsmith-sitemap');
const svg2ico = require('@sounisi5011/metalsmith-svg-to-ico');
const svg2png = require('@sounisi5011/metalsmith-svg-to-png');
const svgo = require('@sounisi5011/metalsmith-svgo');
const tweetableParagraphs = require('@sounisi5011/metalsmith-tweetable-paragraphs');
const {
  init: shorturlInit,
  generate: shorturlGen,
} = require('@sounisi5011/metalsmith-url-shortener');
const debug = require('debug');
const Metalsmith = require('metalsmith');
const assetsConvention = require('metalsmith-assets-convention');
const collections = require('metalsmith-collections');
const sass = require('metalsmith-dart-sass');
const directoryMetadata = require('metalsmith-directory-metadata');
const excerpts = require('metalsmith-excerpts');
const htmlValidator = require('metalsmith-html-validator');
const ignore = require('metalsmith-ignore');
const permalinks = require('metalsmith-permalinks');
const postcss = require('metalsmith-postcss2');
const {
  compile: pugCompile,
  render: pugRender,
} = require('metalsmith-pug-extra');

const asciidocExtensions = require('./plugins/asciidoctor/extensions');
const childPages = require('./plugins/metalsmith/child-pages');
const fixHFSPlusNormalization = require('./plugins/metalsmith/fix-hfs-plus-normalization');
const mergePreloadDependencies = require('./plugins/metalsmith/merge-preload-dependencies');
const netlifyMetadata = require('./plugins/metalsmith/netlifyMetadata');
const {
  ignoreContentsEquals,
  showContentsDifference,
  setPublishedDate,
} = require('./src/plugin-options/netlify-published-date');
const { propSort } = require('./src/utils');
const templateFuncs = require('./src/utils/template-functions');

if (
  process.env.NETLIFY_API_ACCESS_TOKEN &&
  debug.enabled(
    '@sounisi5011/metalsmith-netlify-published-date:netlify-api:request',
  )
) {
  // Note: このログの出力にはNetlifyのアクセストークンが表示されるため、常にこのログを除外する。
  const oldDebug = debug.disable();
  const newDebug = `${oldDebug},-@sounisi5011/metalsmith-netlify-published-date:netlify-api:request`;
  debug.enable(newDebug);
  console.log(`Overwrite env.DEBUG: "${oldDebug}" → "${newDebug}"`);
}

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
  .use(fixHFSPlusNormalization())
  .use(directoryMetadata({ pattern: '**/.metadata.*' }))
  /*
   * AsciiDocファイルの変換とレイアウトの適用
   */
  .use(
    asciidoc({
      extensions: asciidocExtensions,
      asciidoctorOptions: {
        backend: 'html5s',
      },
    }),
  )
  .use(
    pugLayoutsCompile({
      pattern: '**/*.html',
      directory: 'layouts',
    }),
  )
  /*
   * 依存関係のメタデータを更新
   */
  .use((files, metalsmith, done) => {
    const metadata = metalsmith.metadata();
    if (
      !Object.prototype.hasOwnProperty.call(metadata, 'preloadDependencies')
    ) {
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
      if (
        !Object.prototype.hasOwnProperty.call(filedata, 'preloadDependencies')
      ) {
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
  /*
   * Pugテンプレートのコンパイル
   */
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
        sortBy: propSort('sortOrder', 'path'),
      },
      novels: {
        pattern: ['novels/*.html', 'novels/*/index.html'],
        refer: false,
        sortBy: propSort('sortOrder', 'path'),
      },
      novelsPages: {
        pattern: ['novels/*/*.html', '!novels/*/index.html'],
        refer: false,
        sortBy: propSort('sortOrder', 'path'),
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
      .use(
        sass((_files, _metalsmith, defaultOptions) => ({
          dependenciesKey: 'dependencies',
          pattern: [...defaultOptions.pattern, '!**/_*/**'],
          sassOptions: {
            includePaths: ['node_modules'],
          },
        })),
      )
      .use(postcss())
      .use(mergePreloadDependencies())
      .use(ignore('**/*.scss')),
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
        if (
          Object.prototype.hasOwnProperty.call(
            filedata,
            'modernizr-feature-detects',
          )
        ) {
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
      const path = Object.prototype.hasOwnProperty.call(data, 'path')
        ? data.path
        : filename;

      return {
        canonical: templateFuncs.canonicalURL(data.rootURL, path),
        visibleCanonical: templateFuncs.canonicalURL(data.visibleRootURL, path),
      };
    }),
  )
  .use(
    shorturlInit({
      rootURLShrinker(rootURL) {
        const url = new URL(rootURL);
        // httpsをhttpに短縮
        // Note: 短縮URLでもHTTPSを使うべきか否かについては様々に考えられるが、以下の理由によりHTTPを使用することにした：
        //       + Bitlyはhttpを採用している
        //       + 誤り訂正レベルMのQRコードに変換する際に、26文字以下であればBitlyと同様の大きさで生成できる
        url.protocol = url.protocol.replace(/^https/, 'http');
        // サブドメインwwwを省略
        url.hostname = url.hostname.replace(/^www\./, '');
        return url.href;
      },
    }),
  )
  .use(
    pageQrCodeGenerator({
      pageURL(filename, file, files, metalsmith) {
        return metalsmith.metadata().createShortURL(file.visibleCanonical);
      },
    }),
  )
  .use(
    (options =>
      Object.keys(process.env).some(env => /^SKIP_NETLIFY_PUB_DATE$/i.test(env))
        ? [
            (files, metalsmith, done) => {
              const now = new Date();
              Object.values(files).forEach(file => {
                if (!file.published) file.published = now;
                if (!file.modified) file.modified = now;
              });
              done();
            },
            ...options.plugins,
          ]
        : netlifyPublishedDate(options))({
      accessToken: process.env.NETLIFY_API_ACCESS_TOKEN,
      contentsConverter: ignoreContentsEquals,
      contentsEquals: showContentsDifference,
      metadataUpdater: setPublishedDate,
      plugins: (({ allowWarning = true } = {}) => [
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
        scriptModuleBundler({
          jsDirectory: 'src/scripts',
          rollupOptions: require('./config/rollup')({ outputDir: './js/' }),
        }),
        tweetableParagraphs({
          filter(filename, filedata) {
            return filedata.tweetable;
          },
          generateFragmentPageURL(urlStr, id) {
            const url = new URL(urlStr);
            url.searchParams.set('fragment', id);
            return url.href;
          },
          qrCodeBasePageURL(url, { filedata }) {
            return filedata.visibleCanonical || url;
          },
          generateQRCodeURL(url, { metalsmith }) {
            return metalsmith.metadata().createShortURL(url);
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

              if ($elem.is('em')) {
                let openQuote, closeQuote;
                if ($elem.is('.voice')) {
                  openQuote = '「';
                  closeQuote = '」';
                } else if ($elem.is('.quot')) {
                  openQuote = '\u{201C}';
                  closeQuote = '\u{201D}';
                }
                if (openQuote && closeQuote) {
                  const firstChildTextData = textData;
                  const lastChildTextData =
                    childTextDataList[childTextDataList.length - 1];

                  firstChildTextData.rawText =
                    openQuote + firstChildTextData.rawText;
                  firstChildTextData.text = openQuote + firstChildTextData.text;
                  lastChildTextData.rawText += closeQuote;
                  lastChildTextData.text += closeQuote;
                }
              }
            }
            return childTextDataList;
          },
          get allowWarning() {
            return allowWarning;
          },
        }),
        (files, metalsmith, done) => {
          allowWarning = false;
          done();
        },
      ])(),
    }),
  )
  .use(
    htmlValidator((files, metalsmith, defaultOptions) => ({
      pattern: [].concat(defaultOptions.pattern, '!_fragment-anchors/**'),
    })),
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
  .use(shorturlGen())
  .use(clean())
  .build(err => {
    if (err) {
      if (err.stack && !err.stack.includes(err.message)) {
        console.error(err.message);
      }
      throw err;
    }
  });
