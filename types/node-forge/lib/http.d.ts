import forge from "node-forge";

export interface Cookie {
  name: string;
  value: string;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
}

export interface Header {
  fields: Record<string, string[]>;
  setField: (name: string, value: string) => void;
  appendField: (name: string, value: string) => void;
  getField: (name: string, index?: number) => string | null;
}

export interface Request extends Header {
  version: string;
  method: string | null;
  path: string | null;
  body: forge.Bytes | null;
  bodyDeflated: boolean;
  addCookie: (cookie: Cookie) => void;
  toString: () => string;
}

export function createRequest(options: {
  version?: string;
  method?: string;
  path?: string;
  body?: forge.Bytes;
  headers?: Record<string, string> | ReadonlyArray<Record<string, string>>;
}): Request;

export interface Response extends Header {
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

export function createResponse(): Response;
