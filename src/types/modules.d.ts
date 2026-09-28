declare module "pdf-parse-debugging-disabled" {
  interface PDFData {
    numpages: number;
    text: string;
    info: unknown;
    metadata: unknown;
  }
  function pdfParse(data: Buffer): Promise<PDFData>;
  export default pdfParse;
}
