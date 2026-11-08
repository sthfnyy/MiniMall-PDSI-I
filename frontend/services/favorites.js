import { apiRequest } from "./api.js";

export async function listConsumerFavorites(request = apiRequest) {
  return request("/consumidor/favoritos");
}

export async function addConsumerFavorite(productId, request = apiRequest) {
  return request("/consumidor/favoritos", {
    method: "POST",
    body: JSON.stringify({ produto_id: productId }),
  });
}

export async function deleteConsumerFavorite(productId, request = apiRequest) {
  return request(`/consumidor/favoritos/${productId}`, {
    method: "DELETE",
  });
}
