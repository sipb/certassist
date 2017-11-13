# CertAssist

CertAssist is a JavaScript interface to ca.mit.edu and
ca.csail.mit.edu that lets you securely download and install your MIT
or CSAIL personal certificate, even if ca.mit.edu and ca.csail.mit.edu
do not support your browser. You can use it at
https://certassist.mit.edu/.

The instructions below are for developers who want to make changes to
CertAssist.

## Building

CertAssist builds with [webpack](https://webpack.js.org/), and
therefore requires [Node.js](https://nodejs.org/).

    npm install
    npm run build

The build process outputs `index.html` and its dependencies to the
`dist` directory.

## Serving

The `dist` directory may be served to the web directly as static
content. On the same hostname, the `/ws/mit` and `/ws/csail` URLs must
point to WebSocket proxies connected to ca.mit.edu port 443 and
ca.csail.mit.edu port 1443, respectively. You can set up a quick
development server using
[websockify](https://github.com/novnc/websockify) (note that you can
only easily use one of these on a given local port):

    websockify --web=dist localhost:8000 ca.mit.edu:443
    websockify --web=dist localhost:8000 ca.csail.mit.edu:1443

The production server previously ran on Apache, using
mod_proxy_wstunnel to route `/ws` to a websockify daemon. Before
Apache 2.4.10, `ProxyPass` needs the `disablereuse=On` option ([bug
55890](https://bz.apache.org/bugzilla/show_bug.cgi?id=55890)). It now
runs on nginx, which seems to have fewer such bugs.
