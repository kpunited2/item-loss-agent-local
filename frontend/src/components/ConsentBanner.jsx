import { useState } from "react";
import LegalModal from "./LegalModal";
import { ShieldIcon } from "./Icons";
import { TERMS_CONTENT, PRIVACY_CONTENT } from "../constants";

export default function ConsentBanner({ onAccept, accepted }) {
  const [showModal, setShowModal] = useState(null);
  const [checked, setChecked] = useState(false);

  if (accepted) return null;

  return (
    <>
      {showModal === "terms" && <LegalModal title="Terms of Use" content={TERMS_CONTENT} onClose={() => setShowModal(null)} />}
      {showModal === "privacy" && <LegalModal title="Privacy Policy" content={PRIVACY_CONTENT} onClose={() => setShowModal(null)} />}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 900,
          background: "linear-gradient(to top, rgba(10,10,11,0.98) 70%, rgba(10,10,11,0))",
          padding: "48px 16px 0",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            margin: "0 auto",
            background: "#16161a",
            border: "1px solid #2a2a30",
            borderRadius: 14,
            padding: "22px 24px",
            pointerEvents: "auto",
            marginBottom: 20,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              <ShieldIcon />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e8e8ec", marginBottom: 6 }}>
                Terms of Use & Privacy Policy
              </div>
              <div style={{ fontSize: 12.5, color: "#9a9aa4", lineHeight: 1.6 }}>
                Before using this service, please review and accept our{" "}
                <button
                  onClick={() => setShowModal("terms")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#a0a0ff",
                    fontSize: 12.5,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  Terms of Use
                </button>{" "}
                and{" "}
                <button
                  onClick={() => setShowModal("privacy")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#a0a0ff",
                    fontSize: 12.5,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  Privacy Policy
                </button>
                . Your uploaded data will be processed to assist with your property loss claim.
              </div>
            </div>
          </div>

          {/* Checkbox + Accept */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label
              style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}
              onClick={() => setChecked(!checked)}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  border: `2px solid ${checked ? "#a0a0ff" : "#4a4a55"}`,
                  background: checked ? "rgba(160,160,255,0.1)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.2s",
                }}
              >
                {checked && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l5 5L20 7" stroke="#a0a0ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 12.5, color: "#b0b0b8" }}>
                I have read and agree to the Terms of Use and Privacy Policy
              </span>
            </label>
            <button
              onClick={() => checked && onAccept()}
              style={{
                padding: "10px 24px",
                background: checked ? "#e8e8ec" : "#2a2a30",
                color: checked ? "#0a0a0b" : "#64646c",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: checked ? "pointer" : "default",
                transition: "all 0.2s",
                flexShrink: 0,
              }}
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </>
  );
}