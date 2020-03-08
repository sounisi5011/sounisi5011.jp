import Asciidoctor from '@asciidoctor/core';

import asciidocExtensions from '../../../plugins/asciidoctor/extensions';

const asciidoctor = Asciidoctor();

const registry = asciidoctor.Extensions.create();
for (const extension of asciidocExtensions) {
  if (typeof extension === 'function') {
    extension(registry);
  }
}

const asciidoctorOptions = {
  backend: 'html5s',
  attributes: {
    // @see https://asciidoctor.org/docs/user-manual/#front-matter-added-for-static-site-generators
    'skip-front-matter': '',
  },
  extension_registry: registry,
};

self.addEventListener('message', event => {
  const { input } = event.data;

  const doc = asciidoctor.load(input, asciidoctorOptions);

  self.postMessage({
    // @see https://asciidoctor-docs.netlify.com/asciidoctor.js/processor/extract-api/#get-the-document-title
    title: doc.getDocumentTitle(),
    html: doc.convert(),
  });
});
