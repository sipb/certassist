/* eslint-disable unicorn/filename-case */

declare module "@duosecurity/duo_web/js/Duo-Web-v2" {
  function init(options: {
    iframe: string | HTMLIFrameElement;
    host: string;
    sig_request: string;
    post_action?: string;
    post_argument?: string;
    submit_callback?(form: HTMLFormElement): void;
  }): void;
}
