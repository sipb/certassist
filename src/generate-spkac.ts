import forge, { asn1 } from "node-forge";

function generateSpkac(
  keyPair: forge.pki.rsa.KeyPair,
  challenge: string
): string {
  const pkac = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    forge.pki.publicKeyToAsn1(keyPair.publicKey),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.IA5STRING, false, challenge),
  ]);
  const md = forge.md.md5.create();
  md.update(asn1.toDer(pkac).getBytes());
  const signature = keyPair.privateKey.sign(md);
  return forge.util.encode64(
    asn1
      .toDer(
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
          pkac,
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
            asn1.create(
              asn1.Class.UNIVERSAL,
              asn1.Type.OID,
              false,
              asn1.oidToDer(forge.pki.oids.md5WithRSAEncryption).getBytes()
            ),
            asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""),
          ]),
          asn1.create(
            asn1.Class.UNIVERSAL,
            asn1.Type.BITSTRING,
            false,
            String.fromCharCode(0x00) + signature
          ),
        ])
      )
      .getBytes()
  );
}

export default generateSpkac;
