'use strict';

import forge from 'node-forge';
import 'node-forge/lib/http';
import xml2js from 'xml2js';

import wsHttpsFetch from './wsHttpsFetch.js';
import saveBlob from './saveBlob.js';
import caStore from './addTrustStore.js';

function xmlParse(...args) {
    return new Promise((resolve, reject) => {
        xml2js.parseString(...args, (err, result) => {
            if (err)
                reject(err);
            else
                resolve(result);
        });
    });
}

async function apiCall(cmd) {
    const response = await wsHttpsFetch(
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/mit`,
        forge.http.createRequest({
            method: 'POST',
            path: '/ca/api',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Host': 'ca.mit.edu',
                'Connection': 'close'
            },
            body: Object.keys(cmd).map(key => [key, cmd[key]].map(x => encodeURIComponent(x)).join('=')).join('&')
        }),
        caStore);
    if (response.code != 200) {
        console.log('Server error:', response.code, response.message);
        throw new Error('Server error: ' + response.code + ' ' + response.message);
    }
    return xmlParse(response.body);
}

async function downloadCert(options) {
    options.onStatus('Opening session');
    const startupReply = await apiCall({
        operation: 'startup',
        sessiontype: 'xml',
        version: 2,
        os: window.navigator.oscpu,
        browser: window.navigator.userAgent,
    });
    if (startupReply.error) {
        console.log('Session error:', startupReply);
        throw new Error('Session error: ' + startupReply.error.text[0]);
    }
    const sessionid = startupReply.startupresponse.sessionid;

    try {
        options.onStatus('Authenticating');
        const authenticateReply = await apiCall({
            operation: 'authenticate',
            sessionid: sessionid,
            login: options.login,
            password: options.password,
            mitid: options.mitid,
        });
        if (authenticateReply.error) {
            console.log('Authentication error:', authenticateReply);
            throw new Error('Authentication error: ' + authenticateReply.error.text[0]);
        }

        options.onStatus('Downloading certificate');
        const downloadReply = await apiCall({
            operation: 'downloadcert',
            sessionid: sessionid,
            downloadpassword: options.downloadpassword,
            expiration: options.expiration,
            force: options.force,
            alwaysreuse: options.alwaysreuse,
        });
        if (downloadReply.error) {
            console.log('Certificate error:', downloadReply);
            throw new Error('Certificate error: ' + downloadReply.error.text[0]);
        }

        return new Buffer(downloadReply.downloadcertresponse.pkcs12[0], 'base64');
    } finally {
        options.onStatus('Closing session');
        await apiCall({
            operation: 'finish',
            sessionid: sessionid,
        });
    }
}

let working = false;
const submitElement = document.getElementById('mit-submit');
const loginElement = document.getElementById('mit-login');
const passwordElement = document.getElementById('mit-password');
const mitIdElement = document.getElementById('mit-id');
const downloadPasswordElement = document.getElementById('mit-downloadpassword');
const statusElement = document.getElementById('mit-status');

function invalid() {
    return working || !loginElement.value ||
        !passwordElement.value ||
        !mitIdElement.value.match(/^9\d{8}$/) ||
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
    mitIdElement.disabled = true;
    downloadPasswordElement.disabled = true;
    statusElement.textContent = '';

    const login = loginElement.value;
    try {
        const cert = await downloadCert({
            login: login,
            password: passwordElement.value,
            mitid: mitIdElement.value,
            downloadpassword: downloadPasswordElement.value,
            expiration: '2999-01-01T00:00:00',
            force: '0',
            alwaysreuse: '1',
            onStatus: status => {
                statusElement.textContent += status + '\n'
            },
        });
        statusElement.textContent += 'Certificate ready\n';
        saveBlob(new Blob([cert], {
            type: 'application/x-pkcs12'
        }), login + '-mit-cert.p12');
    } catch (error) {
        statusElement.textContent += error + '\n';
        throw error;
    } finally {
        working = false;
        loginElement.disabled = false;
        passwordElement.disabled = false;
        mitIdElement.disabled = false;
        downloadPasswordElement.disabled = false;
        validate();
    }
}

loginElement.addEventListener('change', validate);
loginElement.addEventListener('input', validate);
passwordElement.addEventListener('change', validate);
passwordElement.addEventListener('input', validate);
mitIdElement.addEventListener('change', validate);
mitIdElement.addEventListener('input', validate);
downloadPasswordElement.addEventListener('change', validate);
downloadPasswordElement.addEventListener('input', validate);
document.getElementById('mit-form').addEventListener('submit', submit);

loginElement.focus();
