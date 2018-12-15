const GitRevisionPlugin = require('git-revision-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');
const webpack = require('webpack');

const gitRevisionPlugin = new GitRevisionPlugin({
    versionCommand: 'describe --always --dirty',
});

module.exports = {
    entry: './main.js',
    output: {
        filename: '[name].[chunkhash].bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].[contenthash].css',
            chunkFilename: '[id].[contenthash].css',
        }),
        new HtmlWebpackPlugin({
            template: 'index.ejs'
        }),
        new webpack.DefinePlugin({
            'VERSION': JSON.stringify(gitRevisionPlugin.version()),
            'COMMITHASH': JSON.stringify(gitRevisionPlugin.commithash()),
        }),
    ],
    module: {
        rules: [{
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader'
        }, {
            test: /\.css$/,
            use: [
                MiniCssExtractPlugin.loader,
                {
                    loader: 'css-loader',
                    options: {
                        sourceMap: true,
                    },
                },
            ],
        }, {
            test: /\.(?:eot|ico|png|svg|ttf|woff|woff2)$/,
            loader: 'file-loader',
            options: {
                'name': '[name].[hash].[ext]',
            },
        }]
    },
    node: false,
    devtool: 'source-map',
};
