const cheerio = require('cheerio');

const netlifyDeployUrlRegExp = /^https?:\/\/[0-9a-f]+--[0-9a-z-]+\.netlify\.com(?=[/?#]|$)/i;

/**
 * @see https://github.com/sounisi5011/metalsmith-netlify-published-date/blob/v0.1.0/example/remove-time-elem.js
 */
exports.ignoreContentsEquals = contents => {
  let isUpdated = false;

  try {
    const $ = cheerio.load(contents.toString());

    // canonical URLを置換
    $('head link[rel~=canonical][href^="http"]').each((index, element) => {
      const $meta = $(element);
      const hrefAttr = $meta.attr('href');
      if (netlifyDeployUrlRegExp.test(hrefAttr)) {
        $meta.attr(
          'href',
          hrefAttr.replace(netlifyDeployUrlRegExp, process.env.URL),
        );
        isUpdated = true;
      }
    });

    // OGPの絶対URLを置換
    $(
      'head meta:matches([property^="og:"], [property^="twitter:"])[content^="http"]',
    ).each((index, element) => {
      const $meta = $(element);
      const contentAttr = $meta.attr('content');
      if (netlifyDeployUrlRegExp.test(contentAttr)) {
        $meta.attr(
          'content',
          contentAttr.replace(netlifyDeployUrlRegExp, process.env.URL),
        );
        isUpdated = true;
      }
    });

    // ヘッダ内のQRコードのサイズ属性と絶対URLを置換
    $('header.page > .page-location').each((index, element) => {
      const $elem = $(element);

      $elem
        .find('picture.qr-code > img, img.qr-code')
        .each((index, element) => {
          const $img = $(element);
          if ($img.is('[width]')) {
            $img.attr('width', '0');
          }
          if ($img.is('[height]')) {
            $img.attr('height', '0');
          }
          isUpdated = true;
        });

      $elem.find('.url').each((index, element) => {
        const $url = $(element);
        $url.empty();
        isUpdated = true;
      });
    });

    // itemprop属性を持つtime要素を置換
    const $timeListMap = new Map();
    $('time[itemprop~=datePublished],time[itemprop~=dateModified]').each(
      (index, element) => {
        const $time = $(element);
        const scopeDepth = $time.parents('[itemscope]').length;

        if (!$timeListMap.has(scopeDepth)) {
          $timeListMap.set(scopeDepth, new Set());
        }

        $timeListMap.get(scopeDepth).add($time);
      },
    );
    const minScopeDepth = Math.min(...$timeListMap.keys());
    $timeListMap.get(minScopeDepth).forEach($time => {
      $time.empty();
      if ($time.is('[datetime]')) {
        $time.attr('datetime', '');
      }
      isUpdated = true;
    });

    if (isUpdated) {
      return Buffer.from($.html());
    }
  } catch (err) {
    //
  }

  return contents;
};
