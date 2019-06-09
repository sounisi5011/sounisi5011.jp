module.exports = () => {
  return (files, metalsmith, done) => {
    const metadata = metalsmith.metadata();
    const rootURL = metadata.url;

    Object.entries(files)
      .map(([filepath, filedata]) => [
        filepath
          .replace(/\.pug$/, '.html')
          .replace(/(?:^|\/)index\.html?$/, ''),
        filedata,
      ])
      .forEach(([filepath, filedata]) => {
        filedata.rootURL = rootURL;
        filedata.canonicalURL =
          rootURL.replace(/\/*$/, '') + filepath.replace(/^\/*/, '/');
      });

    done();
  };
};
