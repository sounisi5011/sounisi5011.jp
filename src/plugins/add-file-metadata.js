module.exports = props => {
  return (files, metalsmith, done) => {
    Object.entries(files).forEach(([filename, filedata]) => {
      const descs = Object.getOwnPropertyDescriptors(
        typeof props === 'function'
          ? props(filename, filedata, files, metalsmith)
          : props,
      );
      Object.values(descs).forEach(desc => {
        // Note: @sounisi5011/metalsmith-netlify-published-dateプラグインの実装の問題で、setterがないとエラーが起きてしまう
        if (desc.get && !desc.set) {
          desc.set = () => {};
        }
      });

      Object.defineProperties(filedata, descs);
    });

    done();
  };
};
