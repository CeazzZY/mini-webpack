const path = require("path");

module.exports = {
  context: process.cwd(),
  mode: "development",
  devtool: false,
  entry: {
    page1: "./src/page1.js",
    page2: "./src/page2.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "main.js",
  },
  resolveLoader: {
    modules: ["loaders", "node_modules"],
  },
  module: {
    rules: [
      {
        test: /\.less$/,
        use: ["style-loader", "less-loader"],
      },
    ],
  },
};
