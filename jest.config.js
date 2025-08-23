// jest.config.js
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
};
