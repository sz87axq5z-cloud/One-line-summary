declare module 'html-to-text' {
  export interface HtmlToTextOptions {
    wordwrap?: number | false;
    selectors?: Array<{ selector: string; format?: 'skip' | string }>;
  }
  export function htmlToText(html: string, options?: HtmlToTextOptions): string;
}
