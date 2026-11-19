"use client";

import { SELLO_HTML } from "./selloHtml";

/** Escena animada del login (pipeline DTE → SII), idéntica a Pulsando. */
export function LoginSello() {
  return <div dangerouslySetInnerHTML={{ __html: SELLO_HTML }} />;
}
