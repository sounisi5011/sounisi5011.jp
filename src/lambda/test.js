const fs = require('fs');
const util = require('util');

const readdir = util.promisify(fs.readdir);

const pathList = ['.', '..'];

exports.handler = async (event, context) => {
  const dir = {};
  for (const path of pathList) {
    try {
      dir[path] = await readdir(path);
    } catch (err) {
      dir[path] = err.message;
    }
  }

  return {
    body: JSON.stringify({ context, dir, event }, null, 2),
    statusCode: 200,
  };
};
