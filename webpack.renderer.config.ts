import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const rendererConfig: Configuration = {
  devtool: 'source-map',
  output: { publicPath: '../' },
  module: {
    rules: [...rules, { test: /\.css$/, type: 'asset/resource', generator: { filename: 'main_window/index.css' } }],
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
