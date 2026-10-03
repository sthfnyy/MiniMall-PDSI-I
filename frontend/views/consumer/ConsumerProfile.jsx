import React, { useState } from "react";
import {
  User,
  Mail,
  ShieldCheck,
  Pencil,
  Save,
  Heart,
  Coins,
} from "lucide-react";
import { Field } from "../../components/ui";

export default function ConsumerProfile({
  user,
  onUpdate,
  onFavorites,
  onPoints,
}) {
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");

  function handleSave(e) {
    e.preventDefault();

    onUpdate({
      ...user,
      name: name.trim(),
      email: email.trim(),
    });

    setEditing(false);
  }

  return (
    <section className="consumer-page">
      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Meu perfil</h1>
        <p>
          Consulte e atualize suas informações pessoais no MiniMall.
        </p>
      </div>

      <div className="consumer-profile-card">
        <div className="consumer-profile-header">
          <div className="consumer-avatar" aria-hidden="true">
            <User size={32} />
          </div>

          <div>
            <h2>{user?.name}</h2>
            <span className="consumer-role">Consumidor</span>
          </div>

          {!editing && (
            <button
              className="secondary"
              type="button"
              onClick={() => setEditing(true)}
            >
              <Pencil size={17} />
              Editar perfil
            </button>
          )}
        </div>

        {editing ? (
          <form className="consumer-profile-form" onSubmit={handleSave}>
            <Field
              label="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <Field
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="consumer-form-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setName(user?.name || "");
                  setEmail(user?.email || "");
                  setEditing(false);
                }}
              >
                Cancelar
              </button>

              <button className="primary" type="submit">
                <Save size={17} />
                Salvar alterações
              </button>
            </div>
          </form>
        ) : (
          <div className="consumer-profile-info">
            <div className="consumer-info-item">
              <Mail size={19} />
              <div>
                <span>E-mail</span>
                <strong>{user?.email}</strong>
              </div>
            </div>

            <div className="consumer-info-item">
              <ShieldCheck size={19} />
              <div>
                <span>Status</span>
                <strong>{user?.status}</strong>
              </div>
            </div>
          </div>
        )}
        {!editing && (
          <div className="consumer-profile-actions">
            <button
              className="secondary"
              type="button"
              onClick={onFavorites}
            >
              <Heart size={17} />
              Meus favoritos
            </button>

            <button
              className="secondary"
              type="button"
              onClick={onPoints}
            >
              <Coins size={17} />
              Meus pontos
            </button>
          </div>
        )}
      </div>
    </section>
  );
}