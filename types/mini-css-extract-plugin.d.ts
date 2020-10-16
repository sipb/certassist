declare module "mini-css-extract-plugin" {
  import { Chunk, Compiler } from "webpack";

  namespace MiniCssExtractPlugin {
    interface PluginOptions {
      filename?: string | ((chunkData: { chunk: Chunk }) => string);
      chunkFilename?: string;
      ignoreOrder?: boolean;
      esModule?: boolean;
    }
  }

  class MiniCssExtractPlugin {
    static loader: string;
    constructor(options?: MiniCssExtractPlugin.PluginOptions);
    apply(compiler: Compiler): void;
  }

  export = MiniCssExtractPlugin;
}
