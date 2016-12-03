const path = require('path');

const webpack = require('webpack');
const HTMLPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const ENV = process.env.NODE_ENV || 'development';

// -------------------------------------------------------------------

const plugins = [];

plugins.push(new webpack.DefinePlugin({
  'process.env.NODE_ENV': JSON.stringify(ENV),
  'process.env.IS_PRODUCTION': JSON.stringify(ENV === 'production'),
}));

plugins.push(new HTMLPlugin({
  title: 'Miit',
  filename: 'index.html',
  template: './src/index.html',
}));

plugins.push(new CopyPlugin([
  { from: './src/static', to: './static' },
]))

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
