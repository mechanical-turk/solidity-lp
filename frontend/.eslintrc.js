module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  settings: {
    node: {
      tryExtensions: [".js", ".json", ".node", ".ts", ".d.ts", ".tsx"],
    },
  },
  plugins: ["@typescript-eslint", "no-only-tests"],
  extends: [
    // "plugin:prettier/recommended",
    // "plugin:node/recommended",
    "plugin:react/recommended",
  ],
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {},
};
