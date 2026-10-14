import type { Configuration } from 'webpack';
import { IgnorePlugin } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.ts',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  // ws's Node implementations avoid unnecessary native addons in both Mac architectures.
  plugins: [...plugins, new IgnorePlugin({ resourceRegExp: /^(bufferutil|utf-8-validate)$/, contextRegExp: /node_modules[\\/]ws[\\/]lib/ })],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
};
