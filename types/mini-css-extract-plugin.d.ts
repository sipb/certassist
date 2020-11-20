import { Chunk, Compiler } from "webpack";

declare namespace MiniCssExtractPlugin {
  interface PluginOptions {
    filename?: string | ((chunkData: { chunk: Chunk }) => string);
    chunkFilename?: string;
    ignoreOrder?: boolean;
    esModule?: boolean;
  }
}

declare class MiniCssExtractPlugin {
  static loader: string;
  constructor(options?: MiniCssExtractPlugin.PluginOptions);
  apply(compiler: Compiler): void;
}

export = MiniCssExtractPlugin;
