const fs = require('fs');
const util = require('util');

const readdir = util.promisify(fs.readdir);

exports.handler = async (event, context) => {
  return {
    body: JSON.stringify(await readdir('.'), null, 2),
    statusCode: 200,
  };
};
