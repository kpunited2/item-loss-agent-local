import { CloseIcon } from "./Icons";

export default function LegalModal({ title, content, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeIn 0.2s ease",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .legal-scroll::-webkit-scrollbar { width: 6px; }
        .legal-scroll::-webkit-scrollbar-track { background: transparent; }
        .legal-scroll::-webkit-scrollbar-thumb { background: #2a2a30; border-radius: 3px; }
        .legal-scroll::-webkit-scrollbar-thumb:hover { background: #4a4a55; }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "85vh",
          background: "#111114",
          border: "1px solid #1e1e22",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          animation: "slideUp 0.25s ease",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px",
            borderBottom: "1px solid #1e1e22",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "#e8e8ec", letterSpacing: "0.02em" }}>{title}</div>
          <button
            onClick={onClose}
            style={{
              background: "#1e1e22",
              border: "none",
              borderRadius: 8,
              color: "#b0b0b8",
              cursor: "pointer",
              padding: "6px 8px",
              display: "flex",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2a30")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#1e1e22")}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Modal body */}
        <div
          className="legal-scroll"
          style={{
            padding: "24px 28px",
            overflowY: "auto",
            flex: 1,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {content.map((item, i) => {
            if (item.type === "h1")
              return (
                <div key={i} style={{ fontSize: 20, fontWeight: 700, color: "#e8e8ec", textAlign: "center", marginBottom: 4 }}>
                  {item.text}
                </div>
              );
            if (item.type === "subtitle")
              return (
                <div key={i} style={{ fontSize: 13, color: "#64646c", fontStyle: "italic", textAlign: "center", marginBottom: 2 }}>
                  {item.text}
                </div>
              );
            if (item.type === "date")
              return (
                <div key={i} style={{ fontSize: 12, color: "#4a4a55", textAlign: "center", marginBottom: 24 }}>
                  {item.text}
                </div>
              );
            if (item.type === "h2")
              return (
                <div key={i} style={{ fontSize: 14, fontWeight: 700, color: "#e8e8ec", marginTop: 22, marginBottom: 8 }}>
                  {item.text}
                </div>
              );
            if (item.type === "h3")
              return (
                <div key={i} style={{ fontSize: 13, fontWeight: 600, color: "#b0b0b8", marginTop: 14, marginBottom: 6 }}>
                  {item.text}
                </div>
              );
            if (item.type === "li")
              return (
                <div key={i} style={{ fontSize: 13, color: "#9a9aa4", lineHeight: 1.65, paddingLeft: 18, marginBottom: 4, position: "relative" }}>
                  <span style={{ position: "absolute", left: 4, color: "#4a4a55" }}>{"\u2022"}</span>
                  {item.text}
                </div>
              );
            return (
              <div key={i} style={{ fontSize: 13, color: "#9a9aa4", lineHeight: 1.65, marginBottom: 10 }}>
                {item.text}
              </div>
            );
          })}
        </div>

        {/* Modal footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #1e1e22", flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: "11px 0",
              background: "#e8e8ec",
              color: "#0a0a0b",
              border: "none",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}