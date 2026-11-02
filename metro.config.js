const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ignore native build temporary directories (.cxx, build folders) to prevent Metro watcher crashes during Gradle builds
const blockListPatterns = [
  /.*\/android\/\.cxx\/.*/,
  /.*\/node_modules\/.*\/android\/\.cxx\/.*/,
  /.*\/android\/app\/build\/.*/,
  /.*\/ios\/build\/.*/,
];

if (config.resolver.blockList) {
  if (Array.isArray(config.resolver.blockList)) {
    config.resolver.blockList.push(...blockListPatterns);
  } else {
    config.resolver.blockList = [config.resolver.blockList, ...blockListPatterns];
  }
} else {
  config.resolver.blockList = blockListPatterns;
}

module.exports = config;
