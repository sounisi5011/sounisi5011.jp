const path = require('path');

const debug = require('debug')(
  `metalsmith-${path.relative(process.cwd(), __filename)}`,
);
const cheerio = require('cheerio');
const pluginKit = require('metalsmith-plugin-kit');

module.exports = opts => {
  const options = {
    insertNoreferrer: false,
    pattern: ['**/*.html', '**/*.htm'],
    ...opts,
  };

  return pluginKit.middleware({
    each: async (filename, file, files, metalsmith) => {
      const htmlData = file.contents.toString();
      const $ = cheerio.load(htmlData);
      let isUpdated = false;

      $('a[target=_blank]').each((i, elem) => {
        const $elem = $(elem);
        const relValue = $elem.attr('rel');
        const newRelList = [];

        if (!$elem.is('[rel~=noopener]')) {
          newRelList.push('noopener');
        }

        if (options.insertNoreferrer && !$elem.is('[rel~=noreferrer]')) {
          newRelList.push('noreferrer');
        }

        if (newRelList.length > 0) {
          const newRelValue =
            (relValue ? `${relValue} ` : '') + newRelList.join(' ');

          $elem.attr('rel', newRelValue);
          if (typeof relValue === 'string') {
            debug(
              '%s: <a rel="%s"> -> <a rel="%s">',
              filename,
              relValue,
              newRelValue,
            );
          } else {
            debug('%s: <a> -> <a rel="%s">', filename, newRelValue);
          }

          isUpdated = true;
        }
      });

      if (isUpdated) {
        const fixedHtmlData = $.html();
        file.contents = Buffer.from(fixedHtmlData);
      }
    },
    match: options.pattern,
  });
};
