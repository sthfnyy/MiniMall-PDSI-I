import React, { useEffect, useState } from "react";
import { Star, MessageSquare, AlertTriangle, RefreshCw, Image, X } from "lucide-react";
import { PageTitle, Modal } from "../../components/ui";
import MerchantNav from "./MerchantNav";
import {
  fetchMerchantReviews,
  getStoreReviews,
  calculateReviewsSummary,
  getMerchantStore,
} from "../../services/merchant";

export default function StoreReviews({
  user,
  data,
  go,
  notify,
  useRealApi = false,
  fetchReviewsFn = fetchMerchantReviews,
}) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(useRealApi);
  const [error, setError] = useState("");
  const [filterRating, setFilterRating] = useState("todos");
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const demoStore = getMerchantStore(data, user);

  useEffect(() => {
    let active = true;

    if (!useRealApi) {
      // Modo demonstração local
      const storeId = demoStore?.id || 1;
      const localReviews = getStoreReviews(data?.reviews, storeId);
      setReviews(localReviews);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");

    fetchReviewsFn()
      .then((dataReviews) => {
        if (!active) return;
        setReviews(dataReviews);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Erro ao carregar as avaliações da loja.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [useRealApi, demoStore?.id, data?.reviews, fetchReviewsFn]);

  const summary = calculateReviewsSummary(reviews);

  const filteredReviews = reviews.filter((r) => {
    if (filterRating === "todos") return true;
    return Math.round(Number(r.rating)) === Number(filterRating);
  });

  function renderStars(rating = 0) {
    const stars = [];
    const numRating = Math.round(Number(rating)) || 0;
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          size={16}
          className={i <= numRating ? "star-filled" : "star-empty"}
          fill={i <= numRating ? "#f59e0b" : "none"}
          color={i <= numRating ? "#f59e0b" : "#9ca3af"}
        />,
      );
    }
    return stars;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      const d = dateStr.includes("T") ? new Date(dateStr) : new Date(`${dateStr}T12:00:00`);
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <section className="merchant-page">
      <PageTitle
        eyebrow="PAINEL DO LOJISTA"
        title="Avaliações dos Clientes"
        subtitle="Acompanhe as notas, comentários e feedbacks deixados pelos clientes sobre a sua loja."
      />

      <MerchantNav current="avaliacoes" go={go} />

      {error && (
        <div className="empty-catalog-alert" role="alert" style={{ marginBottom: "20px" }}>
          <AlertTriangle size={20} />
          <div>
            <strong>Erro ao carregar avaliações</strong>
            <p>{error}</p>
          </div>
          <button
            className="secondary"
            type="button"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              setLoading(true);
              setError("");
              fetchReviewsFn()
                .then(setReviews)
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
            }}
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <div className="panel" style={{ textAlign: "center", padding: "40px" }}>
          <p>Carregando avaliações da loja...</p>
        </div>
      ) : (
        <>
          {/* CARD DE RESUMO E REPUTAÇÃO */}
          <div
            className="panel"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "24px",
              alignItems: "center",
              marginBottom: "24px",
              padding: "24px",
            }}
          >
            {/* Nota Média e Estrelas */}
            <div style={{ textAlign: "center", borderRight: "1px solid var(--border, #e5e7eb)", paddingRight: "16px" }}>
              <span className="eyebrow muted" style={{ display: "block", marginBottom: "8px" }}>
                NOTA MÉDIA
              </span>
              <div style={{ fontSize: "44px", fontWeight: "700", lineHeight: "1.1", color: "#1f2937" }}>
                {summary.average}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: "4px", margin: "8px 0" }}>
                {renderStars(Number(summary.average))}
              </div>
              <small className="muted">
                {summary.total} {summary.total === 1 ? "avaliação recebida" : "avaliações recebidas"}
              </small>
            </div>

            {/* Distribuição por estrelas */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span className="eyebrow muted" style={{ marginBottom: "4px" }}>
                DISTRIBUIÇÃO DAS NOTAS
              </span>
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = summary.distribution[stars] || 0;
                const percentage = summary.total ? Math.round((count / summary.total) * 100) : 0;
                return (
                  <div
                    key={stars}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ width: "32px", display: "flex", alignItems: "center", gap: "2px" }}>
                      {stars} <Star size={12} fill="#f59e0b" color="#f59e0b" />
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: "8px",
                        backgroundColor: "#f3f4f6",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${percentage}%`,
                          backgroundColor: "#f59e0b",
                          borderRadius: "999px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                    <span style={{ width: "24px", textAlign: "right", color: "#6b7280" }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FILTROS POR ESTRELA */}
          {reviews.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginBottom: "20px",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#4b5563", marginRight: "8px" }}>
                Filtrar:
              </span>
              <button
                type="button"
                className={filterRating === "todos" ? "primary small" : "secondary small"}
                onClick={() => setFilterRating("todos")}
              >
                Todas ({summary.total})
              </button>
              {[5, 4, 3, 2, 1].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={filterRating === String(star) ? "primary small" : "secondary small"}
                  onClick={() => setFilterRating(String(star))}
                >
                  {star} ★ ({summary.distribution[star] || 0})
                </button>
              ))}
            </div>
          )}

          {/* LISTA DE AVALIAÇÕES */}
          {filteredReviews.length > 0 ? (
            <div className="review-list" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {filteredReviews.map((review) => {
                const photos = Array.isArray(review.photos) && review.photos.length > 0
                  ? review.photos
                  : review.photo
                    ? [{ id: `photo-${review.id}`, url: review.photo }]
                    : [];

                return (
                  <article className="review panel" key={review.id} style={{ margin: 0 }}>
                    <div className="review-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div>
                        <strong style={{ fontSize: "16px", color: "#111827", display: "block" }}>
                          {review.consumerName || "Consumidor MiniMall"}
                        </strong>
                        <small className="muted" style={{ fontSize: "12px" }}>
                          {formatDate(review.date)}
                        </small>
                      </div>

                      <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
                        {renderStars(review.rating)}
                        <span style={{ marginLeft: "6px", fontWeight: "600", fontSize: "14px", color: "#374151" }}>
                          {review.rating}.0
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: "15px", lineHeight: "1.6", color: "#374151", margin: "10px 0" }}>
                      {review.comment ? review.comment : <em className="muted">Avaliação enviada sem comentário de texto.</em>}
                    </p>

                    {/* GALERIA DE FOTOS */}
                    {photos.length > 0 && (
                      <div style={{ marginTop: "14px" }}>
                        <span className="eyebrow muted" style={{ display: "block", marginBottom: "6px", fontSize: "11px" }}>
                          FOTOS DO CLIENTE ({photos.length})
                        </span>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          {photos.map((foto, idx) => (
                            <button
                              key={foto.id || idx}
                              type="button"
                              onClick={() => setPreviewPhoto(foto.url)}
                              style={{
                                border: "1px solid #e5e7eb",
                                borderRadius: "8px",
                                overflow: "hidden",
                                padding: 0,
                                background: "none",
                                cursor: "pointer",
                                width: "72px",
                                height: "72px",
                                display: "block",
                              }}
                              title="Clique para ampliar"
                            >
                              <img
                                src={foto.url}
                                alt={`Foto da avaliação ${idx + 1}`}
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="panel empty" style={{ textAlign: "center", padding: "48px 24px" }}>
              <Star size={40} style={{ color: "#d1d5db", margin: "0 auto 12px" }} />
              <h3 style={{ fontSize: "18px", marginBottom: "6px" }}>
                {reviews.length === 0
                  ? "Sua loja ainda não recebeu avaliações"
                  : "Nenhuma avaliação com esta quantidade de estrelas"}
              </h3>
              <p className="muted" style={{ maxWidth: "420px", margin: "0 auto" }}>
                {reviews.length === 0
                  ? "Assim que os clientes avaliarem os seus produtos e o atendimento da loja, o histórico e a reputação aparecerão aqui."
                  : "Tente selecionar outro filtro de estrelas acima para visualizar os comentários."}
              </p>
            </div>
          )}
        </>
      )}

      {/* MODAL DE AMPLIAÇÃO DE FOTO */}
      {previewPhoto && (
        <Modal title="Foto da Avaliação" onClose={() => setPreviewPhoto(null)}>
          <div style={{ textAlign: "center", padding: "10px" }}>
            <img
              src={previewPhoto}
              alt="Ampliação da foto"
              style={{
                maxWidth: "100%",
                maxHeight: "70vh",
                borderRadius: "8px",
                objectFit: "contain",
              }}
            />
          </div>
        </Modal>
      )}
    </section>
  );
}
