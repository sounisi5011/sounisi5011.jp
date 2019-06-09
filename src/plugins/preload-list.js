const mime = require('mime');

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = ({ preloadListKey = 'preloadList' } = {}) => {
  return (files, metalsmith, done) => {
    const metadata = metalsmith.metadata();
    const metadataPreloadList = toArray(metadata[preloadListKey]);

    Object.values(files).forEach(filedata => {
      const preloadList = toArray(filedata[preloadListKey]);
      filedata[preloadListKey] = [...metadataPreloadList, ...preloadList].map(
        data => {
          const resourceData = {};

          if (typeof data === 'object') {
            Object.assing(resourceData, data);
          } else {
            resourceData.href = String(data);
          }

          if (!resourceData.type) {
            resourceData.type = mime.getType(resourceData.href);
          }

          if (!resourceData.as) {
            const resourceMIME = resourceData.type;
            resourceData.as =
              resourceMIME === 'text/css'
                ? 'style'
                : resourceMIME === 'application/javascript'
                ? 'script'
                : /^image\//.test(resourceMIME)
                ? 'image'
                : /^font\//.test(resourceMIME)
                ? 'font'
                : null;
          }

          /*
           * see https://developer.mozilla.org/en-US/docs/Web/HTML/Preloading_content#Cross-origin_fetches
           */
          if (resourceData.as === 'font') {
            resourceData.crossorigin = 'anonymous';
          }

          return resourceData;
        },
      );
    });

    done();
  };
};
