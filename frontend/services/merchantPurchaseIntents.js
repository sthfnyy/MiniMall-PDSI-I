import { apiRequest } from "./api.js";

export async function fetchMerchantPurchaseIntents(request = apiRequest) {
  const response = await request("/lojista/intencoes-compra");
  return Array.isArray(response) ? response : [];
}

export async function decideMerchantPurchaseIntent(
  intentId,
  status,
  request = apiRequest,
) {
  return request(`/lojista/intencoes-compra/${intentId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updatePurchaseIntentInList(intents, updated) {
  return intents.map((intent) =>
    intent.id === updated.id ? { ...intent, ...updated } : intent,
  );
}
