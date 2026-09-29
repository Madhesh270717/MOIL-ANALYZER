// Centralised API access so views never reimplement fetch/error handling.
export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://127.0.0.1:5000";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const errorMsg = data?.message || data?.error || `HTTP ${res.status}`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function apiGet(path) {
  return request(path);
}

export function apiPost(path, body) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}
