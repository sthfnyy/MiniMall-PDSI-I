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
