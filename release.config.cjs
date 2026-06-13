module.exports = {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'bash scripts/build-release.sh ${nextRelease.version}',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'dist/*.tar.gz', label: 'tf9 binary archive' },
          { path: 'dist/*.zip', label: 'tf9 binary archive' },
          { path: 'dist/checksums.txt', label: 'SHA-256 checksums' },
        ],
        successComment: false,
        failComment: false,
      },
    ],
  ],
};
