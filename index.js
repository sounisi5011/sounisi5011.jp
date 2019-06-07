const Metalsmith = require('metalsmith');

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
  .build(function(err, files) {
    if (err) {
      throw err;
    }
  });
