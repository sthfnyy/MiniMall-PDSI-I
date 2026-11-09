import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileImage, RefreshCw, XCircle } from "lucide-react";

import { Empty, Modal } from "../../components/ui";
import {
  CONTEST_FILTERS,
  CONTEST_STATUS_BADGES,
  CONTEST_STATUS_LABELS,
  INITIAL_CONTEST_FILTER,
  MERCHANT_DECISION_LABELS,
  canDecideContest,
  decideAdminPurchaseContest,
  evidenceViewKind,
  fetchAdminPurchaseContest,
  fetchAdminPurchaseContests,
  fetchContestEvidenceBlob,
  updateContestInList,
  validateContestDecision,
} from "../../services/adminPurchaseContests";

const CONFLICT_MESSAGE =
  "Esta contestação já foi decidida. Os dados foram atualizados.";

function formatDate(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function StatusBadge({ status }) {
  return (
    <span className={`status-badge ${CONTEST_STATUS_BADGES[status] || "pending"}`}>
      {CONTEST_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function PurchaseContests({
  notify,
  fetchContestsFn = fetchAdminPurchaseContests,
  fetchContestFn = fetchAdminPurchaseContest,
  decideContestFn = decideAdminPurchaseContest,
  fetchEvidenceFn = fetchContestEvidenceBlob,
}) {
  const [statusFilter, setStatusFilter] = useState(INITIAL_CONTEST_FILTER);
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [confirming, setConfirming] = useState(null);
  const [note, setNote] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [processing, setProcessing] = useState(false);

  const [evidence, setEvidence] = useState(null);
  const evidenceUrlRef = useRef(null);

  const loadContests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setContests(await fetchContestsFn(statusFilter));
    } catch (loadError) {
      setError(loadError.message || "Não foi possível carregar as contestações.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, fetchContestsFn]);

  useEffect(() => {
    loadContests();
  }, [loadContests]);

  const closeEvidence = useCallback(() => {
    if (evidenceUrlRef.current) {
      URL.revokeObjectURL(evidenceUrlRef.current);
      evidenceUrlRef.current = null;
    }
    setEvidence(null);
  }, []);

  // Revoga o Object URL ao desmontar a página.
  useEffect(() => closeEvidence, [closeEvidence]);

  const loadDetail = useCallback(async (contestId) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const loaded = await fetchContestFn(contestId);
      setDetail(loaded);
      return loaded;
    } catch (loadError) {
      setDetailError(loadError.message || "Não foi possível carregar a contestação.");
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, [fetchContestFn]);

  function openDetail(contest) {
    closeEvidence();
    setSelectedId(contest.id);
    setDetail(null);
    setConfirming(null);
    setNote("");
    setDecisionError("");
    loadDetail(contest.id);
  }

  function closeDetail() {
    if (processing) return;
    closeEvidence();
    setSelectedId(null);
    setDetail(null);
    setConfirming(null);
    setNote("");
    setDecisionError("");
  }

  async function openEvidence(item) {
    closeEvidence();
    setEvidence({ item, url: null, loading: true, error: "" });
    try {
      const blob = await fetchEvidenceFn(selectedId, item.id);
      const typed = blob.type ? blob : new Blob([blob], { type: item.tipo_mime });
      const url = URL.createObjectURL(typed);
      evidenceUrlRef.current = url;
      setEvidence({ item, url, loading: false, error: "" });
    } catch (loadError) {
      setEvidence({
        item,
        url: null,
        loading: false,
        error: loadError.message || "Não foi possível carregar a evidência.",
      });
    }
  }

  function startDecision(status) {
    if (processing) return;
    setConfirming(status);
    setNote("");
    setDecisionError("");
  }

  async function confirmDecision(event) {
    event.preventDefault();
    if (!detail || !confirming || processing) return;
    try {
      validateContestDecision(confirming, note);
    } catch (validationError) {
      setDecisionError(validationError.message);
      return;
    }

    setProcessing(true);
    setDecisionError("");
    try {
      const updated = await decideContestFn(detail.id, confirming, note);
      setDetail(updated);
      setContests((current) => updateContestInList(current, updated, statusFilter));
      setConfirming(null);
      setNote("");
      notify?.(
        updated.status === "aprovada"
          ? "Contestação aprovada com sucesso."
          : "Contestação reprovada com sucesso.",
      );
    } catch (decisionFailure) {
      if (decisionFailure.status === 409) {
        setConfirming(null);
        setDecisionError(CONFLICT_MESSAGE);
        const refreshed = await loadDetail(detail.id);
        if (refreshed) {
          setContests((current) => updateContestInList(current, refreshed, statusFilter));
        }
      } else {
        setDecisionError(decisionFailure.message || "Não foi possível registrar a decisão.");
      }
    } finally {
      setProcessing(false);
    }
  }

  const evidenceKind = evidence ? evidenceViewKind(evidence.item.tipo_mime) : null;

  return (
    <section className="panel">
      <div className="review-top">
        <h2>
          Contestações de compras{" "}
          <span className="count-label">{loading ? "..." : contests.length}</span>
        </h2>
        <button className="secondary" type="button" onClick={loadContests} disabled={loading}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <nav className="admin-navigation" aria-label="Filtrar contestações">
        {CONTEST_FILTERS.map(([value, label]) => (
          <button
            key={value || "todas"}
            type="button"
            aria-current={statusFilter === value ? "page" : undefined}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="empty-catalog-alert" role="alert">
          <AlertTriangle size={20} />
          <div>
            <strong>Não foi possível carregar as contestações</strong>
            <p>{error}</p>
          </div>
          <button className="secondary" type="button" onClick={loadContests}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <p role="status">Carregando contestações...</p>
      ) : !error && contests.length === 0 ? (
        <Empty
          title="Nenhuma contestação encontrada"
          text="Não há contestações de compra para o filtro selecionado."
        />
      ) : (
        !error &&
        contests.map((contest) => (
          <article className="admin-row" key={contest.id}>
            <div>
              <span className="eyebrow muted">{contest.codigo}</span>
              <h3>{contest.produto_nome}</h3>
              <p>Consumidor: {contest.consumidor_nome} · Loja: {contest.loja_nome}</p>
              <small>Contestada em {formatDate(contest.criado_em)}</small>
            </div>
            <div className="row">
              <StatusBadge status={contest.status} />
              <button className="outline" type="button" onClick={() => openDetail(contest)}>
                Ver detalhes
              </button>
            </div>
          </article>
        ))
      )}

      {selectedId && (
        <Modal
          wide
          title={detail ? `Contestação ${detail.intencao.codigo}` : "Contestação"}
          onClose={closeDetail}
        >
          {detailLoading && <p role="status">Carregando detalhes...</p>}

          {detailError && (
            <div className="empty-catalog-alert" role="alert">
              <AlertTriangle size={20} />
              <div><strong>Erro ao carregar</strong><p>{detailError}</p></div>
              <button className="secondary" type="button" onClick={() => loadDetail(selectedId)}>
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          )}

          {detail && (
            <>
              <dl className="metric-list">
                <div><dt>Código</dt><dd>{detail.intencao.codigo}</dd></div>
                <div><dt>Status</dt><dd><StatusBadge status={detail.status} /></dd></div>
                <div><dt>Consumidor</dt><dd>{detail.consumidor.nome}</dd></div>
                <div><dt>Produto</dt><dd>{detail.produto.titulo}</dd></div>
                <div><dt>Loja</dt><dd>{detail.loja.nome}</dd></div>
                <div><dt>Data do contato</dt><dd>{formatDate(detail.intencao.criado_em)}</dd></div>
                <div>
                  <dt>Decisão do lojista</dt>
                  <dd>
                    {MERCHANT_DECISION_LABELS[detail.intencao.status] || detail.intencao.status}
                    {detail.intencao.decidido_em && ` em ${formatDate(detail.intencao.decidido_em)}`}
                    {detail.intencao.decidido_por && ` por ${detail.intencao.decidido_por.nome}`}
                  </dd>
                </div>
                <div><dt>Contestada em</dt><dd>{formatDate(detail.criado_em)}</dd></div>
              </dl>

              <h3>Motivo da contestação</h3>
              <p>{detail.motivo}</p>

              <h3>Evidências</h3>
              {detail.evidencias.length === 0 ? (
                <p>Nenhuma evidência enviada.</p>
              ) : (
                detail.evidencias.map((item) => (
                  <div className="consumer-info-item" key={item.id}>
                    <FileImage size={18} />
                    <div>
                      <strong>{item.nome_arquivo}</strong>
                      <small>{item.tipo_mime} — {(item.tamanho_bytes / 1024).toFixed(1)} KB</small>
                    </div>
                    <button
                      className="outline"
                      type="button"
                      disabled={evidence?.loading}
                      onClick={() => openEvidence(item)}
                    >
                      Visualizar
                    </button>
                  </div>
                ))
              )}

              {evidence && (
                <div className="panel" aria-live="polite">
                  <div className="review-top">
                    <strong>{evidence.item.nome_arquivo}</strong>
                    <button className="secondary" type="button" onClick={closeEvidence}>
                      Fechar visualização
                    </button>
                  </div>
                  {evidence.loading && <p role="status">Carregando evidência...</p>}
                  {evidence.error && <p className="error" role="alert">{evidence.error}</p>}
                  {evidence.url && evidenceKind === "image" && (
                    <img
                      src={evidence.url}
                      alt={`Evidência ${evidence.item.nome_arquivo}`}
                      style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }}
                    />
                  )}
                  {evidence.url && evidenceKind === "pdf" && (
                    <a className="outline" href={evidence.url} target="_blank" rel="noopener noreferrer">
                      Abrir documento em nova aba
                    </a>
                  )}
                  {evidence.url && evidenceKind === "download" && (
                    <>
                      <p>Este tipo de arquivo não pode ser exibido diretamente no navegador.</p>
                      <a className="outline" href={evidence.url} download={evidence.item.nome_arquivo}>
                        Baixar arquivo
                      </a>
                    </>
                  )}
                </div>
              )}

              {!canDecideContest(detail) && (
                <>
                  <h3>Decisão administrativa</h3>
                  <dl className="metric-list">
                    <div><dt>Decisão</dt><dd>{CONTEST_STATUS_LABELS[detail.status]}</dd></div>
                    <div><dt>Decidido por</dt><dd>{detail.decidido_por?.nome || "—"}</dd></div>
                    <div><dt>Decidido em</dt><dd>{formatDate(detail.decidido_em)}</dd></div>
                    {detail.observacao_admin && (
                      <div><dt>Observação</dt><dd>{detail.observacao_admin}</dd></div>
                    )}
                  </dl>
                </>
              )}

              {decisionError && <p className="error" role="alert">{decisionError}</p>}

              {canDecideContest(detail) && !confirming && (
                <div className="consumer-form-actions">
                  <button
                    className="outline"
                    type="button"
                    disabled={processing}
                    onClick={() => startDecision("reprovada")}
                  >
                    <XCircle size={16} /> Reprovar contestação
                  </button>
                  <button
                    className="primary"
                    type="button"
                    disabled={processing}
                    onClick={() => startDecision("aprovada")}
                  >
                    <CheckCircle2 size={16} /> Aprovar contestação
                  </button>
                </div>
              )}

              {canDecideContest(detail) && confirming && (
                <form className="panel" onSubmit={confirmDecision}>
                  <strong>
                    {confirming === "aprovada"
                      ? "Confirmar a aprovação desta contestação? A decisão é definitiva."
                      : "Confirmar a reprovação desta contestação? A decisão é definitiva."}
                  </strong>
                  {confirming === "reprovada" && (
                    <label className="field">
                      <span>Observação (obrigatória)</span>
                      <textarea
                        required
                        minLength={3}
                        maxLength={1000}
                        value={note}
                        disabled={processing}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Explique o motivo da reprovação."
                      />
                    </label>
                  )}
                  <div className="consumer-form-actions">
                    <button
                      className="secondary"
                      type="button"
                      disabled={processing}
                      onClick={() => setConfirming(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="primary"
                      type="submit"
                      disabled={processing || (confirming === "reprovada" && note.trim().length < 3)}
                    >
                      {processing
                        ? "Registrando..."
                        : confirming === "aprovada"
                          ? "Confirmar aprovação"
                          : "Confirmar reprovação"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
