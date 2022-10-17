import type forge from "node-forge";

export type Cookie = {
  name: string;
  value: string;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
};

export type Header = {
  fields: Record<string, string[]>;
  setField: (name: string, value: string) => void;
  appendField: (name: string, value: string) => void;
  getField: (name: string, index?: number) => string | null;
};

export type Request = {
  version: string;
  method: string | null;
  path: string | null;
  body: forge.Bytes | null;
  bodyDeflated: boolean;
  addCookie: (cookie: Cookie) => void;
  toString: () => string;
} & Header;

export function createRequest(options: {
  version?: string;
  method?: string;
  path?: string;
  body?: forge.Bytes;
  headers?: Record<string, string> | ReadonlyArray<Record<string, string>>;
}): Request;

export type Response = {
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
} & Header;

export function createResponse(): Response;
