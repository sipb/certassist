# CertAssist

CertAssist is a JavaScript interface to ca.mit.edu that lets you securely
download and install your MIT personal certificate, even if ca.mit.edu
does not support your browser. You can use it at https://certassist.mit.edu/.

The instructions below are for developers who want to make changes to CertAssist.

## Building

CertAssist builds with [webpack](https://webpack.js.org/), and therefore requires [Node.js](https://nodejs.org/).

    npm install
    npm run build

The build process outputs `index.html` and its dependencies to the `dist` directory.

## Serving

The `dist` directory may be served to the web directly as static content; on the same hostname, the `/ws` URL must point to a WebSocket proxy connected to ca.mit.edu port 443. You can set up a quick development server this way using [websockify](https://github.com/novnc/websockify):

    websockify --web=dist localhost:8000 ca.mit.edu:443

The production server currently runs on Apache, using mod_proxy_wstunnel to route `/ws` to a websockify daemon. Before Apache 2.4.10, `ProxyPass` needs the `disablereuse=On` option ([bug 55890](https://bz.apache.org/bugzilla/show_bug.cgi?id=55890)).
