// Note: metalsmith-svgoパッケージが存在するが、古いライブラリのため自作

const pluginKit = require('metalsmith-plugin-kit');
const SVGO = require('svgo');

module.exports = opts => {
  const options = {
    pattern: ['**/*.svg'],
    svgoOptions: {},
    ...opts,
  };
  const svgo = new SVGO(options.svgoOptions);

  return pluginKit.middleware({
    each: async (filename, file, files, metalsmith) => {
      const svgData = file.contents.toString();
      const result = await svgo.optimize(svgData);
      file.contents = Buffer.from(result.data);
    },
    match: options.pattern,
  });
};
