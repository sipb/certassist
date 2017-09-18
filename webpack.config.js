const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = {
    entry: './certassist.js',
    output: {
        filename: '[name].[chunkhash].bundle.js',
        path: path.resolve(__dirname, 'dist')
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.ejs'
        })
    ],
    module: {
        rules: [{
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader'
        }, {
            test: /\.css$/,
            use: [
                'file-loader?name=[name].[hash].[ext]',
                'extract-loader',
                'css-loader'
            ]
        }, {
            test: /\.png$/,
            loader: 'file-loader'
        }]
    }
};
