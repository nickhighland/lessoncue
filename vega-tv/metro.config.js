const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

 /**
+ * Metro configuration
+ * https://facebook.github.io/metro/docs/configuration
  *
+ * @type {import('metro-config').MetroConfig}
  */
const defaultConfig = getDefaultConfig(__dirname);
const config = {
  resolver: {
    // The offline Fire TV review player is a local HTML asset with a bundled
    // MP4 next to it. Metro must copy both files into the package assets.
    assetExts: [...defaultConfig.resolver.assetExts, 'html', 'mp4'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
