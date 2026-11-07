import { getAccessToken } from "./auth.js";

const API_URL = import.meta.env?.VITE_API_URL || "";

export async function apiRequest(endpoint, options = {}) {
  const token = await getAccessToken();

  if (!token) {
    throw new Error("Sessão expirada ou usuário não autenticado.");
  }

  const headers = new Headers(options.headers);

  headers.set("Authorization", `Bearer ${token}`);

  if (options.body != null && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let detail = null;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") {
        detail = data.detail;
      } else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
        detail = data.detail.map((d) => d.msg).join("; ");
      } else if (data?.message) {
        detail = data.message;
      }
    } catch {
      // response body is not JSON
    }

    let defaultMsg = `Erro na API: HTTP ${response.status}`;
    if (response.status === 401) {
      defaultMsg = "Sessão inválida ou expirada.";
    } else if (response.status === 403) {
      defaultMsg = "Você não possui permissão para realizar esta operação.";
    }

    const error = new Error(detail || defaultMsg);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
