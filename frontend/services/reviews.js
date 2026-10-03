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
