
import React, { useEffect, useState } from "react";
import { Modal, Field } from "../../components/ui";
import {
  getPendingStores,
  approveAdminStore,
  rejectAdminStore,
  getAdminReviews,
  deleteAdminReview,
} from "../../services/admin";

export default function Moderation({ notify }) {
  const [pendingStores, setPendingStores] = useState([]);
  const [reviews, setReviews] = useState([]);

  const [storesLoading, setStoresLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const [storesError, setStoresError] = useState("");
  const [reviewsError, setReviewsError] = useState("");

  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [processing, setProcessing] = useState(false);

  // Carregar lojas pendentes
  useEffect(() => {
    let active = true;

    async function loadStores() {
      try {
        const result = await getPendingStores();

        if (active) {
          setPendingStores(result);
          setStoresError("");
        }
      } catch (err) {
        if (active) {
          setStoresError(err.message);
        }
      } finally {
        if (active) {
          setStoresLoading(false);
        }
      }
    }

    loadStores();

    return () => {
      active = false;
    };
  }, []);

  // Carregar avaliações
  useEffect(() => {
    let active = true;

    async function loadReviews() {
      try {
        const result = await getAdminReviews();

        if (active) {
          setReviews(result);
          setReviewsError("");
        }
      } catch (err) {
        if (active) {
          setReviewsError(err.message);
        }
      } finally {
        if (active) {
          setReviewsLoading(false);
        }
      }
    }

    loadReviews();

    return () => {
      active = false;
    };
  }, []);

  // Aprovar loja
  async function handleApprove(store) {
    if (processing) return;

    setProcessing(true);
    setStoresError("");

    try {
      await approveAdminStore(store.id);

      setPendingStores((prev) =>
        prev.filter((s) => s.id !== store.id)
      );

      notify("Loja aprovada com sucesso.");
    } catch (err) {
      setStoresError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  // Abrir modal de rejeição
  function openRejectModal(store) {
    setAction({ kind: "store", item: store });
    setReason("");
    setActionError("");
  }

  // Abrir modal de exclusão de avaliação
  function openDeleteReviewModal(review) {
    setAction({ kind: "review", item: review });
    setActionError("");
  }

  // Confirmar ação administrativa
  async function handleConfirm(e) {
    e.preventDefault();

    if (!action || processing) return;

    if (action.kind === "store" && !reason.trim()) {
      setActionError("Informe o motivo da rejeição.");
      return;
    }

    setProcessing(true);
    setActionError("");

    try {
      if (action.kind === "store") {
        await rejectAdminStore(action.item.id, reason.trim());

        setPendingStores((prev) =>
          prev.filter((s) => s.id !== action.item.id)
        );

        notify("Cadastro rejeitado com sucesso.");
      } else {
        await deleteAdminReview(action.item.id);

        setReviews((prev) =>
          prev.filter((r) => r.id !== action.item.id)
        );

        notify("Avaliação removida com sucesso.");
      }

      setAction(null);
      setReason("");
    } catch (err) {
      setActionError(err.message);
    } finally {
      setProcessing(false);
    }
  }

  function closeModal() {
    if (processing) return;

    setAction(null);
    setReason("");
    setActionError("");
  }

  return (
    <>
      {/* MODERAÇÃO DE LOJAS */}
      <section className="panel">
        <h2>
          Cadastros pendentes{" "}
          <span className="count-label">
            {storesLoading ? "..." : pendingStores.length}
          </span>
        </h2>

        {storesLoading && <p>Carregando lojas pendentes...</p>}

        {storesError && (
          <p className="error" role="alert">
            Erro ao carregar ou atualizar lojas: {storesError}
          </p>
        )}

        {!storesLoading &&
          !storesError &&
          pendingStores.length === 0 && (
            <p>Não há lojas aguardando aprovação.</p>
          )}

        {!storesLoading &&
          pendingStores.map((store) => (
            <article className="admin-row" key={store.id}>
              <div>
                <h3>{store.nome_loja}</h3>

                <p>
                  {store.endereco_cidade} - {store.endereco_uf}
                </p>

                <small>
                  WhatsApp: {store.whatsapp || "Não informado"}
                </small>
              </div>

              <div className="row">
                <button
                  className="outline"
                  disabled={processing}
                  onClick={() => openRejectModal(store)}
                >
                  Rejeitar
                </button>

                <button
                  className="primary"
                  disabled={processing}
                  onClick={() => handleApprove(store)}
                >
                  Aprovar
                </button>
              </div>
            </article>
          ))}
      </section>

      {/* MODERAÇÃO DE AVALIAÇÕES */}
      <section className="panel section-space">
        <h2>Avaliações e comentários</h2>

        {reviewsLoading && <p>Carregando avaliações...</p>}

        {reviewsError && (
          <p className="error" role="alert">
            Erro ao carregar avaliações: {reviewsError}
          </p>
        )}

        {!reviewsLoading &&
          !reviewsError &&
          reviews.length === 0 && (
            <p>Nenhuma avaliação cadastrada.</p>
          )}

        {!reviewsLoading &&
          reviews.map((review) => (
            <article className="admin-row" key={review.id}>
              <div>
                <strong>Avaliação de loja</strong>

                <small>
                  Nota: {review.nota} de 5
                </small>

                <small>
                  Data:{" "}
                  {new Date(review.criado_em).toLocaleDateString(
                    "pt-BR"
                  )}
                </small>

                <p>
                  {review.comentario || "Sem comentário."}
                </p>

                {review.foto_url && (
                  <img
                    className="review-photo"
                    src={review.foto_url}
                    alt="Foto da avaliação"
                  />
                )}
              </div>

              <div className="moderation-actions">
                <button
                  className="text-button danger"
                  disabled={processing}
                  onClick={() => openDeleteReviewModal(review)}
                >
                  Remover avaliação
                </button>
              </div>
            </article>
          ))}
      </section>

      {/* MODAL DE CONFIRMAÇÃO */}
      {action && (
        <Modal
          title={
            action.kind === "store"
              ? "Rejeitar cadastro"
              : "Remover avaliação"
          }
          onClose={closeModal}
        >
          <p>
            {action.kind === "store"
              ? action.item.nome_loja
              : "Esta avaliação será excluída permanentemente."}
          </p>

          <form onSubmit={handleConfirm}>
            {action.kind === "store" && (
              <Field label="Motivo da rejeição">
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  value={reason}
                  disabled={processing}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}

            {actionError && (
              <p className="error" role="alert">
                {actionError}
              </p>
            )}

            <div className="modal-actions">
              <button
                className="outline"
                type="button"
                disabled={processing}
                onClick={closeModal}
              >
                Cancelar
              </button>

              <button
                className="primary red"
                type="submit"
                disabled={processing}
              >
                {processing ? "Processando..." : "Confirmar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
