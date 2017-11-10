import forge from 'node-forge';
import 'node-forge/lib/http';

async function wsHttpsFetch(wsUrl, request, caStore) {
    const ws = new WebSocket(wsUrl, 'base64');
    let done = false;
    const buffer = forge.util.createBuffer();
    const response = forge.http.createResponse();
    return new Promise((resolve, reject) => {
        const tls = forge.tls.createConnection({
            server: false,
            caStore: caStore,
            virtualHost: request.getField('Host'),
            verify: (connection, verified, depth, certs) => {
                if (depth === 0) {
                    if (certs[0].subject.getField('CN').value !== request.getField('Host')) {
                        verified = {
                            alert: forge.tls.Alert.Description.bad_certificate,
                            message: 'Certificate common name does not match expected server.',
                        };
                    }
                }
                return verified;
            },
            connected: connection => connection.prepare(request.toString() + request.body),
            tlsDataReady: connection => ws.send(btoa(connection.tlsData.getBytes())),
            dataReady: connection => {
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
                    console.log('Connection closed unexpectedly');
                    reject(new Error('Connection closed unexpectedly'));
                }
            },
            error: (connection, error) => {
                console.log('TLS error: ', error);
                if (!done) {
                    done = true;
                    reject(new Error('TLS error: ' + error.message));
                }
            },
        });
        ws.addEventListener('open', event => tls.handshake());
        ws.addEventListener('message', event => tls.process(atob(event.data)));
        ws.addEventListener('error', event => {
            console.log('WebSocket error:', event);
            if (!done) {
                done = true;
                reject(new Error('WebSocket error'));
            }
        });
    });
}

export default wsHttpsFetch;