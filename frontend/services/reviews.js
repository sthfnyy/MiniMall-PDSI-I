import { apiRequest } from "./api.js";

export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_PHOTO_SIZE = 5 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateConsumerReviewPhoto(file, currentPhotoCount = 0) {
  if (!file) {
    throw new Error("Selecione uma imagem para enviar.");
  }

  if (currentPhotoCount >= MAX_REVIEW_PHOTOS) {
    throw new Error("Cada avaliação pode ter no máximo 3 fotos.");
  }

  if (!REVIEW_PHOTO_TYPES.includes(file.type)) {
    throw new Error("Envie uma imagem JPEG, PNG ou WebP.");
  }

  if (file.size > MAX_REVIEW_PHOTO_SIZE) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }

  return file;
}

function friendlyPhotoError(error) {
  const message = error?.message || "Não foi possível processar a foto.";

  if (message.includes("HTTP 404")) {
    return new Error("A avaliação ou a foto não foi encontrada.");
  }
  if (message.includes("HTTP 409")) {
    return new Error("Esta avaliação já possui o limite de 3 fotos.");
  }
  if (message.includes("HTTP 422")) {
    return new Error("O arquivo enviado não é uma imagem válida.");
  }

  return error instanceof Error ? error : new Error(message);
}

export async function uploadConsumerReviewPhoto(
  assessmentId,
  file,
  request = apiRequest,
) {
  validateConsumerReviewPhoto(file);
  const body = new FormData();
  body.append("arquivo", file);

  try {
    return await request(`/consumidor/avaliacoes/${assessmentId}/fotos`, {
      method: "POST",
      body,
    });
  } catch (error) {
    throw friendlyPhotoError(error);
  }
}

export async function deleteConsumerReviewPhoto(
  assessmentId,
  photoId,
  request = apiRequest,
) {
  try {
    return await request(
      `/consumidor/avaliacoes/${assessmentId}/fotos/${photoId}`,
      { method: "DELETE" },
    );
  } catch (error) {
    throw friendlyPhotoError(error);
  }
}

export function appendReviewPhoto(reviews, reviewId, photo) {
  return reviews.map((review) =>
    review.id === reviewId
      ? { ...review, fotos: [...(review.fotos || []), photo] }
      : review,
  );
}

export function removeReviewPhoto(reviews, reviewId, photoId) {
  return reviews.map((review) =>
    review.id === reviewId
      ? {
          ...review,
          fotos: (review.fotos || []).filter((photo) => photo.id !== photoId),
        }
      : review,
  );
}

export async function listConsumerReviews(request = apiRequest) {
  return request("/consumidor/avaliacoes");
}

export async function createConsumerReview(values, request = apiRequest) {
  return request("/consumidor/avaliacoes", {
    method: "POST",
    body: JSON.stringify({
      loja_id: values.loja_id,
      nota: values.nota,
      comentario: values.comentario,
    }),
  });
}

export async function updateConsumerReview(id, values, request = apiRequest) {
  const payload = {};
  if (values.nota !== undefined) payload.nota = values.nota;
  if (values.comentario !== undefined) payload.comentario = values.comentario;

  return request(`/consumidor/avaliacoes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteConsumerReview(id, request = apiRequest) {
  return request(`/consumidor/avaliacoes/${id}`, { method: "DELETE" });
}

export function isBackendStoreId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

export function getReviewPhotos(review) {
  if (Array.isArray(review?.fotos) && review.fotos.length > 0) {
    return review.fotos.filter((photo) => photo?.url);
  }

  const legacyUrl = review?.foto_url || review?.photo;
  return legacyUrl ? [{ id: `legacy-${review.id}`, url: legacyUrl }] : [];
}

export function getReviewUserId(review) {
  return review?.user ?? review?.usuario_id;
}

export function getReviewStoreId(review) {
  return review?.store ?? review?.loja_id;
}

export function getReviewDate(review) {
  return review?.date ?? review?.criado_em;
}

export function getUserReviews(reviews = [], userId) {
  if (userId == null) return [];

  return reviews
    .filter(
      (review) =>
        String(getReviewUserId(review)) === String(userId),
    )
    .sort(
      (a, b) =>
        new Date(getReviewDate(b) || 0) -
        new Date(getReviewDate(a) || 0),
    );
}

export function getStoreReviews(reviews = [], storeId) {
  return reviews.filter(
    (review) =>
      String(getReviewStoreId(review)) === String(storeId),
  );
}

export function publishReview(data, { user, store, rating, comment }) {
  if (user?.role !== "consumidor") {
    throw new Error("Somente consumidores podem publicar avaliações.");
  }

  if (!store?.id) {
    throw new Error("Loja não encontrada.");
  }

  const numericRating = Number(rating);

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    throw new Error("Selecione uma nota de 1 a 5 estrelas.");
  }

  const normalizedComment = comment?.trim() || "";

  if (!normalizedComment) {
    throw new Error("Escreva um comentário sobre sua experiência.");
  }

  const now = new Date();
  const reviewId = crypto.randomUUID();
  const review = {
    id: reviewId,
    store: store.id,
    user: user.id,
    name: user.name,
    rating: numericRating,
    comment: normalizedComment,
    photo: "",
    date: now.toISOString().split("T")[0],
  };
  const pointsTransaction = {
    id: crypto.randomUUID(),
    usuario_id: user.id,
    loja_id: store.id,
    tipo: "credito",
    quantidade: 10,
    avaliacao_id: reviewId,
    descricao: "Pontos por avaliação publicada",
    criado_em: now.toISOString(),
  };

  data.reviews = data.reviews || [];
  data.pontos_transacoes = data.pontos_transacoes || [];
  data.reviews.push(review);
  data.pontos_transacoes.push(pointsTransaction);

  return { data, review, pointsTransaction };
}
