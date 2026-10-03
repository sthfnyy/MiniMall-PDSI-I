import React from "react";
import { Star, Store } from "lucide-react";
import {
  getReviewStoreId,
  getUserReviews,
} from "../../services/reviews";

export default function ConsumerReviews({ user, data, go }) {
  const stores = data?.stores || [];
  const userReviews = getUserReviews(data?.reviews, user?.id);

  function formatReviewDate(dateStr) {
    if (!dateStr) return "";
    try {
      const d = dateStr.includes("T")
        ? new Date(dateStr)
        : new Date(dateStr + "T12:00:00");
      return d.toLocaleDateString("pt-BR");
    } catch {
      return dateStr;
    }
  }

  function getStoreName(storeId) {
    const store = stores.find(
      (s) => String(s.id) === String(storeId),
    );
    return store?.name || `Loja #${storeId}`;
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

      {userReviews.length > 0 ? (
        <div className="review-list">
          {userReviews.map((r) => {
            const storeId = getReviewStoreId(r);
            const storeName = getStoreName(storeId);
            const ratingValue = r.rating || r.nota || 0;
            const photoUrl = r.photo || r.foto_url;
            const commentText = r.comment || r.comentario;

            return (
              <article className="review" key={r.id}>
                <div className="review-top">
                  <div className="consumer-review-store">
                    <span className="avatar">
                      <Store size={18} />
                    </span>
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
                      <small>{formatReviewDate(r.date || r.criado_em)}</small>
                    </div>
                  </div>

                  <span
                    className="rating"
                    aria-label={`${ratingValue} de 5 estrelas`}
                  >
                    {"★".repeat(ratingValue)}
                  </span>
                </div>

                {commentText && <p>{commentText}</p>}

                {photoUrl && (
                  <img
                    className="review-photo"
                    src={photoUrl}
                    alt={`Foto da avaliação para ${storeName}`}
                    loading="lazy"
                  />
                )}
              </article>
            );
          })}
        </div>
      ) : (
        /* ESTADO VAZIO */
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
      )}
    </section>
  );
}

