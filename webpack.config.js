const ExtractTextPlugin = require('extract-text-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = {
    entry: './main.js',
    output: {
        filename: '[name].[chunkhash].bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.ejs'
        }),
        new ExtractTextPlugin('[name].[contenthash].css')
    ],
    module: {
        rules: [{
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader'
        }, {
            test: /\.css$/,
            use: ExtractTextPlugin.extract({
                use: {
                    loader: 'css-loader',
                    options: {
                        sourceMap: true,
                    },
                },
            }),
        }, {
            test: /\.(?:eot|ico|png|svg|ttf|woff|woff2)$/,
            loader: 'file-loader',
            options: {
                'name': '[name].[hash].[ext]',
            },
        }]
    },
    devtool: 'source-map',
};
