/// <reference types="node-forge" />

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
