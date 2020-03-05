import forge from "node-forge";
import addTrustCrt from "raw-loader!./AddTrust_External_Root.crt"; // eslint-disable-line import/extensions, import/no-webpack-loader-syntax
const caStore = forge.pki.createCaStore([addTrustCrt]);
export default caStore;
