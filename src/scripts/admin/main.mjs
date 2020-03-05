import { h, throttle } from '../utils/dom';

const asciidoctor = window.Asciidoctor();

const editorElem = h('textarea', {
  className: 'editor',
  onInput: [
    event => throttle(updatePreview)(event.currentTarget.value),
    { passive: true },
  ],
});

const previewElem = h('iframe', { className: 'preview' });

function updatePreview(inputText) {
  const html = asciidoctor.convert(inputText);
  previewElem.contentDocument.body.innerHTML = html;
}

document.body.appendChild(editorElem);
document.body.appendChild(previewElem);
