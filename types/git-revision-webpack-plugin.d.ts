declare module "git-revision-webpack-plugin" {
  import { Compiler } from "webpack";

  namespace GitRevisionPlugin {
    interface Options {
      lightweightTags?: boolean;
      branch?: boolean;
      commithashCommand?: string;
      versionCommand?: string;
      branchCommand?: string;
    }
  }

  class GitRevisionPlugin {
    constructor(options?: GitRevisionPlugin.Options);
    apply(compiler: Compiler): void;
    commithash(): string;
    version(): string;
    branch(): string;
  }

  export = GitRevisionPlugin;
}
