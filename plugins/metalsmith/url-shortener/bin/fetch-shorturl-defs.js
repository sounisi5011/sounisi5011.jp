#!/usr/bin/env node

const fetch = require('node-fetch');

const { decryptFromFileData } = require('../encrypt');
const { initOptions } = require('../options');

async function main(args) {
  process.exitCode = 1;

  const { options, encryptKey } = initOptions({
    rootURL: args[0] || process.env.URL,
  });

  const url = new URL(options.rootURL);
  url.pathname = url.pathname.replace(/\/([^/]*)$/, (url, basename) =>
    basename === options.urlListFilename
      ? url
      : url.replace(/\/*$/, `/${options.urlListFilename}`),
  );

  console.error('fetching %s', url.href);
  const res = await fetch(url.href);
  if (!res.ok) {
    console.error(`${res.status} ${res.statusText}`);
    return;
  }

  const defsFileData = await decryptFromFileData(
    encryptKey,
    await res.buffer(),
  );
  const defsFileText = defsFileData.toString();

  console.log(defsFileText);
  process.exitCode = 0;
}

main(process.argv.slice(2));
