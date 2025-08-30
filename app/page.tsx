"use client";
import { useState } from 'react';

export default function Page() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSummary(null);
    setError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setError("URLを入力してください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "エラーが発生しました");
      } else {
        setSummary(data.summary);
      }
    } catch (e) {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      // submit via form
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f7f7f8",
      padding: 24
    }}>
      <div style={{
        width: "100%",
        maxWidth: 720,
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        padding: 24
      }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>1行要約 (80文字以内)</h1>
        <p style={{ color: "#6b7280", marginBottom: 16 }}>URLを入力して記事本文を要約します。</p>
        <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
          <input
            type="url"
            inputMode="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={onKeyDown}
            style={{
              flex: 1,
              padding: "10px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              outline: "none"
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 16px",
              background: loading ? "#9ca3af" : "#111827",
              color: "#fff",
              borderRadius: 8,
              border: "none",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "要約中..." : "要約する"}
          </button>
        </form>

        {summary && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: "#f3f4f6",
            borderRadius: 8,
            whiteSpace: "pre-wrap"
          }}>
            {summary}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 8
          }}>
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
