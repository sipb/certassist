import GitRevisionPlugin from "git-revision-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import webpack from "webpack";

const gitRevisionPlugin = new GitRevisionPlugin({
  versionCommand: "describe --always --dirty",
});

const config: webpack.Configuration = {
  output: {
    filename: "[name].[contenthash].bundle.js",
    assetModuleFilename: "[name].[hash][ext][query]",
    publicPath: "",
  },
  resolve: {
    fallback: {
      fs: false,
      https: false,
      path: false,
    },
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
        type: "asset/resource",
      },
    ],
  },
  devtool: "source-map",
};

export default config;
