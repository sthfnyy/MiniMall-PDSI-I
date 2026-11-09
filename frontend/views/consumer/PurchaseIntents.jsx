import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, FileImage, RefreshCw, Scale, X } from "lucide-react";

import { Empty, Modal } from "../../components/ui";
import {
  attachContestationToIntent,
  contestationStatusInfo,
  createConsumerContestation,
  fetchConsumerPurchaseIntents,
  validateContestation,
  validateContestationFiles,
} from "../../services/consumerPurchaseIntents";


const STATUS_LABELS = {
  contato_realizado: "Contato realizado",
  compra_confirmada: "Compra confirmada",
  compra_nao_reconhecida: "Compra não reconhecida",
};

export default function PurchaseIntents({
  go,
  notify,
  useRealApi = false,
  fetchIntentsFn = fetchConsumerPurchaseIntents,
  createContestationFn = createConsumerContestation,
}) {
  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(useRealApi);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [motive, setMotive] = useState("");
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!useRealApi) {
      setIntents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setIntents(await fetchIntentsFn());
    } catch (loadError) {
      setError(loadError.message || "Não foi possível carregar suas intenções.");
    } finally {
      setLoading(false);
    }
  }, [useRealApi, fetchIntentsFn]);

  useEffect(() => { load(); }, [load]);

  function openContestation(intent) {
    setSelected(intent);
    setMotive("");
    setFiles([]);
    setError("");
  }

  function selectFiles(event) {
    const selectedFiles = Array.from(event.target.files || []);
    try {
      validateContestationFiles(selectedFiles);
      setFiles(selectedFiles);
      setError("");
    } catch (validationError) {
      setFiles([]);
      setError(validationError.message);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!selected || submitting) return;
    try {
      validateContestation(motive, files);
    } catch (validationError) {
      setError(validationError.message);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const contestation = await createContestationFn(selected.id, motive, files);
      setIntents((current) =>
        attachContestationToIntent(current, selected.id, contestation),
      );
      setSelected(null);
      setMotive("");
      setFiles([]);
      notify?.("Contestação enviada com sucesso. Aguardando análise administrativa.");
    } catch (submitError) {
      setError(submitError.message || "Não foi possível enviar a contestação.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="consumer-page">
      <button className="back-link" type="button" onClick={() => go?.("consumidor")}>
        ← Voltar ao perfil
      </button>
      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Compras e contatos</h1>
        <p>Consulte os contatos iniciados com as lojas e acompanhe suas contestações.</p>
      </div>

      {error && (
        <div className="empty-catalog-alert" role="alert">
          <AlertTriangle size={20} />
          <div><strong>Não foi possível concluir a operação</strong><p>{error}</p></div>
          {!selected && <button className="secondary" type="button" onClick={load}><RefreshCw size={14} /> Tentar novamente</button>}
        </div>
      )}

      {loading ? (
        <div className="panel" role="status">Carregando compras e contatos...</div>
      ) : intents.length === 0 ? (
        <Empty title="Nenhum contato registrado" text="Seus contatos com lojas aparecerão aqui." />
      ) : (
        <div className="review-list">
          {intents.map((intent) => {
            const canContest = intent.status === "compra_nao_reconhecida" && !intent.contestacao;
            return (
              <article className="panel review" key={intent.id}>
                <div className="review-top">
                  <div>
                    <span className="eyebrow muted">{intent.codigo}</span>
                    <h3>{intent.produto.titulo}</h3>
                    <p>Loja: {intent.loja.nome}</p>
                    <small>{new Date(intent.criado_em).toLocaleString("pt-BR")}</small>
                  </div>
                  <span className="status-badge pending">{STATUS_LABELS[intent.status] || intent.status}</span>
                </div>
                {intent.contestacao ? (
                  <div className="empty-catalog-alert" role="status">
                    <Scale size={18} />
                    <div>
                      <strong>{contestationStatusInfo(intent.contestacao.status).title}</strong>
                      <p>{contestationStatusInfo(intent.contestacao.status).text}</p>
                    </div>
                  </div>
                ) : canContest ? (
                  <div className="consumer-form-actions">
                    <button className="secondary" type="button" onClick={() => openContestation(intent)}>
                      <Scale size={16} /> Contestar compra
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <Modal title={`Contestar ${selected.codigo}`} onClose={() => !submitting && setSelected(null)}>
          <form onSubmit={submit}>
            <label className="field">
              <span>Motivo</span>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                value={motive}
                onChange={(event) => setMotive(event.target.value)}
                placeholder="Explique por que você reconhece essa compra e, se possível, informe detalhes que ajudem na análise."
              />
            </label>
            <label className="field">
              <span>Evidências (até 3 imagens de 5 MB)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectFiles} />
            </label>
            {files.map((file, index) => (
              <div className="consumer-info-item" key={`${file.name}-${index}`}>
                <FileImage size={18} />
                <div><strong>{file.name}</strong><small>{file.type} — {(file.size / 1024).toFixed(1)} KB</small></div>
                <button className="icon-button" type="button" disabled={submitting} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remover ${file.name}`}><X size={15} /></button>
              </div>
            ))}
            <div className="consumer-form-actions">
              <button className="secondary" type="button" disabled={submitting} onClick={() => setSelected(null)}>Cancelar</button>
              <button className="primary" type="submit" disabled={submitting}>{submitting ? "Enviando..." : "Enviar contestação"}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
