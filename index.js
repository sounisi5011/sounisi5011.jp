const Metalsmith = require('metalsmith');
const ignore = require('metalsmith-ignore');
const inplace = require('metalsmith-in-place');

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
  .use(
    inplace({
      pattern: ['**', '!_*/**', '!**/_*', '!**/_*/**'],
      setFilename: true,
    }),
  )
  .use(ignore(['_*/**', '**/_*', '**/_*/**']))
  .build(function(err, files) {
    if (err) {
      throw err;
    }
  });
