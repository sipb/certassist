declare module "git-revision-webpack-plugin" {
  import { Plugin } from "webpack";
  class GitRevisionPlugin extends Plugin {
    public constructor(options?: {
      lightweightTags?: boolean;
      branch?: boolean;
      commithashCommand?: string;
      versionCommand?: string;
      branchCommand?: string;
    });
    public version(): string;
    public commithash(): string;
    public branch(): string;
  }
  export = GitRevisionPlugin;
}
