import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';
import uglify from 'rollup-plugin-uglify'

export default {
  entry: 'src/index.js',
  dest: 'dist/app.js',
  format: 'iife',
  sourceMap: 'inline',
  plugins: [
    nodeResolve({
      jsnext: true,
      main: true
    }),
    commonjs({
     // non-CommonJS modules will be ignored, but you can also
     // specifically include/exclude files
     include: 'node_modules/**',  // Default: undefined
     // if true then uses of `global` won't be dealt with by this plugin
     ignoreGlobal: false,  // Default: false
     // if false then skip sourceMap generation for CommonJS modules
     sourceMap: false,  // Default: true
   }),
    babel({
      exclude: 'node_modules/**',
    }),
    // uglify(),
  ]
};
