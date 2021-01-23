"use strict";
module.exports = {
  files: [
    "@fortawesome/fontawesome-free/svgs/brands/android.svg",
    "@fortawesome/fontawesome-free/svgs/brands/apple.svg",
    "@fortawesome/fontawesome-free/svgs/brands/chrome.svg",
    "@fortawesome/fontawesome-free/svgs/brands/edge.svg",
    "@fortawesome/fontawesome-free/svgs/brands/firefox.svg",
    "@fortawesome/fontawesome-free/svgs/brands/github.svg",
    "@fortawesome/fontawesome-free/svgs/brands/linux.svg",
    "@fortawesome/fontawesome-free/svgs/brands/safari.svg",
    "@fortawesome/fontawesome-free/svgs/brands/windows.svg",
    "@fortawesome/fontawesome-free/svgs/solid/caret-down.svg",
    "@fortawesome/fontawesome-free/svgs/solid/caret-right.svg",
    "@fortawesome/fontawesome-free/svgs/solid/code-branch.svg",
    "@fortawesome/fontawesome-free/svgs/solid/download.svg",
  ].map((path) => require.resolve(path)),
  fontName: "certassist-icons",
  ligature: false,
};
