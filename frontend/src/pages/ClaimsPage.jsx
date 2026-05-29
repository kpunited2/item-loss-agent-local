import { useState, useEffect } from "react";
import { FONT_LINK } from "../constants";
import { globalResetStyle } from "../styles";
import { authFetch } from "../utils/authFetch";

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function ClaimsPage({
  setPage,
  setActiveClaim,
}) {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add claim modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClaimTitle, setNewClaimTitle] = useState("");
  const [addingClaim, setAddingClaim] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    const fetchClaims = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`/get_claims_and_inventory/`);
        const data = await res.json();
        if (res.ok) {
          setClaims(data.claims || []);
        } else {
          setError(data.message || "Failed to load claims.");
        }
      } catch (err) {
        setError("Network error: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchClaims();
  }, []);

  const handleAddClaim = async () => {
    if (!newClaimTitle.trim()) return;
    setAddingClaim(true);
    setAddError("");
    try {
      const res = await authFetch(`/add_claim/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newClaimTitle.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAddModal(false);
        setNewClaimTitle("");
        // Re-fetch claims
        const r2 = await authFetch(`/get_claims_and_inventory/`);
        const d2 = await r2.json();
        if (r2.ok) setClaims(d2.claims || []);
      } else {
        setAddError(data.message || data.detail || "Failed to add claim.");
      }
    } catch (err) {
      setAddError("Network error: " + err.message);
    } finally {
      setAddingClaim(false);
    }
  };

  const handleClaimClick = (claim) => {
    setActiveClaim(claim);
    setPage("main");
  };

  return (
    <>
      <style>{globalResetStyle}</style>
      <link href={FONT_LINK} rel="stylesheet" />
      <div
        style={{
          minHeight: "100vh",
          background: "#0a0a0b",
          display: "flex",
          justifyContent: "center",
          padding: "40px 16px",
          fontFamily: "'DM Sans', sans-serif",
          color: "#e8e8ec",
        }}
      >
        <div style={{ width: "100%", maxWidth: 720 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>Item Loss Agent</div>
          </div>

          {/* Title row + Add Claim button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Your Claims</div>
            <button
              onClick={() => { setShowAddModal(true); setAddError(""); setNewClaimTitle(""); }}
              style={{
                padding: "9px 20px",
                background: "rgba(160,160,255,0.1)",
                border: "1px solid rgba(160,160,255,0.3)",
                borderRadius: 9,
                color: "#a0a0ff",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              + Add Claim
            </button>
          </div>

          {/* Instructions */}
          <div
            style={{
              background: "rgba(160,160,255,0.05)",
              border: "1px solid rgba(160,160,255,0.15)",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 16,
              fontSize: 13,
              lineHeight: 1.6,
              color: "#9a9aa4",
            }}
          >
            Use this page to view existing claims, your inventory of items, and add new claims. Click on a claim or inventory to add items or view the items already included.
          </div>

          {/* Claims Table */}
          <div
            style={{
              background: "#111114",
              border: "1px solid #1e1e22",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                padding: "12px 20px",
                borderBottom: "1px solid #1e1e22",
                fontSize: 11,
                fontWeight: 600,
                color: "#4a4a55",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}
            >
              <div>Title</div>
              <div style={{ textAlign: "right" }}>Total Value</div>
              <div style={{ textAlign: "right" }}>Created</div>
              <div style={{ textAlign: "right" }}>Last Updated</div>
            </div>

            {/* Table body */}
            {loading && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#4a4a55", fontSize: 13 }}>
                Loading claims…
              </div>
            )}
            {!loading && error && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#ff6b6b", fontSize: 13 }}>
                {error}
              </div>
            )}
            {!loading && !error && claims.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#4a4a55", fontSize: 13 }}>
                No claims yet. Click "+ Add Claim" to get started.
              </div>
            )}
            {!loading && !error && claims.map((claim, i) => (
              <div
                key={claim.doc_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  padding: "16px 20px",
                  borderBottom: i < claims.length - 1 ? "1px solid #16161a" : "none",
                  alignItems: "center",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#16161a")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div>
                  <span
                    onClick={() => handleClaimClick(claim)}
                    style={{
                      color: "#a0a0ff",
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: "pointer",
                      textDecoration: "none",
                      borderBottom: "1px solid transparent",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = "#a0a0ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
                  >
                    {claim.title}
                  </span>
                </div>
                <div style={{ textAlign: "right", fontSize: 13, color: "#9a9aa4" }}>
                  {formatCurrency(claim.total_value)}
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: "#64646c" }}>
                  {formatDate(claim.date_created)}
                </div>
                <div style={{ textAlign: "right", fontSize: 12, color: "#64646c" }}>
                  {formatDate(claim.date_last_updated)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Claim Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div
            style={{
              background: "#111114",
              border: "1px solid #2a2a30",
              borderRadius: 16,
              padding: 32,
              width: "100%",
              maxWidth: 400,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: "#e8e8ec" }}>New Claim</div>
            <input
              type="text"
              placeholder="Claim title"
              value={newClaimTitle}
              onChange={(e) => setNewClaimTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddClaim()}
              autoFocus
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "#16161a",
                border: `1px solid ${addError ? "#ff4d4d" : "#2a2a30"}`,
                borderRadius: 10,
                color: "#e8e8ec",
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#4a4a55")}
              onBlur={(e) => (e.target.style.borderColor = addError ? "#ff4d4d" : "#2a2a30")}
            />
            {addError && (
              <div style={{ color: "#ff6b6b", fontSize: 12, marginTop: 8 }}>{addError}</div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  background: "none",
                  border: "1px solid #2a2a30",
                  borderRadius: 10,
                  color: "#64646c",
                  fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddClaim}
                disabled={!newClaimTitle.trim() || addingClaim}
                style={{
                  flex: 2,
                  padding: "11px 0",
                  background: newClaimTitle.trim() ? "#e8e8ec" : "#2a2a30",
                  color: newClaimTitle.trim() ? "#0a0a0b" : "#64646c",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: newClaimTitle.trim() && !addingClaim ? "pointer" : "default",
                  transition: "all 0.2s",
                  opacity: addingClaim ? 0.6 : 1,
                }}
              >
                {addingClaim ? "Saving…" : "Save Claim"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}