import fetch from 'cross-fetch';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const LLM_TIMEOUT_MS = 5_000;

export class LlmError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onAbort: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => {
      try { onAbort(); } catch {}
      reject(new LlmError('要約がタイムアウトしました', 504));
    }, ms);
    promise.then((v) => { clearTimeout(id); resolve(v); })
      .catch((e) => { clearTimeout(id); reject(e); });
  });
}

function cleanOutput(text: string): string {
  let t = text.trim();
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/[\r\n]+/g, ' ');
  // Remove markdown artifacts
  t = t.replace(/^"|"$/g, '');
  return t;
}

function isJapanese(text: string): boolean {
  // Heuristic: must contain some Hiragana/Katakana/Kanji and not be predominantly ASCII
  const jp = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  return jp.test(text);
}

function isSingleSentence(text: string): boolean {
  // Count sentence-ending punctuation common in Japanese
  const normalized = text.replace(/。+/g, '。');
  const ends = (normalized.match(/。/g) || []).length + (normalized.match(/[.!?](?!\w)/g) || []).length;
  // Allow zero if short, but generally expect one sentence
  return ends <= 1 && !/。.*。/.test(normalized);
}

function noForbidden(text: string): boolean {
  // No URLs, emojis, hashtags
  if (/https?:\/\//i.test(text)) return false;
  if (/[#＃]/.test(text)) return false;
  if (/\p{Extended_Pictographic}/u.test(text)) return false;
  return true;
}

function enforceMax80(text: string): string {
  if (text.length <= 80) return text;
  // Try cut at last punctuation within 80
  const slice = text.slice(0, 80);
  const idx = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('、'), slice.lastIndexOf('.'), slice.lastIndexOf(','));
  if (idx >= 10) {
    return slice.slice(0, idx + 1);
  }
  return slice; // safe hard cut, no ellipsis
}

function buildSystemInstruction() {
  return {
    role: 'system' as const,
    parts: [
      { text: [
        'あなたは情報を要約する日本語編集者です。',
        '出力は日本語で一文のみ、80文字以内。',
        '客観・中立に、具体名を優先し、主観/煽り/断定過多は禁止。',
        'URL・絵文字・記号装飾・箇条書き禁止。',
        'テキストが複数トピックの場合は支配的トピックを要約。'
      ].join('\n') }
    ]
  };
}

function buildUserContent(text: string) {
  // few-shot 例 (開発者が差し替え可能)
  const fewShotIn = '〇〇社が□□を発表。市場動向〜';
  const fewShotOut = '〇〇社が□□を発表し、△△市場で××の拡大を狙う動きが加速した';

  const prompt = [
    '以下の本文を日本語で一文のみ、80文字以内に要約してください。',
    '出力は日本語で一文のみ/80文字以内/句読点含む。URLや絵文字、ハッシュタグは禁止。',
    '複数トピックの場合は支配的トピックを要約してください。',
    '【例】',
    `入力: ${fewShotIn}`,
    `出力: ${fewShotOut}`,
    '——— 本文 ——―',
    text
  ].join('\n');
  return { role: 'user' as const, parts: [{ text: prompt }] };
}

function buildRetryUserContent(text: string) {
  const prompt = [
    '前回の出力は条件を満たしていません。',
    '必ず日本語で「一文のみ」「80文字以内」。URL・絵文字・ハッシュタグ禁止。',
    '短く端的に要約してください。',
    '本文:',
    text
  ].join('\n');
  return { role: 'user' as const, parts: [{ text: prompt }] };
}

export async function generateOneLineSummary({ text }: { text: string }): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new LlmError('サーバ設定エラー: GOOGLE_API_KEY が未設定です', 500);

  const chunk = text.slice(0, Math.min(Math.max(3000, text.length), 8000));

  const controller = new AbortController();
  const abort = () => controller.abort();

  const call = async (contents: any[]) => {
    const body = {
      contents,
      systemInstruction: { parts: buildSystemInstruction().parts },
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 80 * 4, // generous token cap but we guard length later
      }
    };

    const url = `${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`;
    const res = await withTimeout(fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    }), LLM_TIMEOUT_MS, abort);

    if (!res.ok) {
      const msg = `Gemini APIエラー (HTTP ${res.status})`;
      throw new LlmError(msg, 502);
    }
    const data = await res.json();
    const candidates = data?.candidates;
    const textOut: string | undefined = candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOut) throw new LlmError('Geminiの応答が空です', 502);
    return cleanOutput(textOut);
  };

  // First attempt
  let out = await call([buildUserContent(chunk)]);
  if (!(isJapanese(out) && isSingleSentence(out) && noForbidden(out))) {
    // Retry once with stricter prompt
    out = await call([buildRetryUserContent(chunk)]);
    if (!(isJapanese(out) && isSingleSentence(out) && noForbidden(out))) {
      throw new LlmError('要約の形式が規約を満たしませんでした', 502);
    }
  }

  out = enforceMax80(out);
  return out;
}
