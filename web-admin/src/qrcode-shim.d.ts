/** Browser-only QR helper surface. The published @types package references
 * Node's stream types, which are not part of the admin bundle and can create
 * a Node/DOM declaration cycle during frontend typechecking. */
declare module "qrcode" {
  interface QrColorOptions {
    dark?: string;
    light?: string;
  }

  interface QrDataUrlOptions {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "low" | "medium" | "quartile" | "high" | "L" | "M" | "Q" | "H";
    color?: QrColorOptions;
  }

  const QRCode: {
    toDataURL(value: string, options?: QrDataUrlOptions): Promise<string>;
  };

  export default QRCode;
}
