import GitRevisionPlugin from "git-revision-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import path from "path";
import webpack from "webpack";

const gitRevisionPlugin = new GitRevisionPlugin({
  versionCommand: "describe --always --dirty",
});

const config: webpack.Configuration = {
  entry: "./src/main",
  output: {
    filename: "[name].[chunkhash].bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].[contenthash].css",
      chunkFilename: "[id].[contenthash].css",
    }),
    new HtmlWebpackPlugin({
      template: "src/index.ejs",
    }),
    new webpack.DefinePlugin({
      VERSION: JSON.stringify(gitRevisionPlugin.version()),
      COMMITHASH: JSON.stringify(gitRevisionPlugin.commithash()),
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(js|ts)$/,
        exclude: /node_modules/,
        loader: "babel-loader",
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: /\.(?:eot|ico|png|svg|ttf|woff|woff2)$/,
        loader: "file-loader",
        options: {
          name: "[name].[hash].[ext]",
        },
      },
    ],
  },
  node: {
    fs: "empty",
  },
  devtool: "source-map",
};

export default config;
