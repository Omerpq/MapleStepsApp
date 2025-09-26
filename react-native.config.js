// react-native.config.js (root)
module.exports = {
  dependencies: {
    'react-native-iap': {
      platforms: { android: null },      // ⟵ disable Android native linking
    },
    'react-native-purchases': {
      platforms: { android: null },      // ⟵ disable RC Android native linking
    },
  },
};
