/**
 * @param {string} str
 * @returns {{ frontMatter:string, content:string }}
 */
export function parse(str) {
  const startMatch = /^---(?:(?![\r\n])\s)*(?=[\r\n])/.exec(str);
  const endMatch = /[\r\n]---(?:(?![\r\n])\s)*(?:[\r\n]|$)/.exec(str);

  if (!startMatch || !endMatch) {
    return { frontMatter: '', content: str };
  }

  const frontMatterEndIndex = endMatch.index + endMatch[0].length;
  return {
    frontMatter: str.substring(0, frontMatterEndIndex),
    content: str.substring(frontMatterEndIndex),
  };
}
