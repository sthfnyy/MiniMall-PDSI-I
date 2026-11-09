import { apiRequest } from "./api.js";

export function whatsappLink(number, message) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!/^\d{12,13}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export async function createPurchaseIntent(productId, storeId, request = apiRequest) {
  return request("/consumidor/intencoes-compra", {
    method: "POST",
    body: JSON.stringify({
      produto_id: productId,
      loja_id: storeId,
    }),
  });
}

export function buildPurchaseContactMessage({
  productName,
  priceLabel,
  code,
  productUrl,
}) {
  return `Olá! Vi o produto ${productName} por ${priceLabel} no MiniMall e gostaria de saber mais sobre ele.\n\nCódigo do contato: ${code}\n\nProduto: ${productName}\nMiniMall: ${productUrl}\n\nAguardo informações sobre disponibilidade e condições de compra.`;
}

export function purchaseIntentErrorMessage(error) {
  if (error?.status === 401 || /sessão|autenticado/i.test(error?.message || "")) {
    return "Sua sessão expirou. Entre novamente para falar com a loja.";
  }
  if (error?.status === 404) {
    return "O produto ou a loja não está mais disponível.";
  }
  if (error?.status === 422) {
    return "Não foi possível validar este produto para contato com a loja.";
  }
  if (error?.status >= 500) {
    return "O contato está temporariamente indisponível. Tente novamente em instantes.";
  }
  return "Não foi possível registrar o contato. Verifique sua conexão e tente novamente.";
}

export async function startPurchaseContact({
  product,
  store,
  origin,
  request = apiRequest,
  openWindow = (url) => globalThis.open(url, "_blank", "noopener,noreferrer"),
}) {
  if (!whatsappLink(store?.whatsapp, "")) {
    return { status: "missing_whatsapp" };
  }

  const intent = await createPurchaseIntent(product.id, store.id, request);
  const message = buildPurchaseContactMessage({
    productName: product.name,
    priceLabel: product.priceLabel,
    code: intent.codigo,
    productUrl: `${origin}/#produto/${product.id}`,
  });
  const url = whatsappLink(store.whatsapp, message);
  openWindow(url);
  return { status: "opened", intent, message, url };
}

export function createSingleFlightRunner() {
  let pending = null;

  return (operation) => {
    if (pending) return pending;
    pending = Promise.resolve()
      .then(operation)
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}
