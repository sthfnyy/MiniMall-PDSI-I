import React from "react";
import { Eye, Store, Package, Users } from "lucide-react";
import { metrics } from "../../services/admin";
export default function Dashboard({ data }) {
  const m = metrics(data);
  return (
    <section aria-label="Dados da plataforma">
      <div className="dashboard-stats four">
        {[
          [Eye, m.views, "Visualizações"],
          [Store, m.stores, "Total de lojas"],
          [Package, m.products, "Produtos cadastrados"],
          [Users, m.engaged, "Usuários com avaliações"],
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
              <dd>{m.reviews}</dd>
            </div>
            <div>
              <dt>Avaliações com foto</dt>
              <dd>{m.photos}</dd>
            </div>
            <div>
              <dt>Usuários que avaliaram uma loja</dt>
              <dd>
                {m.engaged} de {m.users}
              </dd>
            </div>
          </dl>
          <progress
            max="100"
            value={m.engagement}
            aria-label="Percentual de usuários com avaliações"
          />
          <p>
            {m.engagement}% dos usuários cadastrados publicaram uma avaliação.
          </p>
        </section>
        <section className="panel">
          <h2>Situação das lojas</h2>
          <dl className="metric-list">
            {[
              ["aprovada", "Aprovadas"],
              ["pendente", "Aguardando aprovação"],
              ["rejeitada", "Rejeitadas"],
            ].map(([status, label]) => (
              <div key={status}>
                <dt>{label}</dt>
                <dd>{data.stores.filter((s) => s.status === status).length}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <p className="admin-data-note">
        Dados locais do protótipo. Visualizações contabilizam aberturas de
        produtos e páginas de lojas.
      </p>
    </section>
  );
}
