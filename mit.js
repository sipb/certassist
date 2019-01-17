"use strict";

import Duo from "@duosecurity/duo_web/js/Duo-Web-v2";
import forge, { asn1 } from "node-forge";
import "node-forge/lib/http";

import wsHttpsFetch from "./wsHttpsFetch.js";
import generateSpkac from "./generateSpkac.js";
import saveBlob from "./saveBlob.js";
import caStore from "./addTrustStore.js";

const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
  window.location.host
}/ws/mit`;

function xmlToObject(node) {
  if (node.children.length) {
    const obj = {};
    for (const child of node.children) obj[child.tagName] = xmlToObject(child);
    return obj;
  } else {
    return node.textContent;
  }
}

async function apiCall(cmd) {
  const response = await wsHttpsFetch(
    wsUrl,
    forge.http.createRequest({
      method: "POST",
      path: "/ca/api",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "ca.mit.edu",
        Connection: "close",
      },
      body: Object.keys(cmd)
        .map(key => [key, cmd[key]].map(x => encodeURIComponent(x)).join("="))
        .join("&"),
    }),
    caStore
  );
  if (response.code !== 200) {
    console.log("Server error:", response.code, response.message);
    throw new Error("Server error: " + response.code + " " + response.message);
  }
  return xmlToObject(
    new DOMParser().parseFromString(response.body, "text/xml")
  );
}

async function downloadCertServerKey(options) {
  options.onStatus("Opening session");
  const startupReply = await apiCall({
    operation: "startup",
    sessiontype: "xml",
    version: 2,
    os: "Windows NT 10.0.14393.0",
    browser: "Firefox 60.0",
  });
  if (startupReply.error) {
    console.log("Session error:", startupReply);
    throw new Error("Session error: " + startupReply.error.text);
  }
  const sessionid = startupReply.startupresponse.sessionid;

  try {
    options.onStatus("Authenticating");
    const authenticateReply = await apiCall({
      operation: "authenticate",
      sessionid: sessionid,
      login: options.login,
      password: options.password,
      mitid: options.mitid,
    });
    if (authenticateReply.error) {
      console.log("Authentication error:", authenticateReply);
      throw new Error("Authentication error: " + authenticateReply.error.text);
    }

    options.onStatus("Downloading certificate");
    const downloadReply = await apiCall({
      operation: "downloadcert",
      sessionid: sessionid,
      downloadpassword: options.downloadpassword,
      expiration: options.expiration,
      force: options.force,
      alwaysreuse: options.alwaysreuse,
    });
    if (downloadReply.error) {
      console.log("Certificate error:", downloadReply);
      throw new Error("Certificate error: " + downloadReply.error.text);
    }

    return forge.util.binary.base64.decode(
      downloadReply.downloadcertresponse.pkcs12
    );
  } finally {
    options.onStatus("Closing session");
    await apiCall({
      operation: "finish",
      sessionid: sessionid,
    });
  }
}

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:60.0) Gecko/20100101 Firefox/60.0";

function parseDuoDocument(doc) {
  const iframe = doc.getElementById("duo_iframe");
  if (iframe === null || iframe.previousElementSibling === null) return null;
  const m = iframe.previousElementSibling.text.match(
    /^\s*Duo\.init\(\{\s*'host':\s*"([^\\"]*)",\s*'sig_request':\s*"([^\\"]*)",\s*'post_action':\s*"([^\\"]*)"\s*\}\);\s*$/
  );
  if (m === null) return null;
  const [, host, sig_request, post_action] = m;
  return { host, sig_request, post_action };
}

async function downloadCertClientKey(options) {
  options.onStatus("Opening session");
  const startResponse = await wsHttpsFetch(
    wsUrl,
    forge.http.createRequest({
      method: "GET",
      path: "/ca/",
      headers: {
        Connection: "close",
        Host: "ca.mit.edu",
        "User-Agent": userAgent,
      },
    }),
    caStore
  );
  if (startResponse.code !== 200) {
    console.log("Server error:", startResponse);
    throw new Error(
      `Server error: ${startResponse.code} ${startResponse.message}`
    );
  }
  const [cookie] = startResponse.getCookies();

  options.onStatus("Authenticating");
  let loginResponse = await wsHttpsFetch(
    wsUrl,
    forge.http.createRequest({
      method: "POST",
      path: "/ca/login",
      headers: {
        Connection: "close",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `${cookie.name}=${cookie.value}`,
        Host: "ca.mit.edu",
        "User-Agent": userAgent,
      },
      body: [
        ["data", "1"],
        ["login", options.login],
        ["password", options.password],
        ["submit", "Next+>>"],
      ]
        .map(p => p.map(x => encodeURIComponent(x)).join("="))
        .join("&"),
    }),
    caStore
  );

  if (loginResponse.code === 200) {
    const loginDoc = new DOMParser().parseFromString(
      loginResponse.body,
      loginResponse.getField("Content-Type").match(/^[^;]*/)[0]
    );
    const duoParams = parseDuoDocument(loginDoc);
    if (duoParams === null) {
      console.log("Server error:", loginResponse);
      throw new Error("Server error: Unrecognized response");
    }

    options.onStatus("Starting Duo authentication");
    let duoResponse;
    const iframe = document.createElement("iframe");
    try {
      duoIframeContainerElement.appendChild(iframe);
      duoControlElement.hidden = false;
      duoResponse = await new Promise((resolve, reject) => {
        function cancel(event) {
          event.preventDefault();
          duoCancelElement.removeEventListener("click", cancel);
          reject(new Error("Duo authentication cancelled"));
        }

        duoCancelElement.addEventListener("click", cancel);

        Duo.init(
          Object.assign({}, duoParams, {
            iframe,
            submit_callback: duoResponse => {
              duoCancelElement.removeEventListener("click", cancel);
              resolve(duoResponse);
            },
          })
        );
      });
    } finally {
      duoControlElement.hidden = true;
      duoIframeContainerElement.removeChild(iframe);
    }

    options.onStatus("Finishing Duo authentication");
    loginResponse = await wsHttpsFetch(
      wsUrl,
      forge.http.createRequest({
        method: duoResponse.method,
        path: duoParams.post_action,
        headers: {
          Connection: "close",
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `${cookie.name}=${cookie.value}`,
          Host: "ca.mit.edu",
          "User-Agent": userAgent,
        },
        body: [...duoResponse.elements]
          .map(e => [e.name, e.value])
          .map(p => p.map(x => encodeURIComponent(x)).join("="))
          .join("&"),
      }),
      caStore
    );
  }

  if (
    loginResponse.code === 302 &&
    loginResponse.getField("Location") === "https://ca.mit.edu/ca/start/"
  ) {
    console.log("Login error:", loginResponse);
    throw new Error("Authentication error");
  } else if (
    loginResponse.code === 302 &&
    loginResponse.getField("Location") === "https://ca.mit.edu/ca/force_cpw"
  ) {
    console.log("Server error:", loginResponse);
    throw new Error(
      "You must change your Kerberos password before proceeding."
    );
  } else if (
    loginResponse.code !== 302 ||
    loginResponse.getField("Location") !== "https://ca.mit.edu/ca/certgen"
  ) {
    console.log("Server error:", loginResponse);
    throw new Error(
      `Server error: ${loginResponse.code} ${loginResponse.message}`
    );
  }

  options.onStatus("Fetching challenge");
  const formResponse = await wsHttpsFetch(
    wsUrl,
    forge.http.createRequest({
      method: "GET",
      path: "/ca/certgen",
      headers: {
        Connection: "close",
        Cookie: `${cookie.name}=${cookie.value}`,
        Host: "ca.mit.edu",
        "User-Agent": userAgent,
      },
    }),
    caStore
  );
  if (formResponse.code !== 200) {
    console.log("Server error:", formResponse);
    throw new Error(
      `Server error: ${formResponse.code} ${formResponse.message}`
    );
  }

  const doc = new DOMParser().parseFromString(
    formResponse.body,
    formResponse.getField("Content-Type").match(/^[^;]*/)[0]
  );
  const [userkey] = doc.getElementsByName("userkey");
  const challenge = userkey.getAttribute("challenge");
  const life = doc.getElementById("life").value;

  options.onStatus("Generating key pair");
  const keyPair = await new Promise((resolve, reject) =>
    forge.pki.rsa.generateKeyPair({ bits: 2048 }, (err, keyPair) =>
      err ? reject(err) : resolve(keyPair)
    )
  );
  const spkac = generateSpkac(keyPair, challenge);

  options.onStatus("Requesting certificate");
  const spkacResponse0 = await wsHttpsFetch(
    wsUrl,
    forge.http.createRequest({
      method: "POST",
      path: "/ca/handlemoz",
      headers: {
        Connection: "close",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `${cookie.name}=${cookie.value}`,
        Host: "ca.mit.edu",
        "User-Agent": userAgent,
      },
      body: [
        ["data", "1"],
        ["life", life],
        ["Submit", "Next+>>"],
        ["userkey", spkac],
      ]
        .map(p => p.map(x => encodeURIComponent(x)).join("="))
        .join("&"),
    }),
    caStore
  );
  if (
    spkacResponse0.code !== 302 ||
    spkacResponse0.getField("Location") !== "https://ca.mit.edu/ca/mozcert/0"
  ) {
    console.log("Server error:", spkacResponse0);
    throw new Error(
      `Server error: ${spkacResponse0.code} ${spkacResponse0.message}`
    );
  }

  options.onStatus("Downloading certificate");
  const spkacResponse2 = await wsHttpsFetch(
    wsUrl,
    forge.http.createRequest({
      method: "GET",
      path: "/ca/mozcert/2",
      headers: {
        Connection: "close",
        Cookie: `${cookie.name}=${cookie.value}`,
        Host: "ca.mit.edu",
        "User-Agent": userAgent,
      },
    }),
    caStore
  );
  if (spkacResponse2.code !== 200) {
    console.log("Server error:", spkacResponse2);
    throw new Error(
      `Server error: ${spkacResponse2.code} ${spkacResponse2.message}`
    );
  }

  const a1 = asn1.fromDer(spkacResponse2.body);
  const cert = forge.pki.certificateFromAsn1(a1);
  const p12 = forge.pkcs12.toPkcs12Asn1(
    keyPair.privateKey,
    [cert],
    options.downloadpassword,
    {
      algorithm: "3des",
      friendlyName: `${options.login}'s MIT Certificate`,
    }
  );
  return forge.util.binary.raw.decode(asn1.toDer(p12).getBytes());
}

function downloadCert(options) {
  if (options.generate === "client") {
    return downloadCertClientKey(options);
  } else if (options.generate === "server") {
    return downloadCertServerKey(options);
  } else {
    throw new Error("Unexpected value for generate");
  }
}

let working = false;
const submitElement = document.getElementById("mit-submit");
const loginElement = document.getElementById("mit-login");
const passwordElement = document.getElementById("mit-password");
const mitIdControlElement = document.getElementById("mit-id-control");
const mitIdElement = document.getElementById("mit-id");
const duoControlElement = document.getElementById("mit-duo-control");
const duoIframeContainerElement = document.getElementById(
  "mit-duo-iframe-container"
);
const duoCancelElement = document.getElementById("mit-duo-cancel");
const downloadPasswordElement = document.getElementById("mit-downloadpassword");
const generateElement = document.getElementById("mit-generate");
const statusElement = document.getElementById("mit-status");

function invalid() {
  return (
    working ||
    !loginElement.value ||
    !passwordElement.value ||
    (generateElement.value === "server" &&
      !mitIdElement.value.match(/^9\d{8}$/)) ||
    !downloadPasswordElement.value
  );
}

function validate(_event) {
  mitIdControlElement.hidden = generateElement.value !== "server";
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
  generateElement.disabled = true;
  statusElement.textContent = "";

  const login = loginElement.value;
  try {
    const cert = await downloadCert({
      login: login,
      password: passwordElement.value,
      mitid: mitIdElement.value,
      downloadpassword: downloadPasswordElement.value,
      expiration: "2999-01-01T00:00:00",
      force: "0",
      alwaysreuse: "1",
      generate: generateElement.value,
      onStatus: status => {
        statusElement.textContent += status + "\n";
      },
    });
    statusElement.textContent += "Certificate ready\n";
    saveBlob(
      new Blob([cert], {
        type: "application/x-pkcs12",
      }),
      login + "-mit-cert.p12"
    );
  } catch (error) {
    statusElement.textContent += error + "\n";
    throw error;
  } finally {
    working = false;
    loginElement.disabled = false;
    passwordElement.disabled = false;
    mitIdElement.disabled = false;
    downloadPasswordElement.disabled = false;
    generateElement.disabled = false;
    validate();
  }
}

loginElement.addEventListener("change", validate);
loginElement.addEventListener("input", validate);
passwordElement.addEventListener("change", validate);
passwordElement.addEventListener("input", validate);
mitIdElement.addEventListener("change", validate);
mitIdElement.addEventListener("input", validate);
downloadPasswordElement.addEventListener("change", validate);
downloadPasswordElement.addEventListener("input", validate);
generateElement.addEventListener("change", validate);
document.getElementById("mit-form").addEventListener("submit", submit);

validate();
loginElement.focus();
