declare module "bwip-js/node" {
  interface ToBufferOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    width?: number;
    includetext?: boolean;
    paddingwidth?: number;
    paddingheight?: number;
  }
  function toBuffer(opts: ToBufferOptions): Promise<Buffer>;
  export default { toBuffer };
}

declare module "bwip-js" {
  interface ToBufferOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    width?: number;
    includetext?: boolean;
    paddingwidth?: number;
    paddingheight?: number;
  }
  function toBuffer(opts: ToBufferOptions): Promise<Buffer>;
  export default { toBuffer };
}
