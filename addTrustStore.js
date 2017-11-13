'use strict';

import forge from 'node-forge';
import addTrustCrt from 'raw-loader!./AddTrust_External_Root.crt';
const caStore = forge.pki.createCaStore([addTrustCrt]);
export default caStore;
