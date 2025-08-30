import { NextRequest } from 'next/server';
import { extractMainText, fetchHtml, validateUrl, ExtractError } from '../../../lib/extract';
import { generateOneLineSummary, LlmError } from '../../../lib/gemini';

const OVERALL_TIMEOUT_MS = 15_000;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function withOverallTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('overall-timeout')), ms);
    promise.then((v) => { clearTimeout(id); resolve(v); })
           .catch((e) => { clearTimeout(id); reject(e); });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const urlStr = body?.url as string | undefined;
    if (!urlStr) {
      return Response.json({ error: 'url は必須です' }, { status: 400 });
    }

    const url = validateUrl(urlStr);

    const work = (async () => {
      const { html, finalUrl } = await fetchHtml(url);
      const text = extractMainText(html, finalUrl);
      const summary = await generateOneLineSummary({ text });
      return summary;
    })();

    const summary = await withOverallTimeout(work, OVERALL_TIMEOUT_MS);
    return Response.json({ summary });
  } catch (e: any) {
    if (e === null) {
      return Response.json({ error: '不正なJSONです' }, { status: 400 });
    }
    if (e instanceof ExtractError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof LlmError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    if (e?.message === 'overall-timeout') {
      return Response.json({ error: '処理がタイムアウトしました' }, { status: 504 });
    }
    return Response.json({ error: 'サーバ内部エラーが発生しました' }, { status: 502 });
  }
}

export async function GET() {
  return Response.json({ error: 'POST のみ受け付けます' }, { status: 405 });
}
