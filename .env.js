const getPort = require('get-port');

module.exports = (async () => ({
  PORT: await getPort(),
}))();
