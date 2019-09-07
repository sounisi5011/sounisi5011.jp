const { URL } = require('url');
const util = require('util');

const netlifyPublishedDate = require('@sounisi5011/metalsmith-netlify-published-date');
const cheerio = require('cheerio');

/**
 * @see https://infra.spec.whatwg.org/#ascii-whitespace
 * @see https://developer.mozilla.org/ja/docs/Web/JavaScript/Guide/Regular_Expressions/Character_Classes
 */
const HTML_WS_REGEXP = /[\t\n\f\r ]+/g;

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

function removeDateModifiedProp($elem) {
  if ($elem.is('[itemprop]')) {
    // itemprop属性にdatePublishedとdateModifiedの両方が存在する場合、dateModifiedを削除する。
    const itempropList = $elem
      .attr('itemprop')
      .split(HTML_WS_REGEXP)
      .filter(token => token !== '');
    if (
      itempropList.includes('datePublished') &&
      itempropList.includes('dateModified')
    ) {
      $elem.attr(
        'itemprop',
        itempropList.filter(token => token !== 'dateModified').join(' '),
      );
    } else {
      // 区切り文字による副作用を防ぐため、itemprop属性値は常に書き換える。
      $elem.attr('itemprop', itempropList.join(' '));
    }
  }
}

exports.setPublishedDate = (previewContents, filedata, { metalsmith }) => {
  try {
    const $ = cheerio.load(previewContents.toString());
    const $footer = $('footer.page');
    const $publishedTimes = $footer.find('time[itemprop~=datePublished]');
    const $modifiedTimes = $footer.find('time[itemprop~=dateModified]');

    const publishedDate = getTime($publishedTimes);
    const modifiedDate = getTime($modifiedTimes);

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
      const rootURL = new URL(
        { ...metalsmith.metadata(), ...filedata }.rootURL,
      );
      const canonicalURL = new URL(canonicalURLstr);

      filedata.canonical = canonicalURLstr;

      canonicalURL.pathname = rootURL.pathname;
      canonicalURL.search = rootURL.search;
      canonicalURL.hash = rootURL.hash;
      filedata.rootURL = String(canonicalURL);
    });

    if (publishedDate || modifiedDate) {
      filedata.published = publishedDate || modifiedDate;
      filedata.modified = modifiedDate || publishedDate;
    }
  } catch (err) {
    //
  }
};

/**
 * @see https://github.com/sounisi5011/metalsmith-netlify-published-date/blob/v0.1.0/example/remove-time-elem.js
 */
exports.ignoreContentsEquals = contents => {
  let isUpdated = false;

  try {
    const $ = cheerio.load(contents.toString());

    getCanonicalURLList($).forEach(canonicalURL => {
      const canonicalURLPath = new URL(canonicalURL).pathname;

      // 小説のページ一覧を処理
      if (/^[/]novels(?:[/][^/]+)?[/]?$/.test(canonicalURLPath)) {
        $('.novels > .novel .novel-date, .novel-pages .novel-date').each(
          (index, element) => {
            const $elem = $(element);

            // 公開日時のtime要素を置換
            $elem
              .find('time[itemprop=datePublished]')
              .each((index, element) => {
                const $time = $(element);

                $time.empty();
                if ($time.is('[datetime]')) {
                  $time.attr('datetime', '');
                }

                // itemprop属性にdatePublishedとdateModifiedの両方が存在する場合、dateModifiedを削除する。
                removeDateModifiedProp($time);

                isUpdated = true;
              });

            // 修正日時の変動で追加される要素を削除
            $elem
              .find('.split-text, .novel-modified')
              .add(
                $elem
                  .contents()
                  .filter((index, element) => element.type === 'text'),
              )
              .each((index, element) => {
                const $modified = $(element);
                $modified.remove();
                isUpdated = true;
              });
          },
        );
      }

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

      // itemprop属性にdatePublishedとdateModifiedの両方が存在する場合、dateModifiedを削除する。
      removeDateModifiedProp($time);

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

try {
  const chalk = require('chalk');
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
} catch (err) {
  exports.showContentsDifference =
    netlifyPublishedDate.defaultOptions.contentsEquals;
}
