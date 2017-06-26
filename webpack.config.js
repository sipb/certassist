module.exports = {
    entry: './certassist.js',
    output: {
        filename: 'web/certassist.bundle.js'
    },
    module: {
        loaders: [{
            test: /\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader'
        }]
    }
};
