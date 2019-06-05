#!/usr/bin/env node

// https://www.netlify.com/docs/continuous-deployment/#environment-variables
const ciEnvKeys = [
  'REPOSITORY_URL',
  'BRANCH',
  'PULL_REQUEST',
  'HEAD',
  'COMMIT_REF',
  'CONTEXT',
  'REVIEW_ID',
  'INCOMING_HOOK_TITLE',
  'INCOMING_HOOK_URL',
  'INCOMING_HOOK_BODY',
  'URL',
  'DEPLOY_URL',
  'DEPLOY_PRIME_URL',
];

ciEnvKeys.forEach(key => {
  if (key in process.env) {
    console.log(`${key}=${process.env[key]}\n;;;`);
  }
});
