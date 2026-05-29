export const UploadIcon = () => (
  <svg width="32" height="32" fill="none" viewBox="0 0 24 24">
    <path
      d="M12 16V4m0 0L8 8m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
      stroke="#64646c"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const FileIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
    <path
      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
      stroke="#64646c"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M14 2v6h6" stroke="#64646c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CloseIcon = () => (
  <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
    <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const ShieldIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
    <path
      d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z"
      stroke="#a0a0ff"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M9 12l2 2 4-4" stroke="#a0a0ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SaveIcon = ({ size = 18, color = "#a0a0ff" }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M17 21v-8H7v8M7 3v5h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const TrashIcon = ({ size = 16, color = "#ff4d4d" }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24">
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const TableIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#a0a0ff" strokeWidth="1.5"/>
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="#a0a0ff" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const BackIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
    <path d="M19 12H5m0 0l7 7m-7-7l7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);