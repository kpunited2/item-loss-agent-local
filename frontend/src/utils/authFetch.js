const API_URL = import.meta.env.VITE_API_URL ?? "";

function sessionGet(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function resolveUrl(url) {
  // Leave absolute URLs (http://, https://) untouched.
  // Prepend API_URL to anything else (relative paths like "/add_claim/").
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_URL}${url}`;
}

export function authFetch(url, options = {}) {
  const token = sessionGet("sc_session_token", "");
  return fetch(resolveUrl(url), {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { "X-Session-Token": token } : {}),
    },
  });
}

export function adminFetch(url, options = {}) {
  const token = sessionGet("sc_admin_token", "");
  return fetch(resolveUrl(url), {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { "X-Admin-Token": token } : {}),
    },
  });
}