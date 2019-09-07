const { URL } = require('url');
const util = require('util');

const netlifyPublishedDate = require('@sounisi5011/metalsmith-netlify-published-date');
const cheerio = require('cheerio');

function cmp(a, b) {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function getTime($time) {
  const dateStr = $time.attr('datetime') || $time.text();
  if (dateStr) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

function getCanonicalURLList($) {
  return $('head link[rel=canonical]')
    .map((index, element) => {
      const $link = $(element);
      return $link.attr('href');
    })
    .get();
}

exports.setPublishedDate = (previewContents, filedata, { metalsmith }) => {
  const $ = cheerio.load(previewContents.toString());

  $('script[src^="https://www.googletagmanager.com/gtag/js?"]').each(
    (index, element) => {
      const $gaScript = $(element);
      const gaSrc = $gaScript.attr('src');
      const id = gaSrc && new URL(gaSrc).searchParams.get('id');
      if (id) {
        filedata.env = {
          ...filedata.env,
          GOOGLE_ANALYTICS_MEASUREMENT_ID: id,
        };
      }
    },
  );

  // ページのルートURLをプレビューに合うように変更
  getCanonicalURLList($).forEach(canonicalURLstr => {
    const rootURL = new URL({ ...metalsmith.metadata(), ...filedata }.rootURL);
    const canonicalURL = new URL(canonicalURLstr);

    filedata.canonical = canonicalURLstr;

    canonicalURL.pathname = rootURL.pathname;
    canonicalURL.search = rootURL.search;
    canonicalURL.hash = rootURL.hash;
    filedata.rootURL = String(canonicalURL);
  });

  // ページの公開・更新日をプレビューに合うように変更
  const $footer = $('footer.page');
  const $publishedTimes = $footer.find('time[itemprop~=datePublished]');
  const $modifiedTimes = $footer.find('time[itemprop~=dateModified]');
  const publishedDate = getTime($publishedTimes);
  const modifiedDate = getTime($modifiedTimes);
  if (publishedDate || modifiedDate) {
    filedata.published = publishedDate || modifiedDate;
    filedata.modified = modifiedDate || publishedDate;
  }
};

/**
 * @see https://github.com/sounisi5011/metalsmith-netlify-published-date/blob/v0.1.0/example/remove-time-elem.js
 */
exports.ignoreContentsEquals = contents => {
  let isUpdated = false;
  const $ = cheerio.load(contents.toString());

  // preloadを定義するlink要素の順序をリセットする
  $('link[rel=preload]')
    .get()
    .reduce((map, linkElem) => {
      const parentElem = linkElem.parent;
      const list = map.get(parentElem) || [];
      list.push(linkElem);
      return map.set(parentElem, list);
    }, new Map())
    .forEach((linkElemList, parentElem) => {
      const $head = $(parentElem);
      linkElemList
        .map(linkElem => $(linkElem))
        .sort(($link1, $link2) => cmp($.html($link1), $.html($link2)))
        .forEach($link => {
          $head.append($link);
        });
      isUpdated = true;
    });

  getCanonicalURLList($).forEach(canonicalURL => {
    const canonicalURLPath = new URL(canonicalURL).pathname;

    // 小説の各ページを処理
    if (/^[/]novels[/][^/]+[/][^/]+[/]?$/.test(canonicalURLPath)) {
      $('.pagination a:matches([rel=prev], [rel=next], .prev, .next)').each(
        (index, element) => {
          const $a = $(element);

          /**
           * ページネーションのa要素を置換
           * @example
           * `<a href="/novels/:title/:page" rel="prev">前へ</a>` -> `<a>前へ</a>`
           * `<a class="prev" aria-hidden="true">前へ</a>`        -> `<a>前へ</a>`
           * `<a href="/novels/:title/:page" rel="next">次へ</a>` -> `<a>次へ</a>`
           * `<a class="next" aria-hidden="true">次へ</a>`        -> `<a>次へ</a>`
           */
          $a.removeClass('prev next');
          if (/^\s*$/.test($a.attr('class'))) {
            // class属性値が空文字列になったら、属性を削除
            $a.removeAttr('class');
          }
          $a.removeAttr('href');
          $a.removeAttr('rel');
          $a.removeAttr('aria-hidden');

          isUpdated = true;
        },
      );
    }
  });

  if (isUpdated) {
    return Buffer.from($.html());
  }

  return contents;
};

exports.showContentsDifference =
  netlifyPublishedDate.defaultOptions.contentsEquals;

try {
  const chalk = require('chalk');

  if (chalk.supportsColor && chalk.supportsColor.level > 0) {
    const { HtmlDiffer } = require('html-differ');
    const logger = require('html-differ/lib/logger');

    const htmlDiffer = new HtmlDiffer({
      ignoreComments: false,
      ignoreWhitespaces: false,
    });

    exports.showContentsDifference = ({
      file,
      previewPage,
      metadata: { filename },
    }) => {
      if (!file.equals(previewPage)) {
        const diff = htmlDiffer.diffHtml(String(previewPage), String(file));
        const diffText = logger.getDiffText(diff);

        console.log(
          `${chalk.cyan(util.inspect(filename))}の差分:\n${diffText.replace(
            /^[\r\n]+|[\r\n]+$/,
            '',
          )}\n\n`,
        );

        return false;
      }
      return true;
    };
  }
} catch (err) {
  //
}
