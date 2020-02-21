const Metalsmith = require('metalsmith');

module.exports = (sourcePath, { override = false } = {}) => {
  const taskList = [];
  const middlewareFn = (files, metalsmith, done) => {
    const subMetalsmith = Metalsmith(metalsmith.directory())
      .metadata(metalsmith.metadata())
      .source(sourcePath)
      .destination(metalsmith.destination())
      .clean(false);

    taskList.forEach(([methodName, args]) => {
      subMetalsmith[methodName](...args);
    });

    subMetalsmith.process((err, newFiles) => {
      if (err) {
        throw err;
      }

      if (override) {
        Object.assign(files, newFiles);
      } else {
        Object.entries(newFiles).forEach(([filepath, filedata]) => {
          if (!files.hasOwnProperty(filepath)) {
            files[filepath] = filedata;
          }
        });
      }

      done();
    });
  };

  ['use', 'metadata', 'concurrency', 'frontmatter', 'ignore'].forEach(
    methodName => {
      middlewareFn[methodName] = (...args) => {
        taskList.push([methodName, args]);
        return middlewareFn;
      };
    },
  );

  return middlewareFn;
};
