const path = require('path');
const util = require('util');

const debug = require('debug')(
  `metalsmith---${path.relative(process.cwd(), __filename)}`,
);
const cheerio = require('cheerio');
const multimatch = require('multimatch');

function last(list) {
  return list[list.length - 1];
}

function createData($, idNode, text) {
  const id = idNode && $(idNode).attr('id');
  return {
    id: id !== undefined ? id : null,
    idNode,
    text,
  };
}

function readTextContents($, elem, opts = {}, prevIdNode = null) {
  const options = {
    ignoreElems: ['style', 'script', 'template'],
    replacer: (node, dataList) => dataList,
    ...opts,
  };
  const ignoreElemSelector = options.ignoreElems
    .map(nodeName => `:not(${String(nodeName).toLowerCase()})`)
    .join('');

  const $elem = $(elem);
  const dataList = [];

  $elem.each((i, node) => {
    const $node = $(node);

    if (node.type === 'text') {
      dataList.push(createData($, prevIdNode, node.data));
    } else if (node.type === 'tag' && $node.is(ignoreElemSelector)) {
      let currentIdNode = $node.is('[id]') ? node : prevIdNode;
      dataList.push(
        ...$node
          .contents()
          .get()
          .reduce(
            (list, childNode) => {
              const data = readTextContents(
                $,
                $(childNode),
                options,
                currentIdNode,
              );

              if (last(data)) {
                currentIdNode = last(data).idNode;
              }

              const firstDataItem = data[0];
              const lastListItem = last(list);
              if (firstDataItem && lastListItem) {
                if (lastListItem.idNode === firstDataItem.idNode) {
                  lastListItem.text += firstDataItem.text;
                  data.shift();
                }
              }

              return [...list, ...data];
            },
            currentIdNode !== null ? [createData($, currentIdNode, '')] : [],
          ),
      );
    }
  });

  return options.replacer($elem, dataList);
}

module.exports = opts => {
  const options = {
    pattern: '**/*.html',
    rootSelector: 'body',
    ...opts,
  };

  return (files, metalsmith, done) => {
    multimatch(Object.keys(files), options.pattern).forEach(filename => {
      const filedata = files[filename];
      try {
        let isUpdated = false;
        const $ = cheerio.load(filedata.contents.toString());

        $(options.rootSelector).each((i, elem) => {
          const $root = $(elem);
          const dataList = readTextContents($, $root);

          dataList.forEach(({ idNode, text }) => {
            if (idNode) {
              $(idNode).attr('data-share-text', text);
              isUpdated = true;
            }
          });
        });

        if (isUpdated) {
          filedata.contents = Buffer.from($.html());
          debug(`contents updated: ${util.inspect(filename)}`);
        }
      } catch (err) {
        //
      }
    });
    done();
  };
};
