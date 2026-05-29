import { useState } from "react";
import { FONT_LINK } from "../constants";
import { globalResetStyle } from "../styles";
import { CloseIcon } from "./Icons";
import { authFetch } from "../utils/authFetch";

export default function GeminiKeyModal({ onSuccess }) {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState(null); // { type: 'saving' | 'error' | 'success', message, detail? }

  const submit = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setStatus({ type: "error", message: "API key required" });
      return;
    }
    setStatus({ type: "saving", message: "Saving key…" });
    try {
      const res = await authFetch("/config/gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", message: "Key saved" });
        setTimeout(() => onSuccess && onSuccess(), 400);
      } else {
        setStatus({
          type: "error",
          message: "Save failed",
          detail: data.detail || res.statusText,
        });
      }
    } catch (err) {
      setStatus({ type: "error", message: "Network error", detail: err.message });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !(status && status.type === "saving")) {
      submit();
    }
  };

  const saving = status && status.type === "saving";

  return (
    <>
      <style>{globalResetStyle}</style>
      <link href={FONT_LINK} rel="stylesheet" />
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.75)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000,
          padding: 20,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div
          style={{
            background: "#111114",
            border: "1px solid #2a2a30",
            borderRadius: 14,
            padding: 32,
            maxWidth: 480,
            width: "100%",
            color: "#e8e8ec",
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#64646c",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Configuration Required
          </div>

          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Gemini API Key
          </div>

          <p style={{ fontSize: 13, color: "#b0b0b8", lineHeight: 1.7, margin: "0 0 20px 0" }}>
            A Gemini API key is required to process items. Enter your key below to continue. 
            This will be stored on your computer and only sent to Google to use their Gemini AI.
            <br /><br />
            Get a Gemini API key at{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#a0a0ff", textDecoration: "none" }}
              onMouseEnter={(e) => (e.target.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.target.style.textDecoration = "none")}
            >
              aistudio.google.com/apikey
            </a>.
          </p>

          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: "#64646c",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            API Key
          </div>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="API Key ..."
            disabled={saving}
            autoFocus
            style={{
              width: "100%",
              padding: "11px 14px",
              background: "#16161a",
              border: "1px solid #2a2a30",
              borderRadius: 10,
              color: "#e8e8ec",
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#4a4a55")}
            onBlur={(e) => (e.target.style.borderColor = "#2a2a30")}
          />

          {/* Status banner */}
          {status && (
            <div
              style={{
                marginTop: 16,
                padding: "12px 16px",
                borderRadius: 10,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                fontSize: 13,
                lineHeight: 1.55,
                background:
                  status.type === "saving" ? "rgba(160,160,255,0.08)" :
                  status.type === "success" ? "rgba(80,200,120,0.08)" :
                  "rgba(255,77,77,0.08)",
                border: `1px solid ${
                  status.type === "saving" ? "rgba(160,160,255,0.25)" :
                  status.type === "success" ? "rgba(80,200,120,0.25)" :
                  "rgba(255,77,77,0.25)"
                }`,
                color:
                  status.type === "saving" ? "#c0c0ff" :
                  status.type === "success" ? "#6ece8a" :
                  "#ff6b6b",
              }}
            >
              {status.type === "saving" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1, animation: "spin 1s linear infinite" }}>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07-2.83 2.83M9.76 14.24l-2.83 2.83m0-10.14 2.83 2.83m4.48 4.48 2.83 2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              {status.type === "success" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {status.type === "error" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 8v5m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>{status.message}</div>
                {status.detail && (
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{status.detail}</div>
                )}
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={submit}
            disabled={!key.trim() || saving}
            style={{
              marginTop: 20,
              width: "100%",
              padding: "13px 0",
              background: key.trim() && !saving ? "#e8e8ec" : "#2a2a30",
              color: key.trim() && !saving ? "#0a0a0b" : "#64646c",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: key.trim() && !saving ? "pointer" : "default",
              transition: "all 0.2s",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving…" : "Save and Continue"}
          </button>
        </div>
      </div>
    </>
  );
}