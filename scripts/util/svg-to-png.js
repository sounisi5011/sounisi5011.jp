const { convert, convertFile } = require('convert-svg-to-png');
const getPort = require('get-port');
const path = require('path');
const StaticServer = require('static-server');

async function startServer(filepath) {
  const rootDir = path.parse(process.cwd()).root;
  const relativeFilepath = path.relative(rootDir, filepath);
  const urlPath = relativeFilepath.replace(/\\/g, '/');

  const server = new StaticServer({
    rootPath: rootDir,
    port: await getPort(),
  });

  return {
    server,
    baseUrl: `http://localhost:${server.port}/${urlPath}`,
  };
}

exports.convert = async (data, options) => {
  if (typeof options.baseFile === 'string') {
    const { server, baseUrl } = await startServer(options.baseFile);

    const result = convert(data, {
      ...options,
      baseUrl: baseUrl,
      baseFile: null,
    });

    server.stop();

    return result;
  } else {
    return convert(data, options);
  }
};

exports.convertFile = async (filepath, outputFilepath, options) => {
  const { server, baseUrl } = await startServer(filepath);

  const result = convertFile(filepath, {
    ...options,
    baseUrl: baseUrl,
    outputFilePath: outputFilepath,
  });

  server.stop();

  return result;
};
