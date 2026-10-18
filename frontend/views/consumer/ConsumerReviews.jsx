import React, { useEffect, useState } from "react";
import { Star, Store } from "lucide-react";
import {
  appendReviewPhoto,
  deleteConsumerReview,
  deleteConsumerReviewPhoto,
  getReviewPhotos,
  getReviewStoreId,
  getUserReviews,
  listConsumerReviews,
  MAX_REVIEW_PHOTOS,
  removeReviewPhoto,
  updateConsumerReview,
  uploadConsumerReviewPhoto,
  validateConsumerReviewPhoto,
} from "../../services/reviews.js";

export default function ConsumerReviews({ user, data, go, useRealApi = false }) {
  const stores = data?.stores || [];
  const [realReviews, setRealReviews] = useState([]);
  const [loading, setLoading] = useState(useRealApi);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editRating, setEditRating] = useState(0);
  const [editComment, setEditComment] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [selectedPhotos, setSelectedPhotos] = useState({});
  const [photoErrors, setPhotoErrors] = useState({});
  const [photoProcessing, setPhotoProcessing] = useState(null);

  useEffect(() => {
    let active = true;

    if (!useRealApi) {
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    listConsumerReviews()
      .then((reviews) => {
        if (active) {
          setRealReviews(reviews);
          setError("");
        }
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [useRealApi]);

  const userReviews = useRealApi
    ? realReviews
    : getUserReviews(data?.reviews, user?.id);

  function formatReviewDate(dateStr) {
    if (!dateStr) return "";
    try {
      const date = dateStr.includes("T")
        ? new Date(dateStr)
        : new Date(`${dateStr}T12:00:00`);
      return date.toLocaleDateString("pt-BR");
    } catch {
      return dateStr;
    }
  }

  function getStoreName(storeId) {
    const store = stores.find((item) => String(item.id) === String(storeId));
    return store?.name || store?.nome_loja || `Loja #${storeId}`;
  }

  function startEditing(review) {
    setEditingId(review.id);
    setEditRating(review.nota || review.rating || 0);
    setEditComment(review.comentario ?? review.comment ?? "");
    setError("");
  }

  async function saveEditing(review) {
    if (processingId) return;
    setProcessingId(review.id);
    setError("");

    try {
      const updated = await updateConsumerReview(review.id, {
        nota: Number(editRating),
        comentario: editComment.trim(),
      });
      setRealReviews((current) =>
        current.map((item) =>
          item.id === review.id
            ? {
                ...item,
                ...updated,
                fotos: updated.fotos?.length ? updated.fotos : item.fotos,
              }
            : item,
        ),
      );
      setEditingId(null);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setProcessingId(null);
    }
  }

  async function removeReview(review) {
    if (processingId || !window.confirm("Excluir esta avaliação?")) return;
    setProcessingId(review.id);
    setError("");

    try {
      await deleteConsumerReview(review.id);
      setRealReviews((current) =>
        current.filter((item) => item.id !== review.id),
      );
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setProcessingId(null);
    }
  }

  function selectPhoto(review, file) {
    try {
      validateConsumerReviewPhoto(file, getReviewPhotos(review).length);
      setSelectedPhotos((current) => ({ ...current, [review.id]: file }));
      setPhotoErrors((current) => ({ ...current, [review.id]: "" }));
    } catch (validationError) {
      setSelectedPhotos((current) => ({ ...current, [review.id]: null }));
      setPhotoErrors((current) => ({
        ...current,
        [review.id]: validationError.message,
      }));
    }
  }

  async function uploadPhoto(review) {
    if (photoProcessing) return;
    const file = selectedPhotos[review.id];

    try {
      validateConsumerReviewPhoto(file, getReviewPhotos(review).length);
    } catch (validationError) {
      setPhotoErrors((current) => ({
        ...current,
        [review.id]: validationError.message,
      }));
      return;
    }

    setPhotoProcessing(`upload-${review.id}`);
    setPhotoErrors((current) => ({ ...current, [review.id]: "" }));

    try {
      const photo = await uploadConsumerReviewPhoto(review.id, file);
      setRealReviews((current) => appendReviewPhoto(current, review.id, photo));
      setSelectedPhotos((current) => ({ ...current, [review.id]: null }));
    } catch (uploadError) {
      setPhotoErrors((current) => ({
        ...current,
        [review.id]: uploadError.message,
      }));
    } finally {
      setPhotoProcessing(null);
    }
  }

  async function removePhoto(review, photo) {
    if (
      photoProcessing ||
      !window.confirm("Remover esta foto da avaliação?")
    ) {
      return;
    }

    setPhotoProcessing(`delete-${photo.id}`);
    setPhotoErrors((current) => ({ ...current, [review.id]: "" }));

    try {
      await deleteConsumerReviewPhoto(review.id, photo.id);
      setRealReviews((current) =>
        removeReviewPhoto(current, review.id, photo.id),
      );
    } catch (deleteError) {
      setPhotoErrors((current) => ({
        ...current,
        [review.id]: deleteError.message,
      }));
    } finally {
      setPhotoProcessing(null);
    }
  }

  return (
    <section className="consumer-page">
      {go && (
        <button className="back-link" onClick={() => go("consumidor")}>
          ← Voltar ao perfil
        </button>
      )}

      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Minhas avaliações</h1>
        <p>Consulte as avaliações que você publicou no MiniMall.</p>
      </div>

      {loading && <p>Carregando avaliações...</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!loading && (
        <div className="consumer-favorites-header">
          <div>
            <span className="section-index">AVALIAÇÕES PUBLICADAS</span>
            <h2>
              {userReviews.length}{" "}
              {userReviews.length === 1
                ? "avaliação publicada"
                : "avaliações publicadas"}
            </h2>
          </div>
        </div>
      )}

      {!loading && userReviews.length > 0 ? (
        <div className="review-list">
          {userReviews.map((review) => {
            const storeId = getReviewStoreId(review);
            const storeName = getStoreName(storeId);
            const ratingValue = review.rating || review.nota || 0;
            const commentText = review.comment ?? review.comentario;
            const photos = getReviewPhotos(review);
            const editing = editingId === review.id;

            return (
              <article className="review" key={review.id}>
                <div className="review-top">
                  <div className="consumer-review-store">
                    <span className="avatar"><Store size={18} /></span>
                    <div>
                      {go ? (
                        <button
                          className="store-link"
                          onClick={() => go(`loja/${storeId}`)}
                        >
                          {storeName}
                        </button>
                      ) : (
                        <strong>{storeName}</strong>
                      )}
                      <small>{formatReviewDate(review.date || review.criado_em)}</small>
                    </div>
                  </div>
                  <span
                    className="rating"
                    aria-label={`${ratingValue} de 5 estrelas`}
                  >
                    {"★".repeat(ratingValue)}
                  </span>
                </div>

                {editing ? (
                  <div className="review-form">
                    <label className="field">
                      <span>Nota</span>
                      <select
                        value={editRating}
                        onChange={(event) => setEditRating(event.target.value)}
                      >
                        {[1, 2, 3, 4, 5].map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Comentário</span>
                      <textarea
                        value={editComment}
                        onChange={(event) => setEditComment(event.target.value)}
                      />
                    </label>
                    <div className="review-form-actions">
                      <button
                        className="outline"
                        type="button"
                        disabled={processingId === review.id}
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </button>
                      <button
                        className="primary"
                        type="button"
                        disabled={processingId === review.id}
                        onClick={() => saveEditing(review)}
                      >
                        {processingId === review.id ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {commentText && <p>{commentText}</p>}
                    {photos.length > 0 && (
                      <div className="review-photo-list">
                        {photos.map((photo, index) => (
                          <div className="review-photo-item" key={photo.id || photo.url}>
                            <img
                              className="review-photo"
                              src={photo.url}
                              alt={`Foto ${index + 1} da avaliação para ${storeName}`}
                              loading="lazy"
                            />
                            {useRealApi && photo.id && !String(photo.id).startsWith("legacy-") && (
                              <button
                                className="text-button danger"
                                type="button"
                                disabled={photoProcessing === `delete-${photo.id}`}
                                onClick={() => removePhoto(review, photo)}
                              >
                                {photoProcessing === `delete-${photo.id}`
                                  ? "Removendo..."
                                  : "Remover foto"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {useRealApi && (
                      <div className="review-photo-controls">
                        <small>
                          {photos.length} de {MAX_REVIEW_PHOTOS} fotos
                        </small>
                        {photos.length < MAX_REVIEW_PHOTOS ? (
                          <>
                            <input
                              key={`photo-${review.id}-${selectedPhotos[review.id]?.name || "empty"}`}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={photoProcessing === `upload-${review.id}`}
                              aria-label={`Selecionar foto para avaliação de ${storeName}`}
                              onChange={(event) =>
                                selectPhoto(review, event.target.files?.[0])
                              }
                            />
                            {selectedPhotos[review.id] && (
                              <small>{selectedPhotos[review.id].name}</small>
                            )}
                            <button
                              className="outline"
                              type="button"
                              disabled={
                                !selectedPhotos[review.id] ||
                                photoProcessing === `upload-${review.id}`
                              }
                              onClick={() => uploadPhoto(review)}
                            >
                              {photoProcessing === `upload-${review.id}`
                                ? "Enviando..."
                                : "Enviar foto"}
                            </button>
                          </>
                        ) : (
                          <small>Limite de fotos atingido.</small>
                        )}
                        {photoErrors[review.id] && (
                          <p className="error" role="alert">
                            {photoErrors[review.id]}
                          </p>
                        )}
                      </div>
                    )}
                    {useRealApi && (
                      <div className="review-form-actions">
                        <button
                          className="outline"
                          type="button"
                          onClick={() => startEditing(review)}
                        >
                          Editar
                        </button>
                        <button
                          className="text-button danger"
                          type="button"
                          disabled={processingId === review.id}
                          onClick={() => removeReview(review)}
                        >
                          {processingId === review.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>
      ) : !loading && !error ? (
        <div className="empty">
          <Star size={36} />
          <h3>Nenhuma avaliação ainda</h3>
          <p>Quando você publicar uma avaliação, ela aparecerá aqui.</p>
          {go && (
            <button className="primary" onClick={() => go("explorar")}>
              Explorar produtos
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
