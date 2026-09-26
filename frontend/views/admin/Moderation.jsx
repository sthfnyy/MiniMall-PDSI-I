import React, { useState } from "react";
import { Modal, Field } from "../../components/ui";
import { moderateReview } from "../../services/admin";
export default function Moderation({ data, update, notify }) {
  const [action, setAction] = useState(null),
    [error, setError] = useState("");
  const pending = data.stores.filter((s) => s.status === "pendente");
  function submit(e) {
    e.preventDefault();
    const reason = new FormData(e.currentTarget).get("reason").trim();
    if (!reason) return setError("Informe o motivo.");
    update((d) => {
      if (action.kind === "store") {
        d.stores = d.stores.map((s) =>
          s.id === action.item.id ? { ...s, status: "rejeitada", reason } : s,
        );
        d.audit.push({
          store: action.item.id,
          reason,
          date: new Date().toISOString(),
          actor: "administrador",
          action: "reject",
        });
      } else moderateReview(d, action.item.id, action.part, reason);
      return d;
    });
    setAction(null);
    notify("Moderação registrada.");
  }
  return (
    <>
      <section className="panel">
        <h2>
          Cadastros pendentes{" "}
          <span className="count-label">{pending.length}</span>
        </h2>
        {!pending.length ? (
          <p>Não há lojas aguardando aprovação.</p>
        ) : (
          pending.map((s) => (
            <article className="admin-row" key={s.id}>
              <div>
                <h3>{s.name}</h3>
                <p>{s.description}</p>
                <small>{s.address}</small>
                <small>{s.hours}</small>
                <small>WhatsApp: {s.whatsapp || "Não informado"}</small>
              </div>
              <div className="row">
                <button
                  className="outline"
                  onClick={() => {
                    setError("");
                    setAction({ kind: "store", item: s });
                  }}
                >
                  Rejeitar
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    update((d) => {
                      d.stores = d.stores.map((x) =>
                        x.id === s.id ? { ...x, status: "aprovada" } : x,
                      );
                      d.audit.push({
                        store: s.id,
                        action: "approve",
                        date: new Date().toISOString(),
                        actor: "administrador",
                      });
                      return d;
                    });
                    notify("Loja aprovada.");
                  }}
                >
                  Aprovar
                </button>
              </div>
            </article>
          ))
        )}
      </section>
      <section className="panel section-space">
        <h2>Avaliações, comentários e fotos</h2>
        {!data.reviews.length && <p>Nenhuma avaliação cadastrada.</p>}
        {data.reviews.map((r) => (
          <article className="admin-row" key={r.id}>
            <div>
              <strong>
                {r.name} · {data.stores.find((s) => s.id === r.store)?.name}
              </strong>
              <small>Nota: {r.rating} de 5</small>
              <p>{r.comment || "Comentário removido."}</p>
              {r.photo && (
                <img
                  className="review-photo"
                  src={r.photo}
                  alt="Foto da avaliação"
                />
              )}
            </div>
            <div className="moderation-actions">
              {r.comment && (
                <button
                  className="outline"
                  onClick={() => {
                    setError("");
                    setAction({ kind: "review", part: "comment", item: r });
                  }}
                >
                  Remover comentário
                </button>
              )}
              {r.photo && (
                <button
                  className="outline"
                  onClick={() => {
                    setError("");
                    setAction({ kind: "review", part: "photo", item: r });
                  }}
                >
                  Remover foto
                </button>
              )}
              <button
                className="text-button danger"
                onClick={() => {
                  setError("");
                  setAction({ kind: "review", part: "review", item: r });
                }}
              >
                Remover avaliação
              </button>
            </div>
          </article>
        ))}
      </section>
      {action && (
        <Modal
          title={
            action.kind === "store"
              ? "Rejeitar cadastro"
              : action.part === "review"
                ? "Remover avaliação"
                : action.part === "photo"
                  ? "Remover foto"
                  : "Remover comentário"
          }
          onClose={() => setAction(null)}
        >
          <p>
            {action.kind === "store"
              ? action.item.name
              : "O conteúdo selecionado deixará de ser exibido publicamente."}
          </p>
          <form onSubmit={submit}>
            <Field label="Motivo">
              <textarea name="reason" required minLength={3} />
            </Field>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                className="outline"
                type="button"
                onClick={() => setAction(null)}
              >
                Cancelar
              </button>
              <button className="primary red">Confirmar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
