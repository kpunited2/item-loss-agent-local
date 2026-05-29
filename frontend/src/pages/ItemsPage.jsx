import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { FONT_LINK } from "../constants";
import { globalResetStyle } from "../styles";
import { BackIcon, CloseIcon, SaveIcon } from "../components/Icons";
import { authFetch } from "../utils/authFetch";

export default function ItemsPage({
  setPage,
  itemsResultsType,
  itemsData,
  itemsLoading,
  itemsError,
  itemsSaving,
  exporting,
  exportMessage,
  setExportMessage,
  handleExportItems,
  handleSaveAllItems,
  handleUpdateItemNotes,
  handleUpdateItemQuantity,
  handleUpdateItemRoom,
  handleDeleteItem,
  handleRetryItemSearch,
  handleMoveItem,
  claimOptions,
  activeClaim,
}) {
  const typeLabel = itemsResultsType === "actuals" ? "Actual Replacement Costs" : "Estimated Unreplaced Value";
  const [openMenuIndex, setOpenMenuIndex] = useState(null);
  const [moveSubmenuIndex, setMoveSubmenuIndex] = useState(null);
  const [moveRoomSubmenuIndex, setMoveRoomSubmenuIndex] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, text: "", x: 0, y: 0 });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [roomTypes, setRoomTypes] = useState([]);
  const [collapsedRooms, setCollapsedRooms] = useState({});
  const [collapseInit, setCollapseInit] = useState(false);
  const menuRef = useRef(null);

  // Fetch room types
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

  // Close action menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuIndex(null);
        setMoveSubmenuIndex(null);
        setMoveRoomSubmenuIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Build label lookup (value -> label) from fetched room types
  const roomLabelMap = useMemo(() => {
    const map = {};
    roomTypes.forEach((r) => { map[r.value] = r.label; });
    return map;
  }, [roomTypes]);

  // Format an unknown room value as a fallback label
  const formatRoomLabel = useCallback((value) => {
    if (!value) return "Unassigned";
    if (roomLabelMap[value]) return roomLabelMap[value];
    return String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }, [roomLabelMap]);

  // Group items by room. Unassigned first, then rooms with items in the order
  // returned by /get_room_types, then any rooms with items not in the enum.
  const grouped = useMemo(() => {
    const visibleItems = itemsData.filter((item) => !item.deleted);
    const byRoom = {};
    visibleItems.forEach((item) => {
      const key = item.room || "unassigned";
      if (!byRoom[key]) byRoom[key] = [];
      byRoom[key].push(item);
    });

    // Build ordered list of room keys
    const ordered = [];
    const seen = new Set();

    // Unassigned always first
    ordered.push("unassigned");
    seen.add("unassigned");

    // Then enum order
    roomTypes.forEach((r) => {
      if (r.value !== "unassigned" && !seen.has(r.value)) {
        ordered.push(r.value);
        seen.add(r.value);
      }
    });

    // Then any leftover rooms present on items but not in the enum
    Object.keys(byRoom).forEach((k) => {
      if (!seen.has(k)) {
        ordered.push(k);
        seen.add(k);
      }
    });

    return ordered.map((key) => ({
      key,
      label: formatRoomLabel(key),
      items: byRoom[key] || [],
    }));
  }, [itemsData, roomTypes, formatRoomLabel]);

  // Init collapse state once: empty rooms collapsed, rooms with items expanded
  useEffect(() => {
    if (collapseInit || itemsData.length === 0 || roomTypes.length === 0) return;
    const init = {};
    grouped.forEach((g) => { init[g.key] = g.items.length === 0; });
    setCollapsedRooms(init);
    setCollapseInit(true);
  }, [grouped, collapseInit]);

  const toggleRoom = (key) => {
    setCollapsedRooms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Wrapped handlers — flag unsaved changes
  const onUpdateItemNotes = useCallback((index, value) => {
    handleUpdateItemNotes(index, value);
    setHasUnsavedChanges(true);
  }, [handleUpdateItemNotes]);

  const onUpdateItemQuantity = useCallback((index, value) => {
    const qty = Math.max(1, parseInt(value) || 1);
    if (handleUpdateItemQuantity) handleUpdateItemQuantity(index, qty);
    setHasUnsavedChanges(true);
  }, [handleUpdateItemQuantity]);

  const onUpdateItemRoom = useCallback((index, room) => {
    if (handleUpdateItemRoom) handleUpdateItemRoom(index, room);
    setHasUnsavedChanges(true);
  }, [handleUpdateItemRoom]);

  const onDeleteItem = useCallback((index) => {
    handleDeleteItem(index);
    setHasUnsavedChanges(true);
  }, [handleDeleteItem]);

  const onRetryItemSearch = useCallback((index) => {
    handleRetryItemSearch(index);
    setHasUnsavedChanges(true);
  }, [handleRetryItemSearch]);

  const onMoveItem = useCallback((index, targetClaim) => {
    handleMoveItem(index, targetClaim);
    setHasUnsavedChanges(true);
  }, [handleMoveItem]);

  const onSaveAllItems = useCallback(() => {
    handleSaveAllItems();
    setHasUnsavedChanges(false);
  }, [handleSaveAllItems]);

  // Derive export message styling
  const exportIsError = exportMessage && !exportMessage.toLowerCase().includes("download");
  const exportIsSuccess = exportMessage && exportMessage.toLowerCase().includes("download");

  // Totals across all visible items
  const visibleItems = itemsData.filter((i) => !i.deleted);
  const totalCount = visibleItems.length;
  const totalValue = visibleItems.reduce(
    (sum, i) => sum + ((i.replacement_price || 0) * (i.quantity || 1)),
    0
  );

  // ── Render a single room's table ──
  const renderRoomTable = (group) => {
    const isCollapsed = collapsedRooms[group.key];
    const roomTotal = group.items.reduce(
      (sum, i) => sum + ((i.replacement_price || 0) * (i.quantity || 1)),
      0
    );

    return (
      <div
        key={group.key}
        style={{
          marginBottom: 14,
          background: "#111114",
          border: "1px solid #1e1e22",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Room header */}
        <div
          onClick={() => toggleRoom(group.key)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 20px",
            background: "#16161a",
            cursor: "pointer",
            borderBottom: isCollapsed ? "none" : "1px solid #2a2a30",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#1c1c24")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#16161a")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            >
              <path d="M6 9l6 6 6-6" stroke="#9a9aa4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#e8e8ec", letterSpacing: "0.02em" }}>
              {group.label}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#64646c",
                background: "#0a0a0b",
                padding: "2px 8px",
                borderRadius: 10,
                fontFamily: "'Space Mono', monospace",
              }}
            >
              {group.items.length} item{group.items.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#a0a0ff", fontWeight: 600, fontFamily: "'Space Mono', monospace" }}>
            ${roomTotal.toFixed(2)}
          </div>
        </div>

        {/* Table body */}
        {!isCollapsed && group.items.length > 0 && (
          <div className="items-table-scroll" style={{ padding: "8px 10px", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1180 }}>
              <thead>
                <tr style={{ background: "#16161a", borderBottom: "1px solid #2a2a30" }}>
                  {["#", "Name", "Category", "Qty", "Unit Price", "Source", "Links", "Notes", "Modified", "Actions"].map(
                    (h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: "8px 10px",
                          textAlign: "left",
                          fontWeight: 600,
                          fontSize: 11,
                          color: "#64646c",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                          borderBottom: "1px solid #2a2a30",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {group.items.map((item, idx) => (
                  <tr
                    key={item.db_doc_id || `${group.key}-${idx}`}
                    style={{
                      background: idx % 2 === 0 ? "#111114" : "#1c1c24",
                      borderBottom: "1px solid #1e1e22",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(160,160,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "#111114" : "#1c1c24")}
                  >
                    <td style={{ padding: "8px 10px", color: "#4a4a55", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                      {idx + 1}
                    </td>
                    <td
                      style={{ padding: "8px 10px", color: "#e8e8ec", fontWeight: 500, maxWidth: 320, minWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "default" }}
                      onMouseEnter={(e) => setTooltip({ visible: true, text: item.name, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setTooltip((t) => ({ ...t, x: e.clientX, y: e.clientY }))}
                      onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                    >
                      {item.name}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#9a9aa4" }}>
                      <span style={{ background: "#1e1e22", padding: "3px 10px", borderRadius: 6, fontSize: 11, whiteSpace: "nowrap" }}>
                        {item.category}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity || 1}
                        onChange={(e) => onUpdateItemQuantity(item.index, e.target.value)}
                        style={{
                          width: 60,
                          padding: "6px 8px",
                          background: "#0a0a0b",
                          border: "1px solid #2a2a30",
                          borderRadius: 6,
                          color: "#e8e8ec",
                          fontSize: 12,
                          fontFamily: "'Space Mono', monospace",
                          outline: "none",
                          textAlign: "center",
                          transition: "border-color 0.2s",
                        }}
                        onFocus={(e) => (e.target.style.borderColor = "#a0a0ff")}
                        onBlur={(e) => (e.target.style.borderColor = "#2a2a30")}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", color: "#a0a0ff", fontFamily: "'Space Mono', monospace", fontWeight: 600, whiteSpace: "nowrap" }}>
                      ${typeof item.replacement_price === "number" ? item.replacement_price.toFixed(2) : item.replacement_price}
                    </td>
                    <td style={{ padding: "8px 10px", color: "#9a9aa4", fontSize: 12, whiteSpace: "nowrap" }}>
                      {item.source_file_type || "—"}
                    </td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {item.item_url ? (
                          <a href={item.item_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "#a0a0ff", textDecoration: "none", fontSize: 12 }}>
                            Item ↗
                          </a>
                        ) : (
                          <span style={{ color: "#4a4a55", fontSize: 12 }}>No item link</span>
                        )}
                        <span style={{ color: "#2a2a30", fontSize: 11 }}>|</span>
                        {item.source_file_link ? (
                          <a href={item.source_file_link} target="_blank" rel="noopener noreferrer"
                            style={{ color: "#a0a0ff", textDecoration: "none", fontSize: 12 }}>
                            File ↗
                          </a>
                        ) : (
                          <span style={{ color: "#4a4a55", fontSize: 12 }}>No file</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "8px 10px", minWidth: 140 }}>
                      <input
                        type="text"
                        value={item.item_notes || ""}
                        onChange={(e) => onUpdateItemNotes(item.index, e.target.value)}
                        placeholder="Add notes…"
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          background: "#0a0a0b",
                          border: "1px solid #2a2a30",
                          borderRadius: 6,
                          color: "#e8e8ec",
                          fontSize: 12,
                          fontFamily: "'DM Sans', sans-serif",
                          outline: "none",
                          transition: "border-color 0.2s",
                        }}
                        onFocus={(e) => (e.target.style.borderColor = "#a0a0ff")}
                        onBlur={(e) => (e.target.style.borderColor = "#2a2a30")}
                        onMouseEnter={(e) => {
                          if (item.item_notes) setTooltip({ visible: true, text: item.item_notes, x: e.clientX, y: e.clientY });
                        }}
                        onMouseMove={(e) => {
                          if (item.item_notes) setTooltip((t) => ({ ...t, x: e.clientX, y: e.clientY }));
                        }}
                        onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", color: "#64646c", fontSize: 11, whiteSpace: "nowrap" }}>
                      {item.date_modified ? new Date(item.date_modified).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center", position: "relative" }}>
                      <div style={{ position: "relative", display: "inline-block" }} ref={openMenuIndex === item.index ? menuRef : null}>
                        <button
                          onClick={() => {
                            setOpenMenuIndex(openMenuIndex === item.index ? null : item.index);
                            setMoveSubmenuIndex(null);
                            setMoveRoomSubmenuIndex(null);
                          }}
                          style={{
                            background: openMenuIndex === item.index ? "rgba(160,160,255,0.1)" : "none",
                            border: "1px solid",
                            borderColor: openMenuIndex === item.index ? "rgba(160,160,255,0.3)" : "#2a2a30",
                            cursor: "pointer",
                            padding: "5px 7px",
                            borderRadius: 7,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            if (openMenuIndex !== item.index) {
                              e.currentTarget.style.borderColor = "#4a4a55";
                              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (openMenuIndex !== item.index) {
                              e.currentTarget.style.borderColor = "#2a2a30";
                              e.currentTarget.style.background = "none";
                            }
                          }}
                          title="Actions"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#9a9aa4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#9a9aa4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {openMenuIndex === item.index && (
                          <div className="action-menu">
                            <button
                              className="action-menu-item"
                              onClick={() => { onRetryItemSearch(item.index); setOpenMenuIndex(null); }}
                              style={{ color: "#a0a0ff" }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                                <path d="M1 4v6h6" stroke="#a0a0ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M3.51 15a9 9 0 1 0 .49-4" stroke="#a0a0ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Retry Item Search
                            </button>
                            <button
                              className="action-menu-item"
                              onClick={() => { onDeleteItem(item.index); setOpenMenuIndex(null); }}
                              style={{ color: "#ff4d4d" }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                                <polyline points="3 6 5 6 21 6" stroke="#ff4d4d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#ff4d4d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M10 11v6M14 11v6" stroke="#ff4d4d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="#ff4d4d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              Delete Item
                            </button>

                            {/* Move to Room */}
                            {roomTypes.length > 0 && (
                              <div style={{ position: "relative" }}>
                                <button
                                  className="action-menu-item"
                                  onClick={() => {
                                    setMoveRoomSubmenuIndex(moveRoomSubmenuIndex === item.index ? null : item.index);
                                    setMoveSubmenuIndex(null);
                                  }}
                                  style={{ color: "#6ece8a" }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#6ece8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    <polyline points="9 22 9 12 15 12 15 22" stroke="#6ece8a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  Move to Room
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ marginLeft: "auto" }}>
                                    <path d="M9 18l6-6-6-6" stroke="#6ece8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                                {moveRoomSubmenuIndex === item.index && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      right: "100%",
                                      top: 0,
                                      marginRight: 4,
                                      background: "#1c1c24",
                                      border: "1px solid #2a2a30",
                                      borderRadius: 10,
                                      padding: 6,
                                      minWidth: 180,
                                      maxHeight: 280,
                                      overflowY: "auto",
                                      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                                      zIndex: 110,
                                    }}
                                  >
                                    {roomTypes.map((opt) => (
                                      <button
                                        key={opt.value}
                                        className="action-menu-item"
                                        onClick={() => {
                                          onUpdateItemRoom(item.index, opt.value);
                                          setMoveRoomSubmenuIndex(null);
                                          setOpenMenuIndex(null);
                                          // Ensure target room is expanded so user sees the moved item
                                          setCollapsedRooms((prev) => ({ ...prev, [opt.value]: false }));
                                        }}
                                        style={{
                                          color: opt.value === item.room ? "#a0a0ff" : "#6ece8a",
                                          fontSize: 12,
                                          textAlign: "left",
                                          fontWeight: opt.value === item.room ? 700 : 500,
                                        }}
                                      >
                                        {opt.label}
                                        {opt.value === item.room && (
                                          <span style={{ marginLeft: "auto", fontSize: 10, color: "#a0a0ff" }}>(current)</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Move to Claim */}
                            {claimOptions && claimOptions.length > 0 && (
                              <div style={{ position: "relative" }}>
                                <button
                                  className="action-menu-item"
                                  onClick={() => {
                                    setMoveSubmenuIndex(moveSubmenuIndex === item.index ? null : item.index);
                                    setMoveRoomSubmenuIndex(null);
                                  }}
                                  style={{ color: "#e8b84a" }}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                                    <path d="M5 12h14M12 5l7 7-7 7" stroke="#e8b84a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  Move to Claim
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ marginLeft: "auto" }}>
                                    <path d="M9 18l6-6-6-6" stroke="#e8b84a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>
                                {moveSubmenuIndex === item.index && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      right: "100%",
                                      top: 0,
                                      marginRight: 4,
                                      background: "#1c1c24",
                                      border: "1px solid #2a2a30",
                                      borderRadius: 10,
                                      padding: 6,
                                      minWidth: 180,
                                      maxHeight: 220,
                                      overflowY: "auto",
                                      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                                      zIndex: 110,
                                    }}
                                  >
                                    {claimOptions.map((claim) => (
                                      <button
                                        key={claim}
                                        className="action-menu-item"
                                        onClick={() => { onMoveItem(item.index, claim); setMoveSubmenuIndex(null); setOpenMenuIndex(null); }}
                                        style={{ color: "#e8b84a", fontSize: 12, textAlign: "center", justifyContent: "center" }}
                                      >
                                        {claim}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty room footnote when expanded but no items */}
        {!isCollapsed && group.items.length === 0 && (
          <div style={{ padding: "18px 20px", textAlign: "center", fontSize: 12, color: "#4a4a55" }}>
            No items in this room.
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{globalResetStyle}</style>
      <link href={FONT_LINK} rel="stylesheet" />
      <style>{`
        .items-table-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .items-table-scroll::-webkit-scrollbar-track { background: transparent; }
        .items-table-scroll::-webkit-scrollbar-thumb { background: #2a2a30; border-radius: 3px; }
        .items-table-scroll::-webkit-scrollbar-thumb:hover { background: #4a4a55; }
        .action-menu { position: absolute; right: 0; top: 110%; z-index: 100; background: #1c1c24; border: 1px solid #2a2a30; border-radius: 10px; padding: 6px; min-width: 190px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
        .action-menu-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 7px; cursor: pointer; font-size: 13px; font-family: 'DM Sans', sans-serif; transition: background 0.15s; white-space: nowrap; border: none; width: 100%; text-align: left; background: none; }
        .action-menu-item:hover { background: rgba(255,255,255,0.05); }
        .item-tooltip { position: fixed; z-index: 9999; background: #1c1c24; border: 1px solid #2a2a30; border-radius: 8px; padding: 8px 12px; font-size: 12px; color: #e8e8ec; max-width: 320px; word-break: break-word; pointer-events: none; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        @keyframes unsaved-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
      `}</style>
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
        <div style={{ width: "100%", maxWidth: 1600 }}>
          {/* Tooltip */}
          {tooltip.visible && (
            <div className="item-tooltip" style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
              {tooltip.text}
            </div>
          )}

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => setPage("main")}
                style={{
                  background: "none",
                  border: "1px solid #2a2a30",
                  borderRadius: 8,
                  color: "#b0b0b8",
                  padding: "6px 10px",
                  fontSize: 12,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#4a4a55")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a30")}
              >
                <BackIcon /> Back
              </button>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>
                {typeLabel} for: {activeClaim?.title || "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={handleExportItems}
                disabled={exporting}
                style={{
                  background: "rgba(160,160,255,0.08)",
                  border: "1px solid rgba(160,160,255,0.25)",
                  borderRadius: 10,
                  color: "#a0a0ff",
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: exporting ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: exporting ? 0.6 : 1,
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { if (!exporting) e.currentTarget.style.background = "rgba(160,160,255,0.14)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(160,160,255,0.08)"; }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="#a0a0ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {exporting ? "Exporting…" : "Export Results"}
              </button>
              <button
                onClick={onSaveAllItems}
                disabled={itemsSaving}
                style={{
                  background: hasUnsavedChanges ? "rgba(160,160,255,0.16)" : "rgba(160,160,255,0.08)",
                  border: `1px solid ${hasUnsavedChanges ? "rgba(160,160,255,0.45)" : "rgba(160,160,255,0.25)"}`,
                  borderRadius: 10,
                  color: "#a0a0ff",
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: itemsSaving ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: itemsSaving ? 0.6 : 1,
                  transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { if (!itemsSaving) e.currentTarget.style.background = "rgba(160,160,255,0.14)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = hasUnsavedChanges ? "rgba(160,160,255,0.16)" : "rgba(160,160,255,0.08)"; }}
              >
                <SaveIcon size={16} color="#a0a0ff" />
                {itemsSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>

          {/* Unsaved changes banner */}
          {hasUnsavedChanges && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 18px",
                background: "rgba(255,180,60,0.06)",
                border: "1px solid rgba(255,180,60,0.2)",
                borderRadius: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                animation: "unsaved-pulse 2.5s ease-in-out 1",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 9v4M12 17h.01" stroke="#ffb43c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="#ffb43c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 13, color: "#ffb43c", fontFamily: "'DM Sans', sans-serif" }}>
                  You have unsaved changes
                </span>
              </div>
            </div>
          )}

          {/* Export message banner */}
          {exportMessage && (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 18px",
                background: exportIsError
                  ? "rgba(255,77,77,0.06)"
                  : exportIsSuccess
                  ? "rgba(60,210,130,0.06)"
                  : "rgba(160,160,255,0.06)",
                border: `1px solid ${
                  exportIsError
                    ? "rgba(255,77,77,0.2)"
                    : exportIsSuccess
                    ? "rgba(60,210,130,0.2)"
                    : "rgba(160,160,255,0.15)"
                }`,
                borderRadius: 10,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {exportIsError && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#ff4d4d" strokeWidth="1.8" />
                    <path d="M12 8v4M12 16h.01" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
                {exportIsSuccess && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="#3cd282" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span
                  style={{
                    fontSize: 13,
                    color: exportIsError ? "#ff4d4d" : exportIsSuccess ? "#3cd282" : "#b0b0b8",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {exportMessage}
                </span>
              </div>
              <button
                onClick={() => setExportMessage("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64646c",
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                }}
              >
                <CloseIcon />
              </button>
            </div>
          )}

          {/* Loading */}
          {itemsLoading && (
            <div style={{ textAlign: "center", padding: 60, color: "#64646c", fontSize: 14 }}>Loading items…</div>
          )}

          {/* Error / empty */}
          {!itemsLoading && itemsError && itemsData.length === 0 && (
            <div
              style={{
                background: "#111114",
                border: "1px solid #1e1e22",
                borderRadius: 14,
                padding: "48px 28px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 14, color: "#64646c" }}>{itemsError || "No items found"}</div>
            </div>
          )}

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
            Your processed items are grouped by room below. Click a room header to expand or collapse it. Empty rooms start collapsed. Adjust the quantity for each item, add notes, or use the Actions column to retry the search, delete, move to a different room, or move to another claim. Follow the link in the URL column to see the comparable item found by the agent (files from receipts do not have this link). To receive these results as a spreadsheet, click the "Export Results" button. Remember to save your changes if any were made.
          </div>

          {/* Per-room collapsible tables */}
          {!itemsLoading && itemsData.length > 0 && (
            <>
              {grouped.map(renderRoomTable)}

              {/* Grand total */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 20px",
                  marginTop: 6,
                  background: "#16161a",
                  border: "1px solid #2a2a30",
                  borderRadius: 14,
                }}
              >
                <span style={{ fontSize: 12, color: "#64646c" }}>
                  {totalCount} item{totalCount !== 1 ? "s" : ""} across {grouped.filter((g) => g.items.length > 0).length} room{grouped.filter((g) => g.items.length > 0).length !== 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#a0a0ff", fontFamily: "'Space Mono', monospace" }}>
                  Grand Total: ${totalValue.toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}