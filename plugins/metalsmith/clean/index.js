const rimraf = require('rimraf');

module.exports = opts => (files, metalsmith, done) => {
  const options = { disableGlob: true, ...opts };
  rimraf(metalsmith.destination(), options, done);
};
