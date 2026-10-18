import React, { useEffect, useState } from "react";
import { Coins, Store } from "lucide-react";
import {
  getConsumerPointsViewData,
  loadConsumerPoints,
} from "../../services/points.js";

export default function ConsumerPoints({ user, data, go, useRealApi = false }) {
  const [realPoints, setRealPoints] = useState(null);
  const [loading, setLoading] = useState(useRealApi);
  const [error, setError] = useState("");

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
    setError("");
    loadConsumerPoints(true)
      .then((result) => {
        if (active) setRealPoints(result);
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

  const pointsData = getConsumerPointsViewData({
    useRealApi,
    realPoints,
    data,
    userId: user?.id,
  });
  const totalPoints = pointsData?.saldo_total ?? 0;
  const sortedTransactions = pointsData?.historico || [];

  // Mapa de lojas para obter o nome correspondente
  const storesMap = (data?.stores || []).reduce((acc, s) => {
    acc[s.id] = s;
    return acc;
  }, {});

  const storeBalances = (pointsData?.saldos_por_loja || []).map((item) => ({
    storeId: item.loja_id,
    storeName: storesMap[item.loja_id]?.name || `Loja #${item.loja_id}`,
    balance: item.saldo,
  }));

  function formatPoints(value) {
    return Number(value).toLocaleString("pt-BR");
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
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
    <section className="consumer-page">
      {go && (
        <button className="back-link" onClick={() => go("consumidor")}>
          ← Voltar ao perfil
        </button>
      )}

      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Meus pontos</h1>
        <p>
          Consulte seu saldo e o histórico de pontos acumulados no MiniMall.
        </p>
      </div>

      {loading && <p>Carregando seus pontos...</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!loading && !error && sortedTransactions.length > 0 ? (
        <>
          {/* SEÇÃO 1 — SALDO TOTAL */}
           <div className="consumer-points-summary">
            <div className="consumer-points-icon">
              <Coins size={30} />
            </div>

            <div className="consumer-points-content">
              <span>MEUS PONTOS</span>

              <strong>
                {formatPoints(totalPoints)}{" "}
                {Math.abs(totalPoints) === 1 ? "ponto" : "pontos"}
              </strong>
            </div>
          </div>

          {/* SEÇÃO 2 — SALDO POR LOJA */}
          <section className="panel" style={{ marginBottom: "28px" }}>
            <div
              className="consumer-favorites-header"
              style={{ marginBottom: "18px" }}
            >
              <div>
                <span className="section-index">SALDO POR LOJA</span>
                <h2>Pontos em cada loja</h2>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "16px",
              }}
            >
              {storeBalances.map((item) => (
                <div
                  key={item.storeId}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "18px 20px",
                    background: "#fafbf9",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "var(--muted)",
                      marginBottom: "8px",
                    }}
                  >
                    <Store size={16} />
                    <strong style={{ color: "var(--ink)", fontSize: "15px" }}>
                      {item.storeName}
                    </strong>
                  </div>
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: "600",
                      color: "#364a1e",
                    }}
                  >
                    {formatPoints(item.balance)}{" "}
                    {Math.abs(item.balance) === 1 ? "ponto" : "pontos"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* SEÇÃO 3 — HISTÓRICO */}
          <section className="panel">
            <div
              className="consumer-favorites-header"
              style={{ marginBottom: "18px" }}
            >
              <div>
                <span className="section-index">HISTÓRICO</span>
                <h2>Movimentações de pontos</h2>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Quantidade</th>
                    <th>Descrição</th>
                    <th>Loja</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTransactions.map((t) => {
                    const isCredit = t.tipo === "credito";
                    const storeName =
                      storesMap[t.loja_id]?.name || `Loja #${t.loja_id}`;

                    return (
                      <tr key={t.id}>
                        <td>
                          <span
                            className={`status-pill ${
                              isCredit ? "" : "pending"
                            }`}
                          >
                            {isCredit ? "Crédito" : "Resgate"}
                          </span>
                        </td>
                        <td>
                          <strong
                            style={{
                              color: isCredit ? "#2e7d32" : "#c62828",
                              fontSize: "14px",
                            }}
                          >
                            {isCredit
                              ? `+${formatPoints(t.quantidade)}`
                              : `-${formatPoints(t.quantidade)}`}{" "}
                            pontos
                          </strong>
                        </td>
                        <td>
                          {t.descricao ||
                            (isCredit
                              ? "Crédito de pontos"
                              : "Resgate de pontos")}
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Store
                              size={14}
                              style={{ color: "var(--muted)" }}
                            />
                            {storeName}
                          </span>
                        </td>
                        <td>{formatDate(t.criado_em)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : !loading && !error ? (
        /* ESTADO VAZIO */
        <div className="empty">
          <Coins size={36} />
          <h3>Ainda não há movimentações de pontos.</h3>
          <p>
            Seus pontos aparecerão aqui quando você realizar atividades que gerem
            pontuação.
          </p>
          {go && (
            <button className="primary" onClick={() => go("explorar")}>
              Explorar vitrine
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
