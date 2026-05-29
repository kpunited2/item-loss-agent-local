import { useState, useCallback, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import FileManagementPage from "./pages/FileManagementPage";
import ClaimsPage from "./pages/ClaimsPage";
import ItemsPage from "./pages/ItemsPage";
import GeminiKeyModal from "./components/GeminiKeyModal";
import { authFetch } from "./utils/authFetch";

const PAGE_TO_ROUTE = {
  claims: "/",
  main: "/dashboard",
  items: "/items",
};

const SESSION_KEYS = [
  "sc_activeClaim",
  "sc_itemsResultsType",
];

function sessionGet(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sessionSet(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota errors, etc. */
  }
}

function sessionRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function useSessionState(key, fallback) {
  const [value, setValue] = useState(() => sessionGet(key, fallback));
  const set = useCallback(
    (v) => {
      setValue((prev) => {
        const next = typeof v === "function" ? v(prev) : v;
        sessionSet(key, next);
        return next;
      });
    },
    [key],
  );
  return [value, set];
}

export default function App() {
  const navigate = useNavigate();

  const [valueType, setValueType] = useState("actuals");
  const [uploadType, setUploadType] = useState("Item Images");

  const [activeClaim, setActiveClaim] = useSessionState("sc_activeClaim", null);
  const [addedContext, setAddedContext] = useState("");
  const [contextSaving, setContextSaving] = useState(false);

  const [itemsData, setItemsData] = useState([]);
  const [claimOptions, setClaimOptions] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [itemsResultsType, setItemsResultsType] = useSessionState("sc_itemsResultsType", "");
  const [itemsSaving, setItemsSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  // Gemini API key gate
  const [keyConfigured, setKeyConfigured] = useState(null); // null = checking
  const [showKeyModal, setShowKeyModal] = useState(false);

  const location = useLocation();

  // Check Gemini key status on mount
  useEffect(() => {
    authFetch("/config/gemini-key-status")
      .then((r) => r.json())
      .then((d) => {
        setKeyConfigured(!!d.configured);
        setShowKeyModal(!d.configured);
      })
      .catch(() => {
        setKeyConfigured(false);
        setShowKeyModal(true);
      });
  }, []);

  useEffect(() => {
    if (location.pathname !== "/items") return;
    if (itemsData.length > 0 || itemsLoading) return;
    if (!activeClaim?.doc_id || !itemsResultsType) {
      navigate("/", { replace: true });
      return;
    }

    const refetchItems = async () => {
      setItemsLoading(true);
      setItemsError("");
      try {
        const claimId = activeClaim.doc_id;
        const url = `/get_items/${encodeURIComponent(claimId)}?results_type=${itemsResultsType}`;
        const res = await authFetch(url);
        const data = await res.json();
        if (res.ok && data.valid) {
          setItemsData(data.elements || []);
          setClaimOptions(data.claim_options || []);
        } else {
          setItemsError(data.message || "No items found");
        }
      } catch (err) {
        setItemsError("Network error: " + err.message);
      } finally {
        setItemsLoading(false);
      }
    };

    refetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const setPage = useCallback(
    (page) => {
      navigate(PAGE_TO_ROUTE[page] || "/");
    },
    [navigate],
  );

  const handleFetchItems = async (resultsType) => {
    setItemsLoading(true);
    setItemsError("");
    setItemsResultsType(resultsType);
    setExportMessage("");
    try {
      const claimId = activeClaim?.doc_id ?? "";
      const url = `/get_items/${encodeURIComponent(claimId)}?results_type=${resultsType}`;
      const res = await authFetch(url);
      const data = await res.json();
      if (res.ok && data.valid) {
        setItemsData(data.elements || []);
        setClaimOptions(data.claim_options || []);
        navigate("/items");
      } else {
        setItemsError(data.message || "No items found");
        setItemsData([]);
        navigate("/items");
      }
    } catch (err) {
      setItemsError("Network error: " + err.message);
      setItemsData([]);
      navigate("/items");
    } finally {
      setItemsLoading(false);
    }
  };

  const handleUpdateItemNotes = (index, newNotes) => {
    setItemsData((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, item_notes: newNotes, updated: true } : item
      )
    );
  };

  const handleUpdateItemQuantity = (index, newQuantity) => {
    const qty = Math.max(1, parseInt(newQuantity) || 1);
    setItemsData((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, quantity: qty, updated: true } : item
      )
    );
  };

  const handleUpdateItemRoom = (index, newRoom) => {
    setItemsData((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, room: newRoom, updated: true } : item
      )
    );
  };

  const handleToggleSaveItem = (index) => {
    setItemsData((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, updated: !item.updated } : item
      )
    );
  };

  const handleDeleteItem = (index) => {
    setItemsData((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, deleted: true } : item
      )
    );
  };

  const handleRetryItemSearch = (index) => {
    setItemsData((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, retry_item_search: true } : item
      )
    );
  };

  const handleMoveItem = (index, targetClaim) => {
    setItemsData((prev) =>
      prev.map((item) =>
        item.index === index ? { ...item, move_to_claim: targetClaim, updated: true } : item
      )
    );
  };

  const handleSaveAllItems = async () => {
    setItemsSaving(true);
    try {
      const modified = itemsData.some((item) => item.updated || item.deleted || item.retry_item_search);
      const payload = {
        valid: true,
        message: "",
        modified,
        elements: itemsData,
      };
      const claimId = activeClaim?.doc_id ?? "";
      const res = await authFetch(`/update_items/${encodeURIComponent(claimId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Items saved successfully");
        setItemsData((prev) =>
          prev
            .filter((item) => !item.deleted && !item.retry_item_search && !item.move_to_claim)
            .map((item) => ({ ...item, updated: false }))
        );
        try {
          const refetchRes = await authFetch(
            `/get_items/${encodeURIComponent(claimId)}?results_type=${itemsResultsType}`
          );
          const refetchData = await refetchRes.json();
          if (refetchRes.ok && refetchData.valid) {
            setItemsData(refetchData.elements || []);
            setClaimOptions(refetchData.claim_options || []);
          }
        } catch {
          // Non-fatal: local state is already correct from the filter above
        }
      } else {
        alert("Save failed: " + (data.detail || res.statusText));
      }
    } catch (err) {
      alert("Network error: " + err.message);
    } finally {
      setItemsSaving(false);
    }
  };

  const handleExportItems = async () => {
    setExporting(true);
    setExportMessage("");
    try {
      const claimId = activeClaim?.doc_id ?? "";
      const url = `/export_items/${encodeURIComponent(claimId)}?results_type=${itemsResultsType}`;
      const res = await authFetch(url);

      // Server returns JSON error (e.g. no items to export)
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || contentType.includes("application/json")) {
        const data = await res.json();
        setExportMessage(data.message || "Export failed");
        return;
      }

      // Server returned a file — trigger browser download
      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;

      // Use filename from Content-Disposition header if present, else fall back
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `Item_Loss_Agent_Results.csv`;

      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(objectUrl);

      setExportMessage("Download started");
    } catch (err) {
      setExportMessage("Export failed: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Wait for key status check before rendering routes
  if (keyConfigured === null) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <>
      {showKeyModal && (
        <GeminiKeyModal
          onSuccess={() => {
            setKeyConfigured(true);
            setShowKeyModal(false);
          }}
        />
      )}
      <Routes>
        <Route
          path="/"
          element={
            <ClaimsPage
              setPage={setPage}
              setActiveClaim={setActiveClaim}
            />
          }
        />
        <Route
          path="/dashboard"
          element={
            <FileManagementPage
              setPage={setPage}
              setAddedContext={setAddedContext}
              valueType={valueType}
              setValueType={setValueType}
              uploadType={uploadType}
              setUploadType={setUploadType}
              addedContext={addedContext}
              contextSaving={contextSaving}
              setContextSaving={setContextSaving}
              itemsLoading={itemsLoading}
              handleFetchItems={handleFetchItems}
              activeClaim={activeClaim}
            />
          }
        />
        <Route
          path="/items"
          element={
            <ItemsPage
              setPage={setPage}
              itemsResultsType={itemsResultsType}
              itemsData={itemsData}
              itemsLoading={itemsLoading}
              itemsError={itemsError}
              itemsSaving={itemsSaving}
              exporting={exporting}
              exportMessage={exportMessage}
              setExportMessage={setExportMessage}
              handleExportItems={handleExportItems}
              handleSaveAllItems={handleSaveAllItems}
              handleUpdateItemNotes={handleUpdateItemNotes}
              handleUpdateItemQuantity={handleUpdateItemQuantity}
              handleUpdateItemRoom={handleUpdateItemRoom}
              handleToggleSaveItem={handleToggleSaveItem}
              handleDeleteItem={handleDeleteItem}
              handleRetryItemSearch={handleRetryItemSearch}
              handleMoveItem={handleMoveItem}
              claimOptions={claimOptions}
              activeClaim={activeClaim}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}