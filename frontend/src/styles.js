export const radioStyle = (selected) => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  background: selected ? "rgba(160,160,255,0.06)" : "#16161a",
  border: `1px solid ${selected ? "#a0a0ff" : "#2a2a30"}`,
  borderRadius: 10,
  cursor: "pointer",
  transition: "all 0.2s",
  flex: 1,
});

export const radioDotOuter = (selected) => ({
  width: 18,
  height: 18,
  borderRadius: "50%",
  border: `2px solid ${selected ? "#a0a0ff" : "#4a4a55"}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  transition: "border-color 0.2s",
});

export const radioDotInner = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#a0a0ff",
};

export const inputStyle = {
  width: "100%",
  padding: "12px 16px",
  background: "#16161a",
  border: "1px solid #2a2a30",
  borderRadius: 10,
  color: "#e8e8ec",
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  letterSpacing: "0.02em",
  outline: "none",
  transition: "border-color 0.2s",
  boxSizing: "border-box",
};

export const smallBtnStyle = (active) => ({
  padding: "10px 20px",
  background: active ? "#e8e8ec" : "#2a2a30",
  color: active ? "#0a0a0b" : "#64646c",
  border: "none",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'DM Sans', sans-serif",
  cursor: active ? "pointer" : "default",
  transition: "all 0.2s",
});

export const globalResetStyle = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { margin: 0; padding: 0; min-height: 100vh; width: 100%; background: #0a0a0b; overflow-x: hidden; }
`;