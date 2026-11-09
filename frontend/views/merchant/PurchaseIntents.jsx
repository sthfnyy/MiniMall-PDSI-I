import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShoppingBag, XCircle } from "lucide-react";

import { Empty, Modal, PageTitle } from "../../components/ui";
import {
  decideMerchantPurchaseIntent,
  fetchMerchantPurchaseIntents,
  updatePurchaseIntentInList,
} from "../../services/merchantPurchaseIntents";
import MerchantNav from "./MerchantNav";

const STATUS_LABELS = {
  contato_realizado: "Aguardando confirmação",
  compra_confirmada: "Compra confirmada",
  compra_nao_reconhecida: "Compra não reconhecida",
};

export default function PurchaseIntents({
  go,
  notify,
  useRealApi = false,
  fetchIntentsFn = fetchMerchantPurchaseIntents,
  decideIntentFn = decideMerchantPurchaseIntent,
}) {
  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(useRealApi);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState(null);
  const [decidingId, setDecidingId] = useState(null);

  const loadIntents = useCallback(async () => {
    if (!useRealApi) {
      setIntents([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setIntents(await fetchIntentsFn());
    } catch (loadError) {
      setError(loadError.message || "Não foi possível carregar as intenções de contato.");
    } finally {
      setLoading(false);
    }
  }, [useRealApi, fetchIntentsFn]);

  useEffect(() => {
    loadIntents();
  }, [loadIntents]);

  async function confirmDecision() {
    if (!decision || decidingId) return;
    setDecidingId(decision.intent.id);
    setError("");
    try {
      const updated = await decideIntentFn(decision.intent.id, decision.status);
      setIntents((current) => updatePurchaseIntentInList(current, updated));
      setDecision(null);
      notify?.(
        decision.status === "compra_confirmada"
          ? "Compra confirmada com sucesso."
          : "Compra marcada como não reconhecida.",
      );
    } catch (decisionError) {
      setError(decisionError.message || "Não foi possível registrar a decisão.");
      setDecision(null);
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <section className="merchant-page">
      <PageTitle
        eyebrow="PAINEL DO LOJISTA"
        title="Intenções de contato"
        text="Consulte os contatos iniciados pelos consumidores e informe se a compra foi realizada."
      />
      <MerchantNav current="intencoes" go={go} />

      {error && (
        <div className="empty-catalog-alert" role="alert">
          <AlertTriangle size={20} />
          <div><strong>Não foi possível concluir a operação</strong><p>{error}</p></div>
          <button className="secondary" type="button" onClick={loadIntents}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <div className="panel" role="status"><p>Carregando intenções de contato...</p></div>
      ) : intents.length === 0 ? (
        <Empty
          title="Nenhuma intenção de contato"
          text="Os contatos iniciados pelos consumidores aparecerão aqui."
        />
      ) : (
        <div className="review-list">
          {intents.map((intent) => {
            const pending = intent.status === "contato_realizado";
            return (
              <article className="panel review" key={intent.id}>
                <div className="review-top">
                  <div>
                    <span className="eyebrow muted">{intent.codigo}</span>
                    <h3>{intent.produto.titulo}</h3>
                    <p>Consumidor: {intent.consumidor.nome}</p>
                    <small>{new Date(intent.criado_em).toLocaleString("pt-BR")}</small>
                  </div>
                  <span className={`status-badge ${pending ? "pending" : "approved"}`}>
                    {STATUS_LABELS[intent.status] || intent.status}
                  </span>
                </div>
                {pending && (
                  <div className="consumer-form-actions merchant-actions">
                    <button
                      className="primary"
                      type="button"
                      disabled={Boolean(decidingId)}
                      onClick={() => setDecision({ intent, status: "compra_confirmada" })}
                    >
                      <CheckCircle2 size={16} /> Confirmar compra
                    </button>
                    <button
                      className="secondary"
                      type="button"
                      disabled={Boolean(decidingId)}
                      onClick={() => setDecision({ intent, status: "compra_nao_reconhecida" })}
                    >
                      <XCircle size={16} /> Não reconheço esta compra
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {decision && (
        <Modal title="Confirmar decisão" onClose={() => !decidingId && setDecision(null)}>
          <p>
            {decision.status === "compra_confirmada"
              ? "Confirmar que esta compra foi realizada?"
              : "Informar que esta compra não foi reconhecida?"}
          </p>
          <div className="consumer-form-actions merchant-actions">
            <button className="secondary" type="button" disabled={Boolean(decidingId)} onClick={() => setDecision(null)}>
              Cancelar
            </button>
            <button className="primary" type="button" disabled={Boolean(decidingId)} onClick={confirmDecision}>
              <ShoppingBag size={16} /> {decidingId ? "Salvando..." : "Confirmar decisão"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
