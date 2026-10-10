import React, { useState, useEffect } from "react";
import {
  Store,
  MapPin,
  Phone,
  Clock,
  Instagram,
  Tag,
  FileText,
  Save,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { Field, PageTitle } from "../../components/ui";
import StoreIdentity from "../../components/StoreIdentity";
import { getMerchantStore, saveMerchantStore } from "../../services/merchant";

export default function StoreSettings({
  user,
  data,
  onSaveStore,
  go,
  notify,
}) {
  const currentStore = getMerchantStore(data, user);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("");
  const [hours, setHours] = useState("");
  const [instagram, setInstagram] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Sync form state when currentStore or categories change
  useEffect(() => {
    if (currentStore) {
      setName(currentStore.name || "");
      setDescription(currentStore.description || "");
      setWhatsapp(currentStore.whatsapp || "");
      setAddress(currentStore.address || "");
      setCategory(currentStore.category || data.categories?.[0] || "");
      setHours(currentStore.hours || "");
      setInstagram(currentStore.instagram || "");
    } else {
      setName(user?.name !== "Dona Flor" ? user?.name || "" : "");
      setDescription("");
      setWhatsapp("");
      setAddress("");
      setCategory(data.categories?.[0] || "");
      setHours("");
      setInstagram("");
    }
    setError("");
  }, [currentStore, user, data.categories]);

  function handleReset() {
    if (currentStore) {
      setName(currentStore.name || "");
      setDescription(currentStore.description || "");
      setWhatsapp(currentStore.whatsapp || "");
      setAddress(currentStore.address || "");
      setCategory(currentStore.category || data.categories?.[0] || "");
      setHours(currentStore.hours || "");
      setInstagram(currentStore.instagram || "");
    } else {
      setName("");
      setDescription("");
      setWhatsapp("");
      setAddress("");
      setCategory(data.categories?.[0] || "");
      setHours("");
      setInstagram("");
    }
    setError("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      const payload = {
        name,
        description,
        whatsapp,
        address,
        category,
        hours,
        instagram,
      };

      const result = saveMerchantStore(data, user, payload);

      if (onSaveStore) {
        onSaveStore(result.store);
      }

      const msg = result.isNew
        ? "Loja cadastrada com sucesso! Ela foi enviada para análise."
        : "Dados da loja atualizados com sucesso!";
      if (notify) notify(msg);
    } catch (err) {
      setError(err.message || "Erro ao salvar as configurações da loja.");
    } finally {
      setIsSaving(false);
    }
  }

  const isApproved = currentStore?.status === "aprovada";
  const isPending = currentStore?.status === "pendente";
  const isRejected = currentStore?.status === "rejeitada";

  return (
    <section className="consumer-page merchant-page">
      <PageTitle
        eyebrow="PAINEL DO LOJISTA"
        title="Configuração da Loja"
        text="Cadastre e mantenha atualizadas as informações da sua loja para os clientes no MiniMall."
      />

      {currentStore ? (
        <div className="merchant-status-banner">
          <div className="merchant-identity-preview">
            <StoreIdentity store={currentStore} />
            <div>
              <div className="merchant-title-row">
                <h2>{currentStore.name}</h2>
                {isApproved && (
                  <span className="status-badge approved">
                    <CheckCircle2 size={14} /> Aprovada
                  </span>
                )}
                {isPending && (
                  <span className="status-badge pending">
                    <Clock3 size={14} /> Pendente de aprovação
                  </span>
                )}
                {isRejected && (
                  <span className="status-badge rejected">
                    <AlertTriangle size={14} /> Rejeitada
                  </span>
                )}
              </div>
              <p className="muted merchant-status-desc">
                {isApproved &&
                  "Sua loja está ativa e visível para todos os consumidores na vitrine."}
                {isPending &&
                  "Seu cadastro está aguardando aprovação da administração para ser exibido na vitrine pública."}
                {isRejected &&
                  (currentStore.motivo_rejeicao
                    ? `Motivo: ${currentStore.motivo_rejeicao}. Ajuste as informações abaixo e salve novamente.`
                    : "Sua loja precisa de revisões. Ajuste as informações abaixo e salve para reenviar.")}
              </p>
            </div>
          </div>

          {isApproved && (
            <button
              type="button"
              className="secondary merchant-view-btn"
              onClick={() => go(`loja/${currentStore.id}`)}
            >
              <ExternalLink size={16} />
              Ver na vitrine pública
            </button>
          )}
        </div>
      ) : (
        <div className="merchant-empty-notice">
          <Store size={32} />
          <div>
            <h3>Cadastre sua loja</h3>
            <p>
              Preencha os campos abaixo para registrar seu estabelecimento no
              MiniMall e começar a divulgar seus produtos.
            </p>
          </div>
        </div>
      )}

      <div className="consumer-profile-card merchant-form-card">
        <form onSubmit={handleSubmit} className="merchant-form">
          <div className="merchant-form-section">
            <h3>Informações Básicas</h3>
            <p className="muted">
              Esses dados identificam sua loja na busca e na página do estabelecimento.
            </p>

            <div className="merchant-grid">
              <Field label="Nome da loja *">
                <input
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Flor de Lis Modas"
                />
              </Field>

              <Field label="Categoria principal">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {(data.categories || []).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Descrição da loja">
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Conte brevemente sobre o seu negócio, tipos de produtos comercializados ou diferenciais..."
              />
            </Field>
          </div>

          <div className="merchant-form-section">
            <h3>Contato e Localização</h3>
            <p className="muted">
              Canais diretos para os clientes conversarem com você e encontrarem seu endereço físico.
            </p>

            <div className="merchant-grid">
              <Field label="WhatsApp para atendimento *">
                <input
                  type="tel"
                  required
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(89) 99999-9999"
                />
              </Field>

              <Field label="Instagram (opcional)">
                <input
                  type="text"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@sualoja ou link do perfil"
                />
              </Field>
            </div>

            <Field label="Localização / Endereço completo *">
              <input
                type="text"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Rua Coronel Francisco Santos, 120, Centro, Picos – PI"
              />
            </Field>

            <Field label="Horário de funcionamento">
              <input
                type="text"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ex: Segunda a sexta, 8h às 18h · Sábado, 8h às 13h"
              />
            </Field>
          </div>

          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className="consumer-form-actions merchant-actions">
            <button
              type="button"
              className="secondary"
              onClick={handleReset}
              disabled={isSaving}
            >
              <RotateCcw size={16} />
              Descartar alterações
            </button>

            <button type="submit" className="primary" disabled={isSaving}>
              <Save size={16} />
              {isSaving
                ? "Salvando…"
                : currentStore
                  ? "Salvar alterações"
                  : "Cadastrar loja"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

