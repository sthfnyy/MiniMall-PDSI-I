
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
    if (response.status === 401) {
      throw new Error("Sessão inválida ou expirada.");
    }

    if (response.status === 403) {
      throw new Error("Você não possui permissão para realizar esta operação.");
    }

    throw new Error(`Erro na API: HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
