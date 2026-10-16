
import React, { useEffect, useState } from "react";
import { Eye, Store, Package, Users } from "lucide-react";
import { getAdminDashboard } from "../../services/admin";

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const result = await getAdminDashboard();

        if (active) {
          setMetrics(result);
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <p>Carregando dados administrativos...</p>;
  }

  if (error) {
    return <p role="alert">Erro ao carregar dashboard: {error}</p>;
  }

  if (!metrics) {
    return <p>Nenhum dado administrativo disponível.</p>;
  }

  const totalLojas =
    metrics.total_lojas_aprovadas +
    metrics.total_lojas_pendentes +
    metrics.total_lojas_rejeitadas;

  return (
    <section aria-label="Dados da plataforma">
      <div className="dashboard-stats four">
        {[
          [Eye, metrics.total_visualizacoes, "Visualizações"],
          [Store, totalLojas, "Total de lojas"],
          [Package, metrics.total_produtos, "Produtos cadastrados"],
          [Users, metrics.total_usuarios, "Usuários cadastrados"],
        ].map(([Icon, value, label]) => (
          <div className="stat" key={label}>
            <Icon />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="admin-columns">
        <section className="panel">
          <h2>Engajamento dos usuários</h2>
          <dl className="metric-list">
            <div>
              <dt>Avaliações publicadas</dt>
              <dd>{metrics.total_avaliacoes}</dd>
            </div>
            <div>
              <dt>Engajamento (avaliações + favoritos)</dt>
              <dd>{metrics.engajamento_proxy}</dd>
            </div>
            <div>
              <dt>Total de usuários</dt>
              <dd>{metrics.total_usuarios}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <h2>Situação das lojas</h2>
          <dl className="metric-list">
            {[
              ["Aprovadas", metrics.total_lojas_aprovadas],
              ["Aguardando aprovação", metrics.total_lojas_pendentes],
              ["Rejeitadas", metrics.total_lojas_rejeitadas],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  );
}
