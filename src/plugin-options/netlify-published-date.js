const { URL } = require('url');
const util = require('util');

const chalk = require('chalk');
const cheerio = require('cheerio');
const { HtmlDiffer } = require('html-differ'); // eslint-disable-line import/order

const htmlDiffer = new HtmlDiffer({
  ignoreComments: false,
  ignoreWhitespaces: false,
});

const htmlDifferLogger =
  chalk.supportsColor && chalk.supportsColor.level > 0
    ? require('html-differ/lib/logger')
    : {
        /** @see https://github.com/bem/html-differ/blob/v1.4.0/lib/logger.js#L13-L60 */
        getDiffText(diff, options) {
          options = {
            charsAroundDiff: 40,
            ...options,
          };

          let charsAroundDiff = options.charsAroundDiff;
          let output = '';

          if (charsAroundDiff < 0) {
            charsAroundDiff = 40;
          }

          if (diff.length === 1 && !diff[0].added && !diff[0].removed)
            return output;

          diff.forEach(part => {
            const index = diff.indexOf(part);
            const partValue = part.value;
            let diffEffect;

            if (part.added) diffEffect = text => `[++${text}++]`;
            if (part.removed) diffEffect = text => `[--${text}--]`;

            if (diffEffect) {
              output += (index === 0 ? '\n' : '') + diffEffect(partValue);
              return;
            }

            if (partValue.length < charsAroundDiff * 2) {
              output += (index !== 0 ? '' : '\n') + partValue;
            } else {
              index !== 0 && (output += partValue.substr(0, charsAroundDiff));

              if (index < diff.length - 1) {
                output +=
                  '\n...\n' +
                  partValue.substr(partValue.length - charsAroundDiff);
              }
            }
          });

          return output;
        },
      };

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

  // modernizrのバージョンの差を無視する
  $('link[rel=preload][href^="/modernizr/"], script[src^="/modernizr/"]').each(
    (i, elem) => {
      const $elem = $(elem);
      const attrName = $elem.is('link') ? 'href' : 'src';
      const filepath = $elem.attr(attrName);
      if (!filepath) return;

      const replacedFilepath = filepath.replace(
        /\d+\.\d+\.\d+(?=\/[0-9a-f]+\.js$)/i,
        '[REPLACED]',
      );
      if (filepath === replacedFilepath) return;

      $elem.attr(attrName, replacedFilepath);
      isUpdated = true;
    },
  );

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

exports.showContentsDifference = ({
  file,
  previewPage,
  metadata: { filename, deploy },
}) => {
  const diff = htmlDiffer.diffHtml(String(previewPage), String(file));
  /** @see https://github.com/bem/html-differ/blob/v1.4.0/lib/index.js#L61 */
  const isEqual = diff.length === 1 && !diff[0].added && !diff[0].removed;

  if (!isEqual) {
    const diffText = htmlDifferLogger.getDiffText(diff);

    console.log(
      [
        [
          chalk.underline(deploy.title.replace(/\n+/g, ' ')),
          chalk.magenta(deploy.id),
          chalk.green(
            deploy.branch +
              '@' +
              chalk.underline(deploy.commit_ref.substring(0, 7)),
          ),
        ].join(' '),
        `${chalk.cyan(util.inspect(filename))}の差分:`,
        diffText.replace(/^[\r\n]+|[\r\n]+$/, '').replace(/^/gm, '> '),
        '',
        '',
      ].join('\n'),
    );

    return false;
  }
  return true;
};
