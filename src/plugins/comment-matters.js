const matter = require('gray-matter');
const isUtf8 = require('is-utf8');
const pluginKit = require('metalsmith-plugin-kit');

function stripIndent(text) {
  const minIndentLength = text
    .split(/\r\n?|\n/)
    .filter(line => line !== '')
    .map(line => /^ */.exec(line)[0])
    .reduce(
      (indentLen, indent) => Math.min(indentLen, indent.length),
      Infinity,
    );
  const indentDeletedText = text.replace(/[^\r\n]+/gm, line =>
    line.substring(minIndentLength),
  );
  return indentDeletedText;
}

module.exports = opts => {
  const options = {
    '**/*.less': text => {
      /*
       * 複数行コメントを処理
       */
      const multiLineMatch = /^\/\*(?:\r\n?|\n)?((?:(?!\*\/).)+)\*\//s.exec(
        text,
      );
      if (multiLineMatch) {
        return multiLineMatch[1];
      }

      /*
       * 単一行コメントを処理
       */
      const inineMatch = /^\/\/[^\r\n]*(?:(?:\r\n?|\n)(?:\/\/[^\r\n]*|))*/.exec(
        text,
      );
      if (inineMatch) {
        const commentText = inineMatch[0]
          // 各行の行頭の"//"を削除
          .replace(/(^|\r\n?|\n)\/\//g, '$1');
        return stripIndent(commentText);
      }
    },
    '**/*.pug': text => {
      const match = /^\/\/-(?:\r\n?|\n)((?:(?:| +[^\r\n]*)(?:\r\n?|\n|$))+)/.exec(
        text,
      );
      if (match) {
        const commentText = match[1];
        return stripIndent(commentText);
      }
    },
    ...opts,
  };

  const pattern = Object.keys(options);
  const filenameMatcherList = Object.entries(options).map(
    ([filenamePattern, commentParser]) => {
      const filenameMatcher = pluginKit.filenameMatcher(filenamePattern);
      const parseCommentFn =
        commentParser instanceof RegExp
          ? text => {
              const match = commentParser.exec(text);
              if (match) {
                return match[1];
              }
            }
          : commentParser;

      return [filenameMatcher, parseCommentFn];
    },
  );

  return pluginKit.middleware({
    each: (filename, file) => {
      if (!isUtf8(file.contents)) {
        return;
      }

      /*
       * 最初に一致するcommentParserを取得する
       */
      const [, commentParser] =
        filenameMatcherList.find(([filenameMatcher]) =>
          filenameMatcher(filename),
        ) || [];
      if (!commentParser) {
        return;
      }

      /*
       * コメントを解析し、matterに渡す文字列を取得する
       */
      const matterText = commentParser(file.contents.toString());
      if (!matterText) {
        return;
      }

      /**
       * 文字列を解析する
       * TODO: 適切なエラー処理
       * @see https://github.com/segmentio/metalsmith/blob/v2.3.0/lib/index.js#L282-L288
       * @see https://github.com/Ajedi32/metalsmith-matters/blob/v1.2.0/lib/index.js#L23-L32
       */
      const parsed = matter(String(matterText));

      /*
       * 解析したデータをファイルオブジェクトに追加する
       */
      Object.entries(parsed.data)
        /**
         * Metalsmithがファイル読み込み時に追加するプロパティは除外する
         * @see https://github.com/segmentio/metalsmith/blob/v2.3.0/lib/index.js#L290-L297
         */
        .filter(([prop]) => !/^(?:contents|mode|stats)$/.test(prop))
        .map(([prop, value]) => {
          file[prop] = value;
        });
    },
    match: pattern,
  });
};
