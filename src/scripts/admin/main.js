import getTextDataList from '@sounisi5011/html-id-split-text';
import twitter from 'twitter-text';

import { h, maxScroll, setAttr, throttle } from '../utils/dom';
import asciidocExtensions from '../../../plugins/asciidoctor/extensions';
import html2textConfig from '../../../config/html2text';

const asciidoctor = window.Asciidoctor();

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

/**
 * @param {string} tweetText
 * @param {string} suffixText
 * @returns {{ validText:string, validLength:number, invalidText:string }}
 */
function getInvalidTweetData(tweetText, suffixText = '') {
  const tweet = twitter.parseTweet(tweetText + suffixText);

  if (tweet.valid) {
    return null;
  }

  let validLength = Math.min(tweetText.length - 1, tweet.validRangeEnd);
  while (validLength >= 0) {
    if (
      twitter.parseTweet(tweetText.substring(0, validLength) + suffixText).valid
    ) {
      break;
    }
    validLength--;
  }

  return {
    validText: tweetText.substring(0, validLength),
    validLength,
    invalidText: tweetText.substring(validLength),
  };
}

// ----- ----- ----- ----- ----- //

const editorElem = h('textarea', {
  className: 'editor',
  style: {
    flex: 1,
    resize: 'none',
  },
  onInput: [
    event => throttle(updatePreview)(event.currentTarget.value),
    { passive: true },
  ],
  onScroll: [
    event => throttle(scrollPreview)(event.currentTarget),
    { passive: true },
  ],
});

const previewElem = h('iframe', { className: 'preview', style: { flex: 1 } });

const novelTitleElem = h('h1', { className: 'novel-title' });
const novelBodyElem = h('main', { className: 'novel-body' });

function updatePreview(inputText) {
  const doc = asciidoctor.load(inputText, asciidoctorOptions);

  // @see https://asciidoctor-docs.netlify.com/asciidoctor.js/processor/extract-api/#get-the-document-title
  const title = doc.getDocumentTitle();
  if (title) {
    novelTitleElem.innerHTML = title;
    setAttr(novelTitleElem, {
      style: {
        cssText: '',
      },
    });
  } else {
    novelTitleElem.innerHTML = 'No Title';
    setAttr(novelTitleElem, {
      style: {
        opacity: 0.2,
      },
    });
  }

  const html = doc.convert();
  novelBodyElem.innerHTML = html;

  const dataList = getTextDataList(novelBodyElem, html2textConfig);
  console.log({
    dataList: dataList
      .map(data => [
        data,
        getInvalidTweetData(data.text, `\u{0020}${location.href}`),
      ])
      .filter(([, invalidTweet]) => invalidTweet)
      .map(([{ id, idNode, text }, invalidTweet]) => ({
        id,
        idNode,
        text,
        ...invalidTweet,
      })),
  });
}

function scrollPreview(editorElem) {
  const previewScrollingElement = previewElem.contentDocument.scrollingElement;
  const editorScrollPct = editorElem.scrollTop / maxScroll(editorElem).top;

  previewScrollingElement.scrollTo(
    previewScrollingElement.scrollLeft,
    maxScroll(previewScrollingElement).top * editorScrollPct,
  );
}

document.body.appendChild(editorElem);

document.body.appendChild(previewElem);
(previewDoc => {
  previewDoc.documentElement.lang = 'ja';
  for (const href of ['/default.css', '/novels.css']) {
    previewDoc.head.appendChild(h('link', { rel: 'stylesheet', href }));
  }
  previewDoc.body.appendChild(novelTitleElem);
  previewDoc.body.appendChild(novelBodyElem);
})(previewElem.contentDocument);

setAttr(document.body, {
  style: {
    display: 'flex',
    height: '100vh',
    margin: 0,
  },
});

updatePreview('');
