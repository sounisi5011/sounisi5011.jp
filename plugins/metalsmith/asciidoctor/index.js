const path = require('path');

const Asciidoctor = require('@asciidoctor/core');

function cloneStdObj(obj) {
  return Object.defineProperties({}, Object.getOwnPropertyDescriptors(obj));
}

module.exports = opts => {
  const asciidoctor = Asciidoctor();
  const options =
    (typeof opts === 'function' ? opts({ asciidoctor }) : opts) || {};
  const asciidoctorOpts = { safe: 'safe', ...options.asciidoctorOptions };
  if (Array.isArray(options.extensions)) {
    const registry =
      asciidoctorOpts.extension_registry || asciidoctor.Extensions.create();
    for (const extension of options.extensions) {
      if (typeof extension === 'function') {
        extension(registry);
      }
    }
    asciidoctorOpts.extension_registry = registry;
  }

  return (files, metalsmith, done) => {
    Object.entries(files)
      .filter(([filename]) =>
        /^\.(?:adoc|asciidoc)$/.exec(path.extname(filename)),
      )
      .forEach(([filename, filedata]) => {
        const sourceFilepath = path.resolve(metalsmith.source(), filename);

        const doc = asciidoctor.load(filedata.contents, {
          ...asciidoctorOpts,
          attributes: {
            // @see https://github.com/asciidoctor/asciidoctor/blob/master/lib/asciidoctor/load.rb#L60-L62
            docfile: sourceFilepath,
            docfilesuffix: path.extname(sourceFilepath),
            docname: path.basename(
              sourceFilepath,
              path.extname(sourceFilepath),
            ),
            // @see https://asciidoctor.org/docs/user-manual/#front-matter-added-for-static-site-generators
            ...(metalsmith.frontmatter() ? { 'skip-front-matter': '' } : {}),
            ...asciidoctorOpts.attributes,
          },
          base_dir: path.dirname(sourceFilepath),
        });
        const asciidocAttrs = doc.getAttributes();

        const newFilename = filename.replace(
          /\.[a-z]+$/,
          doc.getOutfilesuffix(),
        );
        delete files[filename];
        files[newFilename] = Object.assign(cloneStdObj(filedata), {
          title: asciidocAttrs.doctitle,
          // @see https://asciidoctor-docs.netlify.com/asciidoctor.js/processor/extract-api/#get-the-document-title
          titleHTML: doc.getDocumentTitle(),
          asciidocAttrs,
          contents: Buffer.from(doc.convert()),
        });
      });
    done();
  };
};
