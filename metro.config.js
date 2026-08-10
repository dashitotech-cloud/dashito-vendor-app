const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the shared package source so Metro can bundle it
config.watchFolders = [workspaceRoot];

// Resolve from the app first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Force singleton modules to resolve from the app's node_modules to prevent
// duplicate React/RN instances when workspace-root packages pull in their own copy.
const SINGLETON_MODULES = new Set(['react', 'react-native', 'react-native-safe-area-context']);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETON_MODULES.has(moduleName)) {
    return {
      filePath: require.resolve(moduleName, { paths: [projectRoot] }),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
