const DEPLOY_URL_REGEXP = /^https?:\/\/[0-9a-fA-F]+--([0-9a-zA-Z-]+\.netlify\.(?:app|com))(?=\/|$)/;
const DOMAIN_REGEXP = /^https?:\/\/([0-9a-zA-Z.-]+)/;

module.exports = () => {
  return (files, metalsmith, done) => {
    const env = process.env;
    const metadata = metalsmith.metadata();

    const deployUrlMatch = DEPLOY_URL_REGEXP.exec(env.DEPLOY_URL);
    if (deployUrlMatch) {
      metadata.netlifyDefaultSubdomain = deployUrlMatch[1];
    }

    const domainMatch = DOMAIN_REGEXP.exec(env.URL);
    if (domainMatch) {
      metadata.netlifyPrimaryDomain = domainMatch[1];
    }

    done();
  };
};
