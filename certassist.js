'use strict';

import forge from 'node-forge';
import 'node-forge/lib/http';
import xml2js from 'xml2js';

import addTrustCrt from 'raw-loader!./AddTrust_External_Root.crt';

const caStore = forge.pki.createCaStore([addTrustCrt]);

function apiCall(cmd, onDone, onStatus) {
    var done = false;
    const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`, 'base64');
    const body = Object.entries(cmd).map(entry => entry.map(x => encodeURIComponent(x)).join('=')).join('&');
    const http = forge.http.createRequest({
        method: 'POST',
        path: '/ca/api',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Host': 'ca.mit.edu',
            'Connection': 'close'
        },
        body: body
    });
    const buffer = forge.util.createBuffer();
    const response = forge.http.createResponse();
    const tls = forge.tls.createConnection({
        server: false,
        caStore: caStore,
        virtualHost: 'ca.mit.edu',
        verify: (connection, verified, depth, certs) => {
            if (depth === 0) {
                if (certs[0].subject.getField('CN').value !== 'ca.mit.edu') {
                    verified = {
                        alert: forge.tls.Alert.Description.bad_certificate,
                        message: 'Certificate common name does not match expected server.'
                    }
                }
            }
            return verified;
        },
        connected: connection => tls.prepare(http.toString() + body),
        tlsDataReady: connection => ws.send(btoa(connection.tlsData.getBytes())),
        dataReady: connection => {
            buffer.putBytes(connection.data.getBytes());
            if (!response.bodyReceived) {
                if (!response.headerReceived) {
                    response.readHeader(buffer);
                }
                if (response.headerReceived && !response.bodyReceived) {
                    if (response.readBody(buffer)) {
                        done = true;
                        tls.close();
                        xml2js.parseString(response.body, (err, reply) => {
                            if (err) {
                                console.log(err);
                                onStatus('XML parsing error:\n' + err);
                            }
                            onDone(reply);
                        });
                    }
                }
            }
        },
        closed: () => {
            ws.close()
            if (!done) {
                done = true;
                onDone(null);
            }
        },
        error: (connection, error) => {
            console.log(error);
            onStatus('TLS error: ' + error.message);
        }
    });
    ws.addEventListener('open', event => tls.handshake());
    ws.addEventListener('message', event => tls.process(atob(event.data)));
    ws.addEventListener('error', event => {
        console.log(event);
        onStatus('WebSocket error')
    });
}

function finish(sessionid, onDone, onStatus) {
    onStatus('Closing session')
    apiCall({
        operation: 'finish',
        sessionid: sessionid
    }, onDone, onStatus);
}

function downloadCert(options, onDone, onStatus) {
    onStatus('Opening session')
    apiCall({
        operation: 'startup',
        sessiontype: 'xml',
        version: 2,
        os: navigator.oscpu,
        browser: navigator.userAgent,
    }, reply => {
        if (!reply)
            return onDone(null);
        if (reply.error) {
            console.log(reply);
            onStatus('Session error: ' + reply.error.text[0]);
            return onDone(null);
        }
        const sessionid = reply.startupresponse.sessionid;

        onStatus('Authenticating')
        apiCall({
            operation: 'authenticate',
            sessionid: sessionid,
            login: options.login,
            password: options.password,
            mitid: options.mitid,
        }, reply => {
            if (!reply) {
                finish(sessionid, () => {}, onStatus);
                return onDone(null);
            }
            if (reply.error) {
                console.log(reply);
                onStatus('Authentication error: ' + reply.error.text[0]);
                finish(sessionid, () => {}, onStatus);
                return onDone(null);
            }

            onStatus('Downloading certificate')
            apiCall({
                operation: 'downloadcert',
                sessionid: sessionid,
                downloadpassword: options.downloadpassword,
                expiration: options.expiration,
                force: options.force,
                alwaysreuse: options.alwaysreuse,
            }, reply => {
                if (!reply) {
                    finish(sessionid, () => {}, onStatus);
                    return onDone(null);
                }
                if (reply.error) {
                    console.log(reply);
                    onStatus('Certificate error: ' + reply.error.text[0]);
                    finish(sessionid, () => {}, onStatus);
                    return onDone(null);
                }

                finish(sessionid, () => {}, onStatus);
                onDone(new Buffer(reply.downloadcertresponse.pkcs12[0], 'base64'));
            }, onStatus);
        }, onStatus);
    }, onStatus);
}

let working = false;
const submitElement = document.getElementById('submit');
const loginElement = document.getElementById('login');
const passwordElement = document.getElementById('password');
const mitIdElement = document.getElementById('mitid');
const downloadPasswordElement = document.getElementById('downloadpassword');
const statusElement = document.getElementById('status');

function invalid() {
    return working || !loginElement.value ||
        !passwordElement.value ||
        !mitIdElement.value.match(/^9\d{8}$/) ||
        !downloadPasswordElement.value;
}

function validate(event) {
    submitElement.disabled = invalid();
}

function submit(event) {
    event.preventDefault();
    if (invalid()) return;
    working = true;
    submitElement.disabled = true;
    loginElement.disabled = true;
    passwordElement.disabled = true;
    mitIdElement.disabled = true;
    downloadPasswordElement.disabled = true;
    statusElement.textContent = '';

    const login = loginElement.value;
    downloadCert({
        login: login,
        password: passwordElement.value,
        mitid: mitIdElement.value,
        downloadpassword: downloadPasswordElement.value,
        expiration: '2999-01-01T00:00:00',
        force: '0',
        alwaysreuse: '1',
    }, cert => {
        if (cert) {
            statusElement.textContent += 'Certificate ready\n';
            const url = URL.createObjectURL(new Blob([cert], {
                type: 'application/x-pkcs12'
            }));
            const a = document.createElement('a');
            a.setAttribute('download', login + '-cert.p12');
            a.href = url;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        working = false;
        loginElement.disabled = false;
        passwordElement.disabled = false;
        mitIdElement.disabled = false;
        downloadPasswordElement.disabled = false;
        validate();
    }, error => {
        statusElement.textContent += error + '\n';
    });
}

loginElement.addEventListener('change', validate);
loginElement.addEventListener('input', validate);
passwordElement.addEventListener('change', validate);
passwordElement.addEventListener('input', validate);
mitIdElement.addEventListener('change', validate);
mitIdElement.addEventListener('input', validate);
downloadPasswordElement.addEventListener('change', validate);
downloadPasswordElement.addEventListener('input', validate);
document.getElementById('form').addEventListener('submit', submit);

loginElement.focus();
