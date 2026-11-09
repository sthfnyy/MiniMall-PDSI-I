import { apiRequest } from "./api.js";
import {
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_PHOTO_SIZE,
  REVIEW_PHOTO_TYPES,
} from "./reviews.js";


export async function fetchConsumerPurchaseIntents(request = apiRequest) {
  const response = await request("/consumidor/intencoes-compra");
  return Array.isArray(response) ? response : [];
}

export function validateContestation(motive, files = []) {
  const normalized = String(motive || "").trim();
  if (normalized.length < 10 || normalized.length > 2000) {
    throw new Error("O motivo deve ter entre 10 e 2000 caracteres.");
  }
  validateContestationFiles(files);
  return normalized;
}

export function validateContestationFiles(files = []) {
  if (files.length > MAX_REVIEW_PHOTOS) {
    throw new Error("Envie no máximo 3 evidências.");
  }
  for (const file of files) {
    if (!REVIEW_PHOTO_TYPES.includes(file.type)) {
      throw new Error("As evidências devem ser imagens JPEG, PNG ou WebP.");
    }
    if (!file.size) throw new Error("A evidência não pode estar vazia.");
    if (file.size > MAX_REVIEW_PHOTO_SIZE) {
      throw new Error("Cada evidência deve ter no máximo 5 MB.");
    }
  }
  return files;
}

export async function createConsumerContestation(
  intentId,
  motive,
  files = [],
  request = apiRequest,
) {
  const normalized = validateContestation(motive, files);
  const body = new FormData();
  body.append("motivo", normalized);
  files.forEach((file) => body.append("arquivos", file));
  return request(`/consumidor/intencoes-compra/${intentId}/contestacao`, {
    method: "POST",
    body,
  });
}

export function attachContestationToIntent(intents, intentId, contestation) {
  return intents.map((intent) =>
    intent.id === intentId
      ? {
          ...intent,
          contestacao: { id: contestation.id, status: contestation.status },
        }
      : intent,
  );
}
