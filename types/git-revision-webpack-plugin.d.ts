import { Compiler } from "webpack";

declare namespace GitRevisionPlugin {
  interface Options {
    lightweightTags?: boolean;
    branch?: boolean;
    commithashCommand?: string;
    versionCommand?: string;
    branchCommand?: string;
  }
}

declare class GitRevisionPlugin {
  constructor(options?: GitRevisionPlugin.Options);
  apply(compiler: Compiler): void;
  commithash(): string;
  version(): string;
  branch(): string;
}

export = GitRevisionPlugin;
