import forge from "node-forge";
import { rootCas } from "ssl-root-cas";

const caStore = forge.pki.createCaStore();
for (const pem of rootCas) {
  try {
    caStore.addCertificate(pem);
  } catch {
    // Ignore non-RSA certificates that forge doesn’t support.
  }
}

export default caStore;
