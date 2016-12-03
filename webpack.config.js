const path = require('path');

const webpack = require('webpack');

const SRC = path.join(__dirname, 'src');
const DIST = path.resolve(__dirname, 'dist');

const ENV = process.env.NODE_ENV || 'development';

// -------------------------------------------------------------------

const plugins = [];

plugins.push(new webpack.DefinePlugin({
  'process.env.NODE_ENV': JSON.stringify(ENV),
  'process.env.IS_PRODUCTION': JSON.stringify(ENV === 'production'),
}));

plugins.push(new webpack.NoErrorsPlugin());

const loaders = [{
  test: /\.(js|jsx)$/,
  exclude: /node_modules/,
  loader: 'babel-loader'
}, {
  test: /\.json?$/,
  loader: 'json-loader'
}];

// -------------------------------------------------------------------
// FULL CONFIG
// -------------------------------------------------------------------

module.exports = {
  cache: true,
  devtool: 'source-map',

  entry: './src/index.js',
  output: {
    path: './dist',
    filename: 'app.js',
    publicPath: '/'
  },

  plugins: plugins,

  resolve: {
    extensions: ['*', '.js', '.jsx', '.json', '.css', '.scss'],
    alias: {
      'react': 'preact-compat',
      'react-dom': 'preact-compat'
    }
  },

  module: {
    loaders: loaders,
  }
}

// -------------------------------------------------------------------
