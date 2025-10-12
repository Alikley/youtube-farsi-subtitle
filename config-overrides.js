const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");

module.exports = function override(config, env) {
  config.output.publicPath = "./";

  if (env === "production") {
    config.plugins.push(
      new CopyWebpackPlugin({
        patterns: [
          { from: "public/manifest.json", to: "manifest.json" },
          { from: "public/icons", to: "icons" },
          { from: "public/content", to: "content" },
          { from: "public/background", to: "background" },
        ],
      })
    );
  }

  return config;
};
