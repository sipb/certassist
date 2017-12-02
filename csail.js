'use strict';

import forge, {asn1} from 'node-forge';
import 'node-forge/lib/http';

import wsHttpsFetch from './wsHttpsFetch.js';
import saveBlob from './saveBlob.js';
import caStore from './addTrustStore.js';

const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/csail`;

async function downloadCert(options) {
    options.onStatus('Authenticating');
    const authorization = 'Basic ' + btoa(options.login + ':' + options.password);
    const formResponse = await wsHttpsFetch(
        wsUrl,
        forge.http.createRequest({
            method: 'GET',
            path: '/request?ca=client;type=spkac',
            headers: {
                'Host': 'ca.csail.mit.edu:1443',
                'Authorization': authorization,
                'Connection': 'close',
            },
        }),
        caStore);
    if (formResponse.code !== 200) {
        console.log('Server error:', formResponse.code, formResponse.message);
        throw new Error('Server error: ' + formResponse.code + ' ' + formResponse.message);
    }

    const doc = new DOMParser().parseFromString(formResponse.body, formResponse.fields['Content-Type'][0]);
    const [keygen] = doc.getElementsByName('spkac');
    const keytype = keygen.getAttribute('keytype');
    if (keytype !== 'rsa')
        throw new Error('Unrecognized keytype ' + keytype);
    const challenge = keygen.getAttribute('challenge');

    options.onStatus('Generating key pair');
    const keyPair = await new Promise((resolve, reject) =>
        forge.pki.rsa.generateKeyPair({bits: 2048}, (err, keyPair) =>
            err ? reject(err) : resolve(keyPair)));

    const pkac = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        forge.pki.publicKeyToAsn1(keyPair.publicKey),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.IA5STRING, false, challenge),
    ]);
    const md = forge.md.md5.create();
    md.update(asn1.toDer(pkac).getBytes());
    const signature = keyPair.privateKey.sign(md);
    const spkac = forge.util.encode64(asn1.toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        pkac,
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
            asn1.create(
                asn1.Class.UNIVERSAL, asn1.Type.OID, false,
                asn1.oidToDer(forge.pki.oids['md5WithRSAEncryption']).getBytes()),
            asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
        ]),
        asn1.create(
            asn1.Class.UNIVERSAL, asn1.Type.BITSTRING, false,
            String.fromCharCode(0x00) + signature),
    ])).getBytes());

    options.onStatus('Downloading certificate');
    const spkacResponse = await wsHttpsFetch(
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/csail`,
        forge.http.createRequest({
            method: 'POST',
            path: '/request',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Host': 'ca.csail.mit.edu:1443',
                'Authorization': authorization,
                'Connection': 'close',
            },
            body: [
                ['ca', 'client'],
                ['type', 'spkac'],
                ['spkac', spkac],
                ['Submit', 'Submit'],
            ].map(p => p.map(x => encodeURIComponent(x)).join('=')).join('&')
        }),
        caStore);
    if (spkacResponse.code !== 200) {
        console.log('Server error:', spkacResponse.code, spkacResponse.message);
        throw new Error('Server error: ' + spkacResponse.code + ' ' + spkacResponse.message);
    }

    const a1 = asn1.fromDer(spkacResponse.body);
    let p7;
    try {
        p7 = forge.pkcs7.messageFromAsn1(a1);
    } catch (e) {
        if (e.message === 'Unsupported PKCS#7 message. Only wrapped ContentType Data supported.') {
            const contentType = a1.value[1].value[0].value[2].value[0];
            if (contentType.value === asn1.oidToDer('0.0').getBytes()) {
                options.onStatus('Fixing CSAIL invalid ContentType');
                contentType.value = asn1.oidToDer(forge.oids.data).getBytes();
                p7 = forge.pkcs7.messageFromAsn1(a1);
            } else {
                throw e;
            }
        } else {
            throw e;
        }
    }

    const p12 = forge.pkcs12.toPkcs12Asn1(keyPair.privateKey, p7.certificates, options.downloadpassword, {
        algorithm: '3des',
        friendlyName: `${options.login}'s CSAIL Certificate`,
    });
    return forge.util.binary.raw.decode(asn1.toDer(p12).getBytes());
}

let working = false;
const submitElement = document.getElementById('csail-submit');
const loginElement = document.getElementById('csail-login');
const passwordElement = document.getElementById('csail-password');
const downloadPasswordElement = document.getElementById('csail-downloadpassword');
const statusElement = document.getElementById('csail-status');

function invalid() {
    return working || !loginElement.value ||
        !passwordElement.value ||
        !downloadPasswordElement.value;
}

function validate(event) {
    submitElement.disabled = invalid();
}

async function submit(event) {
    event.preventDefault();
    if (invalid()) return;
    working = true;
    submitElement.disabled = true;
    loginElement.disabled = true;
    passwordElement.disabled = true;
    downloadPasswordElement.disabled = true;
    statusElement.textContent = '';

    const login = loginElement.value;
    try {
        const cert = await downloadCert({
            login: login,
            password: passwordElement.value,
            downloadpassword: downloadPasswordElement.value,
            onStatus: status => {
                statusElement.textContent += status + '\n'
            },
        });
        statusElement.textContent += 'Certificate ready\n';
        saveBlob(new Blob([cert], {
            type: 'application/x-pkcs12'
        }), login + '-csail-cert.p12');
    } catch (error) {
        statusElement.textContent += error + '\n';
        throw error;
    } finally {
        working = false;
        loginElement.disabled = false;
        passwordElement.disabled = false;
        downloadPasswordElement.disabled = false;
        validate();
    }
}

loginElement.addEventListener('change', validate);
loginElement.addEventListener('input', validate);
passwordElement.addEventListener('change', validate);
passwordElement.addEventListener('input', validate);
downloadPasswordElement.addEventListener('change', validate);
downloadPasswordElement.addEventListener('input', validate);
document.getElementById('csail-form').addEventListener('submit', submit);
