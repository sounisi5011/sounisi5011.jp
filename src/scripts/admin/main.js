import { h, setAttr, throttle } from '../utils/dom';

const asciidoctor = window.Asciidoctor();

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
});

const previewElem = h('iframe', { className: 'preview', style: { flex: 1 } });

function updatePreview(inputText) {
  const html = asciidoctor.convert(inputText);
  previewElem.contentDocument.body.innerHTML = html;
}

document.body.appendChild(editorElem);
document.body.appendChild(previewElem);
setAttr(document.body, {
  style: {
    display: 'flex',
    height: '100vh',
    margin: 0,
  },
});
