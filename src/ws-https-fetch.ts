import forge from "node-forge";
import http from "node-forge/lib/http";

const sessionCaches = new Map();

async function wsHttpsFetch(
  wsUrl: string,
  request: http.Request,
  caStore: forge.pki.CAStore
): Promise<http.Response> {
  const ws = new WebSocket(wsUrl, ["binary", "base64"]);
  ws.binaryType = "arraybuffer";
  let sessionCache = sessionCaches.get(wsUrl);
  if (sessionCache === undefined) {
    sessionCache = forge.tls.createSessionCache({}, 1);
    sessionCaches.set(wsUrl, sessionCache);
  }

  let done = false;
  const buffer = forge.util.createBuffer();
  const response = http.createResponse();
  return new Promise((resolve, reject) => {
    const [, hostname] = /^([^:]*)(?::\d+)?$/.exec(request.getField("Host")!)!;
    const tls = forge.tls.createConnection({
      server: false,
      caStore,
      sessionCache,
      virtualHost: hostname,
      verify: (_connection, verified, depth, certs) => {
        if (depth === 0) {
          const cn: string = certs[0].subject.getField("CN").value;
          if (cn !== hostname) {
            verified = {
              alert: forge.tls.Alert.Description.bad_certificate,
              message: `Certificate common name ${cn} does not match expected server ${hostname}.`,
            };
          }
        }

        return verified;
      },
      connected: (connection) =>
        connection.prepare(request.toString() + request.body!),
      tlsDataReady: (connection) => {
        const bytes = connection.tlsData.getBytes();
        // Avoid empty messages, which some websockify
        // versions misinterpret as closing the connection
        // (https://github.com/novnc/websockify/issues/312).
        if (bytes.length > 0) {
          try {
            if (ws.protocol === "base64") ws.send(btoa(bytes));
            else ws.send(forge.util.binary.raw.decode(bytes));
          } catch (error: unknown) {
            if (done)
              // Firefox on Android seems to enjoy
              // throwing NS_ERROR_NOT_CONNECTED here.
              console.log(error);
            else throw error;
          }
        }
      },
      dataReady: (connection) => {
        buffer.putBytes(connection.data.getBytes());
        if (!done && !response.bodyReceived) {
          if (!response.headerReceived) {
            response.readHeader(buffer);
          }

          if (response.headerReceived && !response.bodyReceived) {
            if (response.readBody(buffer)) {
              done = true;
              connection.close();
              resolve(response);
            }
          }
        }
      },
      closed: () => {
        ws.close();
        if (!done) {
          done = true;
          console.log("Connection closed unexpectedly");
          reject(new Error("Connection closed unexpectedly"));
        }
      },
      error: (_connection, error) => {
        console.log("TLS error:", error);
        if (!done) {
          done = true;
          reject(new Error("TLS error: " + error.message));
        }
      },
    });
    ws.addEventListener("open", () => {
      console.log("Opened", ws.protocol, "WebSocket");
      tls.handshake();
    });
    ws.addEventListener("close", () => {
      console.log("Closed WebSocket");
      tls.close();
    });
    ws.addEventListener("message", (event) => {
      if (ws.protocol === "base64") tls.process(atob(event.data));
      else
        tls.process(forge.util.binary.raw.encode(new Uint8Array(event.data)));
    });
    ws.addEventListener("error", (event) => {
      console.log("WebSocket error:", event);
      if (!done) {
        done = true;
        reject(new Error("WebSocket error"));
      }
    });
  });
}

export default wsHttpsFetch;
