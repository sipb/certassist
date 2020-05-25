import Duo from "@duosecurity/duo_web/js/Duo-Web-v2";
import forge, { asn1 } from "node-forge";
import http from "node-forge/lib/http";

import wsHttpsFetch from "./ws-https-fetch";
import generateSpkac from "./generate-spkac";
import saveBlob from "./save-blob";
import caStore from "./add-trust-store";

interface Options {
  login: string;
  password: string;
  mitid: string;
  downloadpassword: string;
  expiration: string;
  force: string;
  alwaysreuse: string;
  generate: string;
  onStatus: (status: string) => void;
}

const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
  window.location.host
}/ws/mit`;

let working = false;
const formElement = document.querySelector("#mit-form") as HTMLFormElement;
const submitElement = document.querySelector("#mit-submit") as HTMLInputElement;
const loginElement = document.querySelector("#mit-login") as HTMLInputElement;
const passwordElement = document.querySelector(
  "#mit-password"
) as HTMLInputElement;
const mitIdControlElement = document.querySelector(
  "#mit-id-control"
) as HTMLElement;
const mitIdElement = document.querySelector("#mit-id") as HTMLInputElement;
const duoControlElement = document.querySelector(
  "#mit-duo-control"
) as HTMLElement;
const duoIframeContainerElement = document.querySelector(
  "#mit-duo-iframe-container"
)!;
const duoCancelElement = document.querySelector("#mit-duo-cancel")!;
const downloadPasswordControlElement = document.querySelector(
  "#mit-downloadpassword-control"
) as HTMLInputElement;
const downloadPasswordElement = document.querySelector(
  "#mit-downloadpassword"
) as HTMLInputElement;
const spkacFormElement = document.querySelector(
  "#mit-spkac-form"
) as HTMLFormElement;
const spkacChallengeElement = document.querySelector(
  "#mit-spkac-challenge"
) as HTMLInputElement;
const spkacChallengeShElement = document.querySelector(
  "#mit-spkac-challenge-sh"
)!;
const spkacElement = document.querySelector("#mit-spkac") as HTMLInputElement;
const spkacCancelElement = document.querySelector("#mit-spkac-cancel")!;
const generateElement = document.querySelector(
  "#mit-generate"
) as HTMLInputElement;
const statusElement = document.querySelector("#mit-status")!;

function saveP12Binary(options: Options, p12Binary: Uint8Array): void {
  options.onStatus("Certificate ready");
  saveBlob(
    new Blob([p12Binary], {
      type: "application/x-pkcs12",
    }),
    options.login + "-mit-cert.p12"
  );
}

type Tree = { [key: string]: Tree } | string | null;

function xmlToObject(node: Node): Tree {
  if (node.childNodes.length !== 0) {
    const tree: Tree = {};
    for (const child of node.childNodes) {
      tree[child.nodeName] = xmlToObject(child);
    }

    return tree;
  }

  return node.textContent;
}

async function apiCall(cmd: { [key: string]: string }): Promise<Tree> {
  const response = await wsHttpsFetch(
    wsUrl,
    http.createRequest({
      method: "POST",
      path: "/ca/api",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: "ca.mit.edu",
        Connection: "close",
      },
      body: Object.keys(cmd)
        .map((key) =>
          [key, cmd[key]].map((x) => encodeURIComponent(x)).join("=")
        )
        .join("&"),
    }),
    caStore
  );
  if (response.code !== 200) {
    console.log("Server error:", response.code, response.message);
    throw new Error(`Server error: ${response.code} ${response.message!}`);
  }

  return xmlToObject(
    new DOMParser().parseFromString(response.body!, "text/xml")
  );
}

interface APIError {
  error: { code: string; text: string };
}

async function downloadCertServerKey(options: Options): Promise<void> {
  options.onStatus("Opening session");
  const startupReply = (await apiCall({
    operation: "startup",
    sessiontype: "xml",
    version: "2",
    os: "Windows NT 10.0.14393.0",
    browser: "Firefox 60.0",
  })) as
    | {
        startupresponse: {
          sessiontype: string;
          sessionid: string;
          sessionexpires: string;
          maxexpire: string;
        };
      }
    | APIError;
  if ("error" in startupReply) {
    console.log("Session error:", startupReply);
    throw new Error("Session error: " + startupReply.error.text);
  }

  const sessionid = startupReply.startupresponse.sessionid;

  let p12Binary;
  try {
    options.onStatus("Authenticating");
    const authenticateReply = (await apiCall({
      operation: "authenticate",
      sessionid,
      login: options.login,
      password: options.password,
      mitid: options.mitid,
    })) as { authenticateresponse: null } | APIError;
    if ("error" in authenticateReply) {
      console.log("Authentication error:", authenticateReply);
      throw new Error("Authentication error: " + authenticateReply.error.text);
    }

    options.onStatus("Downloading certificate");
    const downloadReply = (await apiCall({
      operation: "downloadcert",
      sessionid,
      downloadpassword: options.downloadpassword,
      expiration: options.expiration,
      force: options.force,
      alwaysreuse: options.alwaysreuse,
    })) as { downloadcertresponse: { pkcs12: string } } | APIError;
    if ("error" in downloadReply) {
      console.log("Certificate error:", downloadReply);
      throw new Error("Certificate error: " + downloadReply.error.text);
    }

    p12Binary = forge.util.binary.base64.decode(
      downloadReply.downloadcertresponse.pkcs12
    );
  } finally {
    options.onStatus("Closing session");
    await apiCall({ operation: "finish", sessionid });
  }

  saveP12Binary(options, p12Binary);
}

const caHeaders = {
  Connection: "close",
  Host: "ca.mit.edu",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:60.0) Gecko/20100101 Firefox/60.0",
};

function parseDuoDocument(
  doc: Document
): { host: string; sig_request: string; post_action: string } | null {
  const iframe = doc.querySelector("#duo_iframe");
  if (iframe === null) return null;
  const script = iframe.previousElementSibling;
  if (!(script instanceof HTMLScriptElement)) return null;
  const m = /^\s*Duo\.init\({\s*'host':\s*"([^\\"]*)",\s*'sig_request':\s*"([^\\"]*)",\s*'post_action':\s*"([^\\"]*)"\s*}\);\s*$/.exec(
    script.text
  );
  if (m === null) return null;
  const [, host, sig_request, post_action] = m;
  return { host, sig_request, post_action };
}

async function start(): Promise<http.Response> {
  const response = await wsHttpsFetch(
    wsUrl,
    http.createRequest({
      method: "GET",
      path: "/ca/",
      headers: caHeaders,
    }),
    caStore
  );
  if (response.code !== 200) {
    console.log("Server error:", response);
    throw new Error(`Server error: ${response.code} ${response.message!}`);
  }

  return response;
}

interface ScrapeCertDerOptions extends Options {
  getSpkac: (challenge: string) => Promise<string>;
}

async function scrapeCertDer(options: ScrapeCertDerOptions): Promise<string> {
  options.onStatus("Opening session");
  const startResponse = await start();
  const headers = {
    ...caHeaders,
    Cookie: startResponse
      .getCookies()
      .map(
        ({ name, value }: { name: string; value: string }) => `${name}=${value}`
      )
      .join("; "),
  };

  options.onStatus("Authenticating");
  let loginResponse = await wsHttpsFetch(
    wsUrl,
    http.createRequest({
      method: "POST",
      path: "/ca/login",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: [
        ["data", "1"],
        ["login", options.login],
        ["password", options.password],
        ["submit", "Next+>>"],
      ]
        .map((p) => p.map((x) => encodeURIComponent(x)).join("="))
        .join("&"),
    }),
    caStore
  );

  if (loginResponse.code === 200) {
    const loginDoc = new DOMParser().parseFromString(
      loginResponse.body!,
      /^[^;]*/.exec(
        loginResponse.getField("Content-Type")!
      )![0] as SupportedType
    );
    const duoParameters = parseDuoDocument(loginDoc);
    if (duoParameters === null) {
      console.log("Server error:", loginResponse);
      throw new Error("Server error: Unrecognized response");
    }

    options.onStatus("Starting Duo authentication");
    let duoResponse: HTMLFormElement;
    const iframe = document.createElement("iframe");
    try {
      duoIframeContainerElement.append(iframe);
      duoControlElement.hidden = false;
      duoResponse = await new Promise((resolve, reject) => {
        function cancel(event: Event): void {
          event.preventDefault();
          duoCancelElement.removeEventListener("click", cancel);
          reject(new Error("Duo authentication cancelled"));
        }

        duoCancelElement.addEventListener("click", cancel);

        Duo.init({
          ...duoParameters,
          iframe,
          submit_callback: (duoResponse) => {
            duoCancelElement.removeEventListener("click", cancel);
            resolve(duoResponse);
          },
        });
      });
    } finally {
      duoControlElement.hidden = true;
      iframe.remove();
    }

    options.onStatus("Finishing Duo authentication");
    loginResponse = await wsHttpsFetch(
      wsUrl,
      http.createRequest({
        method: duoResponse.method,
        path: duoParameters.post_action,
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: [...duoResponse.elements]
          .map((element) => [
            (element as HTMLInputElement).name,
            (element as HTMLInputElement).value,
          ])
          .map((p) => p.map((x) => encodeURIComponent(x)).join("="))
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
      `Server error: ${loginResponse.code} ${loginResponse.message!}`
    );
  }

  options.onStatus("Fetching challenge");
  const formResponse = await wsHttpsFetch(
    wsUrl,
    http.createRequest({
      method: "GET",
      path: "/ca/certgen",
      headers,
    }),
    caStore
  );
  if (formResponse.code !== 200) {
    console.log("Server error:", formResponse);
    throw new Error(
      `Server error: ${formResponse.code} ${formResponse.message!}`
    );
  }

  const doc = new DOMParser().parseFromString(
    formResponse.body!,
    /^[^;]*/.exec(formResponse.getField("Content-Type")!)![0] as SupportedType
  );
  const [userkey] = doc.getElementsByName("userkey");
  const challenge = userkey.getAttribute("challenge");
  if (challenge === null) throw new Error("Missing challenge");
  const life = (doc.querySelector("#life") as HTMLInputElement).value;

  const spkac = await options.getSpkac(challenge);

  options.onStatus("Requesting certificate");
  const spkacResponse0 = await wsHttpsFetch(
    wsUrl,
    http.createRequest({
      method: "POST",
      path: "/ca/handlemoz",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: [
        ["data", "1"],
        ["life", life],
        ["Submit", "Next+>>"],
        ["userkey", spkac],
      ]
        .map((p) => p.map((x) => encodeURIComponent(x)).join("="))
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
      `Server error: ${spkacResponse0.code} ${spkacResponse0.message!}`
    );
  }

  options.onStatus("Downloading certificate");
  const spkacResponse2 = await wsHttpsFetch(
    wsUrl,
    http.createRequest({
      method: "GET",
      path: "/ca/mozcert/2",
      headers,
    }),
    caStore
  );
  if (spkacResponse2.code !== 200) {
    console.log("Server error:", spkacResponse2);
    throw new Error(
      `Server error: ${spkacResponse2.code} ${spkacResponse2.message!}`
    );
  }

  return spkacResponse2.body!;
}

async function downloadCertClientKey(options: Options): Promise<void> {
  let keyPair: forge.pki.rsa.KeyPair;
  const der = await scrapeCertDer({
    ...options,
    getSpkac: async (challenge) => {
      options.onStatus("Generating key pair");
      keyPair = await new Promise<forge.pki.rsa.KeyPair>((resolve, reject) =>
        forge.pki.rsa.generateKeyPair({ bits: 2048 }, (err, keyPair) =>
          err ? reject(err) : resolve(keyPair)
        )
      );
      return generateSpkac(keyPair, challenge);
    },
  });
  const p12 = forge.pkcs12.toPkcs12Asn1(
    keyPair!.privateKey,
    [forge.pki.certificateFromAsn1(asn1.fromDer(der))],
    options.downloadpassword,
    {
      algorithm: "3des",
      friendlyName: `${options.login}'s MIT Certificate`,
    }
  );
  saveP12Binary(
    options,
    forge.util.binary.raw.decode(asn1.toDer(p12).getBytes())
  );
}

async function downloadCertManual(options: Options): Promise<void> {
  const der = await scrapeCertDer({
    ...options,
    getSpkac: async (challenge) => {
      spkacChallengeElement.value = challenge;
      spkacChallengeShElement.textContent =
        "'" + challenge.replace("'", "'\\''") + "'";
      try {
        formElement.hidden = true;
        spkacFormElement.hidden = false;
        options.onStatus("Awaiting manual SPKAC generation");
        return await new Promise((resolve, reject) => {
          function submit(event: Event): void {
            event.preventDefault();
            spkacFormElement.removeEventListener("submit", submit);
            spkacCancelElement.removeEventListener("click", cancel);
            let spkac = spkacElement.value;
            if (spkac.startsWith("SPKAC=")) {
              spkac = spkac.slice("SPKAC=".length);
            }

            resolve(spkac);
          }

          function cancel(event: Event): void {
            event.preventDefault();
            spkacFormElement.removeEventListener("submit", submit);
            spkacCancelElement.removeEventListener("click", cancel);
            reject(new Error("Manual SPKAC generation cancelled"));
          }

          spkacFormElement.addEventListener("submit", submit);
          spkacCancelElement.addEventListener("click", cancel);
        });
      } finally {
        spkacFormElement.hidden = true;
        formElement.hidden = false;
        spkacElement.value = "";
      }
    },
  });

  options.onStatus("Certificate ready");
  saveBlob(
    new Blob([forge.util.binary.raw.decode(der)], {
      type: "application/x-x509-user-cert",
    }),
    options.login + "-mit-cert.crt"
  );
}

async function downloadCert(options: Options): Promise<void> {
  if (options.generate === "client") {
    return downloadCertClientKey(options);
  }

  if (options.generate === "server") {
    return downloadCertServerKey(options);
  }

  if (options.generate === "manual") {
    return downloadCertManual(options);
  }

  throw new Error("Unexpected value for generate");
}

declare global {
  interface Window {
    certAssistMitPing: () => Promise<void>;
  }
}

window.certAssistMitPing = async () => {
  await start();
};

function validate(): void {
  if (generateElement.value === "server") {
    mitIdControlElement.hidden = false;
    mitIdElement.required = true;
    mitIdElement.pattern = "9\\d{8}";
  } else {
    mitIdControlElement.hidden = true;
    mitIdElement.required = false;
    mitIdElement.pattern = ".*";
  }

  if (generateElement.value === "manual") {
    downloadPasswordControlElement.hidden = true;
    downloadPasswordElement.required = false;
  } else {
    downloadPasswordControlElement.hidden = false;
    downloadPasswordElement.required = true;
  }

  submitElement.disabled = working;
}

async function submit(event: Event): Promise<void> {
  event.preventDefault();
  if (working) return;
  working = true;
  submitElement.disabled = true;
  loginElement.disabled = true;
  passwordElement.disabled = true;
  mitIdElement.disabled = true;
  downloadPasswordElement.disabled = true;
  generateElement.disabled = true;
  statusElement.textContent = "";

  try {
    await downloadCert({
      login: loginElement.value,
      password: passwordElement.value,
      mitid: mitIdElement.value,
      downloadpassword: downloadPasswordElement.value,
      expiration: "2999-01-01T00:00:00",
      force: "0",
      alwaysreuse: "1",
      generate: generateElement.value,
      onStatus: (status: string) => {
        statusElement.append(status, "\n");
      },
    });
  } catch (error) {
    statusElement.append(error, "\n");
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
formElement.addEventListener("submit", submit);

validate();
