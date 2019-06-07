const Metalsmith = require('metalsmith');
const ignore = require('metalsmith-ignore');
const inplace = require('metalsmith-in-place');
const mime = require('mime');

Metalsmith(__dirname)
  .metadata({
    title: 'sounisi5011.jp',
    description: 'sounisi5011の創作とソーシャルサービスの集約サイト',
    generator: 'Metalsmith',
    url:
      (process.env.CONTEXT === 'production'
        ? process.env.URL
        : process.env.DEPLOY_URL) || '',
  })
  .source('./src/pages')
  .destination('./public')
  .clean(false)
  .use((files, metalsmith, done) => {
    const metadata = metalsmith.metadata();
    const rootURL = metadata.url;

    Object.entries(files).forEach(([filepath, filedata]) => {
      filedata.rootURL = rootURL;
      filedata.canonicalURL =
        rootURL.replace(/\/*$/, '') + filepath.replace(/^\/*/, '/');
    });

    done();
  })
  .use((files, metalsmith, done) => {
    const metadata = metalsmith.metadata();
    const metadataPreloadList = Array.isArray(metadata.preloadList)
      ? metadata.preloadList
      : [];

    Object.values(files).forEach(file => {
      const preloadList = Array.isArray(file.preloadList)
        ? file.preloadList
        : [];
      file.preloadList = metadataPreloadList.concat(preloadList).map(data => {
        const resourceData =
          typeof data === 'object' ? data : { url: String(data) };

        if (!resourceData.type) {
          resourceData.type = mime.getType(resourceData.url);
        }

        if (!resourceData.as) {
          const resourceMIME = resourceData.type;
          resourceData.as =
            resourceMIME === 'text/css'
              ? 'style'
              : resourceMIME === 'application/javascript'
              ? 'script'
              : /^image\//.test(resourceMIME)
              ? 'image'
              : /^font\//.test(resourceMIME)
              ? 'font'
              : 'unknown';
        }

        return resourceData;
      });
    });
    done();
  })
  .use(
    inplace({
      pattern: ['**', '!_*/**', '!**/_*', '!**/_*/**'],
      setFilename: true,
    }),
  )
  .use(ignore(['**/*.pug']))
  .build(function(err, files) {
    if (err) {
      throw err;
    }
  });
