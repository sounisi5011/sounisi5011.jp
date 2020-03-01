import dialogPolyfill from 'dialog-polyfill';
import { load as waitCssLoaded } from 'dialog-polyfill/dialog-polyfill.css';

export function waitLoad() {
  return waitCssLoaded().then(({ linkElem }) => ({
    dialogPolyfill,
    cssLinkElem: linkElem,
  }));
}
