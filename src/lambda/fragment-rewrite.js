const fs = require('fs');
const util = require('util');

const readFile = util.promisify(fs.readFile);

const dataDirname = '_fragment-anchors';

exports.handler = async (event, context) => {
  const fragment = event.queryStringParameters.fragment;
  if (fragment) {
    const filepathList = [
      `${dataDirname}/${fragment}/${event.path}.html`,
      `${dataDirname}/${fragment}/${event.path}/index.html`,
    ];

    for (const filepath of filepathList) {
      try {
        const body = await readFile(require.resolve(`./${filepath}`));
        return {
          body,
          headers: {
            'content-type': 'text/html; charset=utf-8',
          },
          statusCode: 200,
        };
      } catch (err) {
        //
      }
    }

    return {
      headers: {
        location: event.path + `#${encodeURIComponent(fragment)}`,
      },
      statusCode: 301,
    };
  }

  return {
    headers: {
      location: event.path,
    },
    statusCode: 301,
  };
};
