import { Component } from "react";
import { authFetch } from "../utils/authFetch";
import { adminFetch } from "../utils/authFetch";

/**
 * ErrorBoundary
 * Catches unhandled JS errors in any child component tree and renders a
 * styled fallback instead of white-screening the app.
 *
 * Usage (main.jsx):
 *   import ErrorBoundary from "./components/ErrorBoundary";
 *   <ErrorBoundary>
 *     <BrowserRouter><App /></BrowserRouter>
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Surface to console so it still appears in logs / Sentry etc.
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleReload() {
    // Clear session so the user doesn't land in a broken state after reload.
    try {
      const SC_KEYS = [
        "sc_username",
        "sc_code",
        "sc_activeClaim",
        "sc_adminVerified",
        "sc_itemsResultsType",
        "sc_session_token",
        "sc_admin_token"
      ];
      SC_KEYS.forEach((k) => sessionStorage.removeItem(k));
    } catch (_) {}
    window.location.href = "/";
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const message =
      this.state.error?.message || "An unexpected error occurred.";

    return (
      <>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0a0a0b; }
        `}</style>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono&display=swap"
          rel="stylesheet"
        />
        <div
          style={{
            minHeight: "100vh",
            background: "#0a0a0b",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'DM Sans', sans-serif",
            color: "#e8e8ec",
            padding: 24,
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>⚠</div>

          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 8,
              letterSpacing: "0.01em",
            }}
          >
            Something went wrong
          </div>

          <div
            style={{
              fontSize: 13,
              color: "#64646c",
              marginBottom: 28,
              maxWidth: 400,
              lineHeight: 1.6,
            }}
          >
            The application encountered an unexpected error. Your session will
            be reset and you'll be returned to the login screen.
          </div>

          {/* Error detail — collapsed by default */}
          <details
            style={{
              marginBottom: 28,
              maxWidth: 480,
              width: "100%",
              textAlign: "left",
            }}
          >
            <summary
              style={{
                fontSize: 12,
                color: "#4a4a55",
                cursor: "pointer",
                letterSpacing: "0.04em",
                userSelect: "none",
                marginBottom: 8,
              }}
            >
              Error details
            </summary>
            <pre
              style={{
                padding: "12px 16px",
                background: "#111114",
                border: "1px solid #2a2a30",
                borderRadius: 10,
                color: "#b0b0b8",
                fontSize: 11,
                fontFamily: "'Space Mono', monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {message}
            </pre>
          </details>

          <button
            onClick={this.handleReload}
            style={{
              padding: "12px 32px",
              background: "#e8e8ec",
              color: "#0a0a0b",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Return to login
          </button>
        </div>
      </>
    );
  }
}