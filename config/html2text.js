/*
 * HTMLをツイート用文字列に変換する際に使用する設定。
 * @sounisi5011/html-id-split-textに渡される。
 * @sounisi5011/metalsmith-tweetable-paragraphsでも使用される。
 */

module.exports = {
  convertHook: {
    /*
     * spacing-XXクラスが指定された「連続改行用要素」の処理
     */
    '[class*="spacing-"]': ({
      domNode,
      domUtils,
      textData,
      childTextContent,
    }) => {
      const classValue = domUtils.getAttribute(domNode, 'class');
      if (!classValue) return;

      const lines = classValue
        .split(/\s+/)
        .map(className => /^spacing-(\d+)$/.exec(className))
        .map(match => (match ? Number(match[1]) : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      if (lines >= 1) {
        textData.marginTopLines = lines;

        const isEmpty =
          domUtils.matches(domNode, '[aria-hidden=true]') ||
          /^[\t\n\f\r ]+$/.test(childTextContent);
        if (!isEmpty) {
          textData.marginBottomLines = lines;
        }
      }
    },
    /*
     * 括弧を表示するem要素の処理
     */
    'em[class]': ({ domNode, domUtils, textData, childTextDataList }) => {
      const quoteList = [
        {
          selector: '.voice',
          open: '「',
          close: '」',
        },
        {
          selector: '.quot',
          open: '\u{201C}',
          close: '\u{201D}',
        },
      ];
      for (const { selector, open, close } of quoteList) {
        if (!domUtils.matches(domNode, selector)) continue;

        const firstChildTextData = textData;
        const lastChildTextData =
          childTextDataList[childTextDataList.length - 1];

        firstChildTextData.rawText = open + firstChildTextData.rawText;
        firstChildTextData.text = open + firstChildTextData.text;
        lastChildTextData.rawText += close;
        lastChildTextData.text += close;

        return;
      }
    },
  },
};
