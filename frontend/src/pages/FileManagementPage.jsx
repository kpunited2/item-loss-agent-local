import { useRef, useCallback, useState, useEffect } from "react";
import { FONT_LINK } from "../constants";
import { globalResetStyle, radioStyle, radioDotOuter, radioDotInner } from "../styles";
import { UploadIcon, FileIcon, CloseIcon, TableIcon } from "../components/Icons";
import { formatSize } from "../utils";
import { authFetch } from "../utils/authFetch";
import { QRCodeSVG } from "qrcode.react";

export default function FileManagementPage({
  setPage,
  setAddedContext: setAddedContextParent,
  valueType,
  setValueType,
  uploadType,
  setUploadType,
  addedContext,
  setAddedContext,
  contextSaving,
  setContextSaving,
  itemsLoading,
  handleFetchItems,
  activeClaim,
}) {
  // ── All hooks first — none may appear after an early return ──
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [descriptionText, setDescriptionText] = useState("");
  const [descriptionStatus, setDescriptionStatus] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [roomTypes, setRoomTypes] = useState([]);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const fetchAddedContext = async () => {
      try {
        const res = await authFetch(`/get_added_context/${encodeURIComponent(activeClaim?.doc_id ?? "")}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setAddedContext(data.message);
        }
      } catch (err) {
        console.error("Failed to fetch added context:", err);
      }
    };
    fetchAddedContext();
  }, []);

  useEffect(() => {
    setUploadType("Item Image");
  }, []);

  // Fetch the LAN IP from the backend so we can build a QR URL that
  // points at the frontend from a phone on the same network.
  useEffect(() => {
    const fetchLocalIp = async () => {
      try {
        const res = await authFetch("/get_local_network_ip");
        const data = await res.json();
        if (res.ok && data.ip) {
          const port = window.location.port ? `:${window.location.port}` : "";
          setQrUrl(`${window.location.protocol}//${data.ip}${port}`);
          setQrError("");
        } else {
          setQrError("Could not determine local network IP.");
        }
      } catch (err) {
        setQrError("Network error while fetching local IP.");
        console.error("Failed to fetch local IP:", err);
      }
    };
    fetchLocalIp();
  }, []);

  // Fetch available room types for the per-file room dropdown
  useEffect(() => {
    const fetchRoomTypes = async () => {
      try {
        const res = await authFetch("/get_room_types");
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          setRoomTypes(data);
        }
      } catch (err) {
        console.error("Failed to fetch room types:", err);
      }
    };
    fetchRoomTypes();
  }, []);

  // useCallback is a hook — must live here, before any early return
  const addFiles = useCallback((newFiles) => {
    const fileArray = Array.from(newFiles).map((f) => ({
      name: f.name,
      size: f.size,
      file: f,
      notes: "",
      room: "unassigned",
      quantity: 1,
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
    }));
    setFiles((prev) => [...prev, ...fileArray]);
  }, []);

  // ── Early return — only reached after every hook above has run ──
  if (!activeClaim) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0b", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#64646c", fontSize: 14, marginBottom: 16 }}>No claim selected.</div>
          <button
            onClick={() => setPage("claims")}
            style={{ padding: "9px 20px", background: "#2a2a30", border: "1px solid #3a3a44", borderRadius: 9, color: "#a0a0ff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
          >
            Back to Claims
          </button>
        </div>
      </div>
    );
  }

  // ── Regular functions (not hooks) — safe after the early return ──
  const removeFile = (id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFileNotes = (id, notes) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, notes } : f)));
  };

  const updateFileRoom = (id, room) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, room } : f)));
  };

  const updateFileQuantity = (id, quantity) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, quantity } : f)));
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleUpload = async () => {
    if (!files.length || (uploadStatus && uploadStatus.type === "uploading")) return;
    setUploadStatus({ type: "uploading", message: `Uploading ${files.length} file${files.length > 1 ? "s" : ""}…` });
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f.file));
    files.forEach((f) => formData.append("notes", f.notes || ""));
    files.forEach((f) => formData.append("rooms", f.room || "unassigned"));
    files.forEach((f) => formData.append("quantities", String(f.quantity || 1)));
    try {
      const res = await authFetch(
        `/upload/${encodeURIComponent(activeClaim?.doc_id ?? "")}?value_type=${encodeURIComponent("actuals")}&upload_type=${encodeURIComponent(uploadType)}`,
        { method: "POST", body: formData }
      );
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (res.ok) {
        const errCount = data.errors?.length || 0;
        setUploadStatus({
          type: "success",
          message: data.message || "Upload complete",
          detail: errCount > 0 ? `${errCount} file${errCount > 1 ? "s" : ""} failed: ${data.errors.map(e => e.filename).join(", ")}` : null,
        });
        setFiles([]);
        setTimeout(() => setUploadStatus(null), 60000);
      } else if (res.status === 403) {
        setUploadStatus({
          type: "error",
          message: data.message || "Item limit for account reached. Items cannot be processed.",
        });
      } else {
        setUploadStatus({
          type: "error",
          message: "Upload failed",
          detail: data.detail?.message || data.detail || res.statusText,
        });
      }
    } catch (err) {
      setUploadStatus({ type: "error", message: "Network error", detail: err.message });
    }
  };

  const handleSaveContext = async () => {
    setContextSaving(true);
    try {
      const res = await authFetch(
        `/write_added_context/${encodeURIComponent(activeClaim?.doc_id ?? "")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ added_context: addedContext }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Context saved");
      } else {
        alert("Save failed: " + (data.detail || res.statusText));
      }
    } catch (err) {
      alert("Network error: " + err.message);
    } finally {
      setContextSaving(false);
    }
  };

  const handleUploadDescriptions = async () => {
    if (!descriptionText.trim() || (descriptionStatus && descriptionStatus.type === "uploading")) return;
    setDescriptionStatus({ type: "uploading", message: "Uploading text descriptions…" });
    try {
      const res = await authFetch(
        `/upload_text_descriptions/${encodeURIComponent(activeClaim?.doc_id ?? "")}?value_type=${encodeURIComponent("actuals")}&description_text=${encodeURIComponent(descriptionText.trim())}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (res.ok) {
        setDescriptionStatus({ type: "success", message: data.message || "Descriptions saved" });
        setDescriptionText("");
        setTimeout(() => setDescriptionStatus(null), 60000);
      } else if (res.status === 403) {
        setDescriptionStatus({
          type: "error",
          message: data.message || "Item limit for account reached. Items cannot be processed.",
        });
      } else {
        setDescriptionStatus({
          type: "error",
          message: "Upload failed",
          detail: data.message || data.detail || res.statusText,
        });
      }
    } catch (err) {
      setDescriptionStatus({ type: "error", message: "Network error", detail: err.message });
    }
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
        <div style={{ width: "100%", maxWidth: 520 }}>

          {/* ── Header ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>File Management for Claim: {activeClaim?.title || "—"}</div>
            <button
              onClick={() => setPage("claims")}
              style={{
                background: "none",
                border: "1px solid #2a2a30",
                borderRadius: 8,
                color: "#64646c",
                padding: "6px 14px",
                fontSize: 12,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              ← Back
            </button>
          </div>

          {/* ── Instructions Block ── */}
          <div
            style={{
              background: "#111114",
              border: "1px solid #1e1e22",
              borderRadius: 14,
              padding: 28,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "#64646c",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Instructions
            </div>
            <p style={{ fontSize: 13, color: "#b0b0b8", lineHeight: 1.7, margin: "0 0 14px 0" }}>
              Upload photos, receipts, or audio descriptions of your lost or damaged items.
              <br /><br />
              Our platform will automatically identify and value each item, building a detailed report
              ready to submit with your claim. If possible, include the brand, model, or type of the item in any images or descriptions.
              <br /><br />
              Make sure to add additional details about the kinds of places you shop and the items you own. This will help the AI narrow down the search for comparable items.
              <br /><br />
              Please note that the system may struggle with some items like art and jewelery. Professional appraisal is reccomended to get the best estimates of value for such items.
            </p>
          </div>

          {/* ── View Items Section ── */}
          <div
            style={{
              background: "#111114",
              border: "1px solid #1e1e22",
              borderRadius: 14,
              padding: 28,
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <TableIcon />
              <div style={{ fontSize: 16, fontWeight: 600 }}>View Items for Claim: {activeClaim.title}</div>
            </div>
            <div style={{ fontSize: 12, color: "#9a9aa4", marginBottom: 20, lineHeight: 1.6 }}>
              View and manage the items that have been identified from your uploads.
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => handleFetchItems("actuals")}
                disabled={itemsLoading}
                style={{
                  flex: 1,
                  padding: "13px 0",
                  background: "rgba(160,160,255,0.06)",
                  border: "1px solid rgba(160,160,255,0.2)",
                  borderRadius: 10,
                  color: "#a0a0ff",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: itemsLoading ? "default" : "pointer",
                  transition: "all 0.2s",
                  opacity: itemsLoading ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { if (!itemsLoading) e.currentTarget.style.background = "rgba(160,160,255,0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(160,160,255,0.06)"; }}
              >
                Results
              </button>
            </div>
            {itemsLoading && (
              <div style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "#64646c" }}>Loading…</div>
            )}
          </div>

          {/* ── Link Phone on WiFi ── */}
          <div
            style={{
              background: "#111114",
              border: "1px solid #1e1e22",
              borderRadius: 14,
              padding: 28,
              marginBottom: 20,
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
              Link Phone on WiFi
            </div>
            <p style={{ fontSize: 13, color: "#b0b0b8", lineHeight: 1.7, margin: "0 0 16px 0" }}>
              If your phone and computer are on the same network, connect your phone to upload or take pictures by following this link and scanning the QR code.
            </p>
            <button
              onClick={() => setShowQrModal(true)}
              disabled={!qrUrl}
              style={{
                width: "100%",
                padding: "13px 0",
                background: qrUrl ? "rgba(160,160,255,0.06)" : "#2a2a30",
                border: `1px solid ${qrUrl ? "rgba(160,160,255,0.2)" : "#2a2a30"}`,
                borderRadius: 10,
                color: qrUrl ? "#a0a0ff" : "#64646c",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: qrUrl ? "pointer" : "default",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { if (qrUrl) e.currentTarget.style.background = "rgba(160,160,255,0.12)"; }}
              onMouseLeave={(e) => { if (qrUrl) e.currentTarget.style.background = "rgba(160,160,255,0.06)"; }}
            >
              {qrUrl ? "Show QR Code" : "Loading…"}
            </button>
            {qrError && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#ff6b6b" }}>{qrError}</div>
            )}
          </div>

          {/* ── File Upload Portal ── */}
          <div
            style={{
              background: "#111114",
              border: "1px solid #1e1e22",
              borderRadius: 14,
              padding: 28,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 24 }}>File Upload Portal</div>

            {/* Upload Type radio buttons */}
            <div style={{ marginBottom: 24 }}>
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
                Upload Type
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { value: "Item Image", label: "Item Images" },
                  { value: "Receipt", label: "Receipts" },
                  { value: "Audio File", label: "Voice Memos" },
                ].map((opt) => (
                  <label key={opt.value} onClick={() => setUploadType(opt.value)} style={radioStyle(uploadType === opt.value)}>
                    <div style={radioDotOuter(uploadType === opt.value)}>
                      {uploadType === opt.value && <div style={radioDotInner} />}
                    </div>
                    <span style={{ fontSize: 13, color: "#b0b0b8" }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "#a0a0ff" : "#2a2a30"}`,
                borderRadius: 14,
                padding: "48px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                cursor: "pointer",
                background: dragging ? "rgba(160,160,255,0.04)" : "transparent",
                transition: "all 0.2s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <UploadIcon />
              <div style={{ fontSize: 14, fontWeight: 500, color: "#b0b0b8" }}>Drag & drop files here.</div>
              <div style={{ fontSize: 12, color: "#4a4a55", textAlign: "center" }}>
                Click to browse or take a picture if on a mobile device
              </div>
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {files.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      padding: "10px 14px",
                      background: "#16161a",
                      borderRadius: 10,
                      border: "1px solid #2a2a30",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <FileIcon />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#b0b0b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#4a4a55", flexShrink: 0 }}>{formatSize(f.size)}</div>
                      <button
                        onClick={() => removeFile(f.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#4a4a55",
                          cursor: "pointer",
                          padding: 4,
                          borderRadius: 6,
                          display: "flex",
                          transition: "background 0.15s",
                        }}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={f.notes}
                      onChange={(e) => updateFileNotes(f.id, e.target.value)}
                      placeholder="Add notes for this file (e.g. brand, model, where purchased)"
                      style={{
                        width: "100%",
                        marginTop: 8,
                        padding: "7px 10px",
                        background: "#111114",
                        border: "1px solid #2a2a30",
                        borderRadius: 7,
                        color: "#e8e8ec",
                        fontSize: 12,
                        fontFamily: "'DM Sans', sans-serif",
                        outline: "none",
                        boxSizing: "border-box",
                        transition: "border-color 0.2s",
                      }}
                      onFocus={(e) => (e.target.style.borderColor = "#4a4a55")}
                      onBlur={(e) => (e.target.style.borderColor = "#2a2a30")}
                    />

                    {/* Room + Quantity row */}
                    <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                        <label style={{ fontSize: 10, color: "#64646c", letterSpacing: "0.04em", textTransform: "uppercase" }}>Room</label>
                        <select
                          value={f.room}
                          onChange={(e) => updateFileRoom(f.id, e.target.value)}
                          style={{
                            width: "100%",
                            padding: "7px 10px",
                            background: "#111114",
                            border: "1px solid #2a2a30",
                            borderRadius: 7,
                            color: "#e8e8ec",
                            fontSize: 12,
                            fontFamily: "'DM Sans', sans-serif",
                            outline: "none",
                            cursor: "pointer",
                            boxSizing: "border-box",
                            appearance: "none",
                            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364646c' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>")`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "right 10px center",
                            paddingRight: 28,
                          }}
                        >
                          {roomTypes.length === 0 ? (
                            <option value="unassigned">Unassigned</option>
                          ) : (
                            roomTypes.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))
                          )}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 90 }}>
                        <label style={{ fontSize: 10, color: "#64646c", letterSpacing: "0.04em", textTransform: "uppercase" }}>Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={f.quantity}
                          onChange={(e) => updateFileQuantity(f.id, Math.max(1, parseInt(e.target.value) || 1))}
                          style={{
                            width: "100%",
                            padding: "7px 10px",
                            background: "#111114",
                            border: "1px solid #2a2a30",
                            borderRadius: 7,
                            color: "#e8e8ec",
                            fontSize: 12,
                            fontFamily: "'DM Sans', sans-serif",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload status banner */}
            {uploadStatus && (
              <div
                style={{
                  marginTop: 20,
                  padding: "14px 18px",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  fontSize: 13,
                  lineHeight: 1.55,
                  background:
                    uploadStatus.type === "uploading" ? "rgba(160,160,255,0.08)" :
                    uploadStatus.type === "success" ? "rgba(80,200,120,0.08)" :
                    "rgba(255,77,77,0.08)",
                  border: `1px solid ${
                    uploadStatus.type === "uploading" ? "rgba(160,160,255,0.25)" :
                    uploadStatus.type === "success" ? "rgba(80,200,120,0.25)" :
                    "rgba(255,77,77,0.25)"
                  }`,
                  color:
                    uploadStatus.type === "uploading" ? "#c0c0ff" :
                    uploadStatus.type === "success" ? "#6ece8a" :
                    "#ff6b6b",
                }}
              >
                {uploadStatus.type === "uploading" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1, animation: "spin 1s linear infinite" }}>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07-2.83 2.83M9.76 14.24l-2.83 2.83m0-10.14 2.83 2.83m4.48 4.48 2.83 2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                {uploadStatus.type === "success" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {uploadStatus.type === "error" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 8v5m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{uploadStatus.message}</div>
                  {uploadStatus.type === "uploading" && (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Please do not close or leave this page until the upload is complete.
                    </div>
                  )}
                  {uploadStatus.detail && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{uploadStatus.detail}</div>
                  )}
                </div>
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={!files.length || (uploadStatus && uploadStatus.type === "uploading")}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "13px 0",
                background: files.length && !(uploadStatus && uploadStatus.type === "uploading") ? "#e8e8ec" : "#2a2a30",
                color: files.length && !(uploadStatus && uploadStatus.type === "uploading") ? "#0a0a0b" : "#64646c",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: files.length && !(uploadStatus && uploadStatus.type === "uploading") ? "pointer" : "default",
                transition: "all 0.2s",
                opacity: uploadStatus && uploadStatus.type === "uploading" ? 0.5 : 1,
              }}
            >
              {uploadStatus && uploadStatus.type === "uploading" ? "Uploading…" : "Upload"}
            </button>
          </div>

          {/* ── Text Descriptions Section ── */}
          <div
            style={{
              background: "#111114",
              border: "1px solid #1e1e22",
              borderRadius: 14,
              padding: 28,
              marginTop: 20,
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
              Text Descriptions
            </div>
            <div
              style={{
                maxHeight: 320,
                overflowY: "auto",
                borderRadius: 10,
                border: "1px solid #2a2a30",
                background: "#16161a",
              }}
            >
              <textarea
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                placeholder={"For any belongings you don't have images or receipts for, enter text descriptions of the lost or damaged items here.\n\nBe as specific as possible — include brand names, models, materials, and where you purchased them.\n\nThe more detail you provide, the better we can identify comparable items and determine accurate.\n\nExample:\n- Brown leather recliner from Nebraska Furniture Mart\n- Nike Air Max 270, men's size 11, back and white"}
                style={{
                  width: "100%",
                  minHeight: 280,
                  padding: "14px 16px",
                  background: "transparent",
                  border: "none",
                  color: "#e8e8ec",
                  fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.6,
                  letterSpacing: "0.02em",
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Description upload status banner */}
            {descriptionStatus && (
              <div
                style={{
                  marginTop: 16,
                  padding: "14px 18px",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  fontSize: 13,
                  lineHeight: 1.55,
                  background:
                    descriptionStatus.type === "uploading" ? "rgba(160,160,255,0.08)" :
                    descriptionStatus.type === "success" ? "rgba(80,200,120,0.08)" :
                    "rgba(255,77,77,0.08)",
                  border: `1px solid ${
                    descriptionStatus.type === "uploading" ? "rgba(160,160,255,0.25)" :
                    descriptionStatus.type === "success" ? "rgba(80,200,120,0.25)" :
                    "rgba(255,77,77,0.25)"
                  }`,
                  color:
                    descriptionStatus.type === "uploading" ? "#c0c0ff" :
                    descriptionStatus.type === "success" ? "#6ece8a" :
                    "#ff6b6b",
                }}
              >
                {descriptionStatus.type === "uploading" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1, animation: "spin 1s linear infinite" }}>
                    <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-5.07-2.83 2.83M9.76 14.24l-2.83 2.83m0-10.14 2.83 2.83m4.48 4.48 2.83 2.83" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                {descriptionStatus.type === "success" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {descriptionStatus.type === "error" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 8v5m0 3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{descriptionStatus.message}</div>
                  {descriptionStatus.type === "uploading" && (
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      Please do not close or leave this page until the upload is complete.
                    </div>
                  )}
                  {descriptionStatus.detail && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{descriptionStatus.detail}</div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleUploadDescriptions}
              disabled={!descriptionText.trim() || (descriptionStatus && descriptionStatus.type === "uploading")}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "13px 0",
                background: descriptionText.trim() && !(descriptionStatus && descriptionStatus.type === "uploading") ? "#e8e8ec" : "#2a2a30",
                color: descriptionText.trim() && !(descriptionStatus && descriptionStatus.type === "uploading") ? "#0a0a0b" : "#64646c",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: descriptionText.trim() && !(descriptionStatus && descriptionStatus.type === "uploading") ? "pointer" : "default",
                transition: "all 0.2s",
                opacity: descriptionStatus && descriptionStatus.type === "uploading" ? 0.5 : 1,
              }}
            >
              {descriptionStatus && descriptionStatus.type === "uploading" ? "Uploading…" : "Upload Text Description"}
            </button>
          </div>

          {/* ── Added Context Section ── */}
          <div
            style={{
              background: "#111114",
              border: "1px solid #1e1e22",
              borderRadius: 14,
              padding: 28,
              marginTop: 20,
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
              General Context for All Images or Descriptions
            </div>
            <textarea
              value={addedContext}
              onChange={(e) => setAddedContext(e.target.value)}
              placeholder="Add any additional general context about your shopping habits that may help with identifying all of items in the images or descriptions. Information about the gender of clothing items, the types of stores and retailers you shop at, or the types of items you purchase (antiques, handmade/craft items, designer, etc.). For context about specific items, you can add notes for each item uploaded."
              style={{
                width: "100%",
                minHeight: 160,
                padding: "14px 16px",
                background: "#16161a",
                border: "1px solid #2a2a30",
                borderRadius: 10,
                color: "#e8e8ec",
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                lineHeight: 1.6,
                letterSpacing: "0.02em",
                outline: "none",
                resize: "vertical",
                transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#4a4a55")}
              onBlur={(e) => (e.target.style.borderColor = "#2a2a30")}
            />
            <button
              onClick={handleSaveContext}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "13px 0",
                background: "#e8e8ec",
                color: "#0a0a0b",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                transition: "all 0.2s",
                opacity: contextSaving ? 0.6 : 1,
              }}
            >
              {contextSaving ? "Saving…" : "Save Context"}
            </button>
          </div>

          {/* ── QR Code Modal ── */}
          {showQrModal && qrUrl && (
            <div
              onClick={() => setShowQrModal(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 20,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "#111114",
                  border: "1px solid #2a2a30",
                  borderRadius: 14,
                  padding: 32,
                  maxWidth: 360,
                  width: "100%",
                  textAlign: "center",
                  position: "relative",
                }}
              >
                <button
                  onClick={() => setShowQrModal(false)}
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    background: "none",
                    border: "none",
                    color: "#64646c",
                    cursor: "pointer",
                    padding: 6,
                    display: "flex",
                  }}
                >
                  <CloseIcon />
                </button>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "#e8e8ec" }}>
                  Scan to open on phone.<br />
                  Must be on the same WiFi network as the computer.
                </div>
                <div style={{ fontSize: 12, color: "#64646c", marginBottom: 20, wordBreak: "break-all" }}>
                  {qrUrl}
                </div>
                <div
                  style={{
                    background: "#fff",
                    padding: 16,
                    borderRadius: 10,
                    display: "inline-block",
                  }}
                >
                  <QRCodeSVG value={qrUrl} size={240} level="M" />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}