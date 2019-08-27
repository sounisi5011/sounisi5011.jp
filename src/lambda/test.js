const fs = require('fs');
const util = require('util');

const readdir = util.promisify(fs.readdir);

exports.handler = async (event, context) => {
  console.log({ context, event });
  return {
    body: JSON.stringify(
      { context, dir: await readdir('../_fragment-anchors/'), event },
      null,
      2,
    ),
    statusCode: 200,
  };
};
