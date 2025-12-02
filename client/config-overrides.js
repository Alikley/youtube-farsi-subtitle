import CopyWebpackPlugin from "copy-webpack-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function override(config, env) {
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
}
