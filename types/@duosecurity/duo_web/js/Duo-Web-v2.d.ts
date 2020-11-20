/* eslint-disable unicorn/filename-case */

export function init(options: {
  iframe: string | HTMLIFrameElement;
  host: string;
  sig_request: string;
  post_action?: string;
  post_argument?: string;
  submit_callback?: (form: HTMLFormElement) => void;
}): void;
