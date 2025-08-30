import fetch, { Response } from 'cross-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { htmlToText } from 'html-to-text';

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;

export class ExtractError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'ExtractError';
    this.status = status;
  }
}

export function validateUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new ExtractError('URLを入力してください', 400);
  if (trimmed.length > MAX_URL_LENGTH) throw new ExtractError('URLが長すぎます (最大2048文字)', 400);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ExtractError('URLの形式が正しくありません', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ExtractError('http/https のURLのみ対応しています', 400);
  }
  return url;
}

function withTimeout<T>(promise: Promise<T>, ms: number, onAbort: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      try { onAbort(); } catch {}
      reject(new ExtractError('コンテンツ取得がタイムアウトしました', 504));
    }, ms);
    promise
      .then((v) => { clearTimeout(id); resolve(v); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

export async function fetchHtml(startUrl: URL): Promise<{ html: string; finalUrl: string; status: number }> {
  let current = startUrl.toString();
  let redirects = 0;

  const controller = new AbortController();
  const abort = () => controller.abort();

  const doFetch = async (url: string): Promise<Response> => {
    return fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OneLineSummarizer/1.0; +https://example.invalid)'
      },
      signal: controller.signal,
    });
  };

  try {
    while (true) {
      const res = await withTimeout(doFetch(current), FETCH_TIMEOUT_MS, abort);
      const status = res.status;

      if ([301, 302, 303, 307, 308].includes(status)) {
        if (redirects >= MAX_REDIRECTS) {
          throw new ExtractError('リダイレクト回数が多すぎます', 422);
        }
        const location = res.headers.get('location');
        if (!location) {
          throw new ExtractError('リダイレクト先が不明です', 422);
        }
        const nextUrl = new URL(location, current).toString();
        current = nextUrl;
        redirects += 1;
        continue;
      }

      if (status >= 200 && status < 300) {
        const html = await res.text();
        return { html, finalUrl: current, status };
      }

      if (status === 404) {
        throw new ExtractError('ページが見つかりません (404)', 422);
      }

      throw new ExtractError(`ページ取得に失敗しました (HTTP ${status})`, 422);
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new ExtractError('コンテンツ取得がタイムアウトしました', 504);
    }
    if (e instanceof ExtractError) throw e;
    throw new ExtractError('ページの取得中にエラーが発生しました', 422);
  }
}

function normalizeWhitespace(text: string): string {
  // Normalize newlines to single \n, collapse multiple spaces, trim
  return text
    .replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[\u00A0\s]{2,}/g, ' ')
    .trim();
}

export function extractMainText(html: string, url: string): string {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    // Prefer Readability
    const reader = new Readability(doc);
    const article = reader.parse();
    let text = '';
    if (article?.textContent) {
      text = article.textContent;
    }

    text = normalizeWhitespace(text);

    // Fallback if too short
    if (!text || text.length < 200) {
      const fallback = htmlToText(html, {
        wordwrap: false,
        selectors: [
          { selector: 'script', format: 'skip' },
          { selector: 'style', format: 'skip' },
          { selector: 'nav', format: 'skip' },
          { selector: 'footer', format: 'skip' },
        ],
      });
      text = normalizeWhitespace(fallback);
    }

    if (!text || text.length < 200) {
      throw new ExtractError('ページ本文が取得できませんでした', 422);
    }

    return text;
  } catch (e) {
    if (e instanceof ExtractError) throw e;
    throw new ExtractError('本文抽出に失敗しました', 422);
  }
}
