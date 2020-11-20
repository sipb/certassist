/* eslint-disable unicorn/prevent-abbreviations */

declare module "node-forge" {
  namespace oids {
    const data: OID;
  }

  namespace pkcs7 {
    interface PkcsEnvelopedData {
      type: OID;
      certificates: pki.Certificate[];
    }
    interface PkcsEncryptedData {
      type: OID;
    }
    interface PkcsSignedData {
      type: OID;
      certificates: pki.Certificate[];
    }
    type PkcsMessage = PkcsEnvelopedData | PkcsEncryptedData | PkcsSignedData;
    function messageFromAsn1(obj: asn1.Asn1): PkcsMessage;
  }
}

declare module "node-forge/lib/http" {
  import forge from "node-forge";

  interface Cookie {
    name: string;
    value: string;
    maxAge?: number;
    secure?: boolean;
    httpOnly?: boolean;
  }

  interface Header {
    fields: Record<string, string[]>;
    setField: (name: string, value: string) => void;
    appendField: (name: string, value: string) => void;
    getField: (name: string, index?: number) => string | null;
  }

  interface Request extends Header {
    version: string;
    method: string | null;
    path: string | null;
    body: forge.Bytes | null;
    bodyDeflated: boolean;
    addCookie: (cookie: Cookie) => void;
    toString: () => string;
  }

  function createRequest(options: {
    version?: string;
    method?: string;
    path?: string;
    body?: forge.Bytes;
    headers?: Record<string, string> | ReadonlyArray<Record<string, string>>;
  }): Request;

  interface Response extends Header {
    version: string | null;
    code: number;
    message: string | null;
    body: forge.Bytes | null;
    headerReceived: boolean;
    bodyReceived: boolean;
    readHeader: (b: forge.util.ByteBuffer) => boolean;
    readBody: (b: forge.util.ByteBuffer) => boolean;
    getCookies: () => Cookie[];
    toString: () => string;
  }

  function createResponse(): Response;
}
