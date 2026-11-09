import type { ApiResponse } from "@picode-hr/shared";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const TOKEN_KEY = "picode_hr_token";

export function saveTokenFromHash(hash: string): void {
  const match = hash.match(/token=([^&]+)/);
  if (match) localStorage.setItem(TOKEN_KEY, match[1]);
}

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const clearToken = (): void => localStorage.removeItem(TOKEN_KEY);
export const setToken = (t: string): void => localStorage.setItem(TOKEN_KEY, t);

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.data;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PUT",
  payload: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.data;
}

export async function apiDelete(path: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as ApiResponse<unknown>;
  if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    body: form,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body.success) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.data;
}

/** Downloads a file (e.g. a PDF) from an authenticated endpoint and saves it as `filename`. */
export async function apiDownload(
  path: string,
  filename: string,
  method: "GET" | "POST" = "GET",
): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });

  if (!res.ok) {
    // Errors still come back as the usual { success, data, error } JSON envelope.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await res.json()) as ApiResponse<never>;
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename; // tells the browser to save, not navigate
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url); // free the memory held by the blob URL
}

export const loginUrl = `${API}/auth/google`;
