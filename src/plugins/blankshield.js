const htmlparser = require('htmlparser2');
const pluginKit = require('metalsmith-plugin-kit');

const parser = new htmlparser.Parser(
  {
    onopentag: function(name, attribs) {
      if (name === 'a') {
        console.log({ attribs });
      }
    },
  },
  { decodeEntities: true },
);

module.exports = opts => {
  const options = {
    pattern: ['**/*.html', '**/*.htm'],
    ...opts,
  };

  return pluginKit.middleware({
    each: async (filename, file, files, metalsmith) => {
      const htmlData = file.contents.toString();
      parser(htmlData);
      const fixedHtmlData = htmlData;
      file.contents = Buffer.from(fixedHtmlData);
    },
    match: options.pattern,
  });
};
