function escapeAttrValue(value) {
  return (
    value
      /* @see https://html.spec.whatwg.org/multipage/syntax.html#character-references */
      .replace(/&(?!(?:[a-z0-9]+;?|#(?:[0-9]+|x[0-9a-f]+);))/gi, '&amp;')
      .replace(/"/g, '&#34;')
  ); // "
}
Object.assign(exports, { escapeAttrValue });

function wrapAttrValue(value) {
  const hasQuot = value.includes(`"`);
  const hasApos = value.includes(`'`);
  if (!hasQuot) return `"${value}"`;
  if (!hasApos) return `'${value}'`;
  return `"${escapeAttrValue(value)}"`;
}
Object.assign(exports, { wrapAttrValue });

function attrs2htmlText(attrs) {
  return (Array.isArray(attrs) ? attrs : Object.entries(attrs))
    .map(
      ([name, value]) =>
        ` ${name}${value !== '' ? `=${wrapAttrValue(value)}` : ''}`,
    )
    .join('');
}
Object.assign(exports, { attrs2htmlText });
