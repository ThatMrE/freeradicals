const path = require('node:path');

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * The gate itself lives in core/ at the repository root, shared byte-for-byte
 * with the browser extension, and the React Native adapters live in
 * mobile/bridge. Both are outside this app directory, so Metro has to be told
 * to watch the repository root and to resolve modules from it — without this,
 * `import … from '../../core/index.js'` fails at bundle time.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const repoRoot = path.resolve(__dirname, '..', '..');

const config = {
  projectRoot: __dirname,
  watchFolders: [repoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
