import Duo from "@duosecurity/duo_web/js/Duo-Web-v2";
import forge, { asn1 } from "node-forge";
import http from "node-forge/lib/http";
import wsHttpsFetch from "./ws-https-fetch";
import generateSpkac from "./generate-spkac";
import saveBlob from "./save-blob";
import caStore from "./ca-store";

type Options = {
  login: string;
  password: string;
  mitid: string;
  downloadpassword: string;
  expiration: string;
  force: string;
  alwaysreuse: string;
  generate: string;
  onStatus: (status: string) => void;
};

const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
  window.location.host
}/ws/mit`;

let working = false;
const formElement = document.querySelector<HTMLFormElement>("#mit-form")!;
const submitElement = document.querySelector<HTMLInputElement>("#mit-submit")!;
const loginElement = document.querySelector<HTMLInputElement>("#mit-login")!;
const passwordElement =
  document.querySelector<HTMLInputElement>("#mit-password")!;
const mitIdControlElement =
  document.querySelector<HTMLElement>("#mit-id-control")!;
const mitIdElement = document.querySelector<HTMLInputElement>("#mit-id")!;
const duoControlElement =
  document.querySelector<HTMLElement>("#mit-duo-control")!;
const duoIframeContainerElement = document.querySelector(
  "#mit-duo-iframe-container"
)!;
const duoCancelElement = document.querySelector("#mit-duo-cancel")!;
const downloadPasswordControlElement = document.querySelector<HTMLInputElement>(
  "#mit-downloadpassword-control"
)!;
const downloadPasswordElement = document.querySelector<HTMLInputElement>(
  "#mit-downloadpassword"
)!;
const spkacFormElement =
  document.querySelector<HTMLFormElement>("#mit-spkac-form")!;
const spkacChallengeElement = document.querySelector<HTMLInputElement>(
  "#mit-spkac-challenge"
)!;
const spkacChallengeShElement = document.querySelector(
  "#mit-spkac-challenge-sh"
)!;
const spkacElement = document.querySelector<HTMLInputElement>("#mit-spkac")!;
const spkacCancelElement = document.querySelector("#mit-spkac-cancel")!;
const generateElement =
  document.querySelector<HTMLInputElement>("#mit-generate")!;
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
  const tree: Tree = {};
  let leaf = true;
  for (const child of node.childNodes) {
    if (!(child instanceof Text)) {
      leaf = false;
      tree[child.nodeName] = xmlToObject(child);
    }
  }

  return leaf ? node.textContent : tree;
}

async function apiCall(cmd: Record<string, string>): Promise<Tree> {
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

type APIError = {
  error: { code: string; text: string };
};

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
  loginDocument: Document
): { host: string; sig_request: string; post_action: string } | null {
  const iframe = loginDocument.querySelector("#duo_iframe");
  if (iframe === null) return null;
  const script = iframe.previousElementSibling;
  if (!(script instanceof HTMLScriptElement)) return null;
  const m =
    /^\s*Duo\.init\({\s*'host':\s*"([^\\"]*)",\s*'sig_request':\s*"([^\\"]*)",\s*'post_action':\s*"([^\\"]*)"\s*}\);\s*$/.exec(
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

type ScrapeCertDerOptions = {
  getSpkac: (challenge: string) => Promise<string>;
} & Options;

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
    const loginDocument = new DOMParser().parseFromString(
      loginResponse.body!,
      /^[^;]*/.exec(
        loginResponse.getField("Content-Type")!
      )![0] as DOMParserSupportedType
    );
    const duoParameters = parseDuoDocument(loginDocument);
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
          submit_callback(duoResponse) {
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

  const challengeDocument = new DOMParser().parseFromString(
    formResponse.body!,
    /^[^;]*/.exec(
      formResponse.getField("Content-Type")!
    )![0] as DOMParserSupportedType
  );
  const [userkey] = challengeDocument.getElementsByName("userkey");
  const challenge = userkey.getAttribute("challenge");
  if (challenge === null) throw new Error("Missing challenge");
  const life =
    challengeDocument.querySelector<HTMLInputElement>("#life")!.value;

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
    async getSpkac(challenge) {
      options.onStatus("Generating key pair");
      keyPair = await new Promise<forge.pki.rsa.KeyPair>((resolve, reject) => {
        forge.pki.rsa.generateKeyPair({ bits: 2048 }, (error, keyPair) => {
          if (error) reject(error);
          else resolve(keyPair);
        });
      });
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
    async getSpkac(challenge) {
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
  /* eslint-disable-next-line @typescript-eslint/consistent-type-definitions */
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
      onStatus(status: string) {
        statusElement.append(status, "\n");
      },
    });
  } catch (error: unknown) {
    statusElement.append(
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Unknown error",
      "\n"
    );
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
