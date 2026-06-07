/// <reference types="vite/client" />

declare module "mammoth/mammoth.browser" {
  export type MammothMessage = {
    type: string;
    message: string;
  };

  export type MammothResult = {
    value: string;
    messages: MammothMessage[];
  };

  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: Record<string, unknown>): Promise<MammothResult>;
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
  };

  export default mammoth;
}
