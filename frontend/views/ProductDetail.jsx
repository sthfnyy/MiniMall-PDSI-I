import React, { useState, useEffect } from "react";
import {
  Store,
  ChevronRight,
  MessageCircle,
  ArrowUpRight,
  ShieldCheck,
  MapPin,
} from "lucide-react";
import { money, price } from "../services/catalog";
export default function ProductDetail({ product: p, store: s, go, contact }) {
  const [variation, setVariation] = useState("");
  useEffect(() => setVariation(""), [p.id]);
  return (
    <>
      <button className="back-link" onClick={() => go("explorar")}>
        ← Voltar à vitrine
      </button>
      <div className="product-detail">
        <div className="detail-image">
          <img src={p.image} alt={p.name} />
          {p.sale > 0 && <span className="sale-tag">Oferta local</span>}
        </div>
        <div className="detail-copy">
          <span className="eyebrow muted">{p.category}</span>
          <h1>{p.name}</h1>
          <button className="store-link" onClick={() => go(`loja/${s.id}`)}>
            <Store size={16} />
            {s.name}
            <ChevronRight size={15} />
          </button>
          <div className="price big-price">
            <strong>{money(price(p))}</strong>
            {p.sale > 0 && <s>{money(p.price)}</s>}
          </div>
          <p>{p.description}</p>
          <h4>Opções disponíveis</h4>
          <div className="variation-list">
            {p.variations.map((v) => (
              <button
                className={variation === v ? "selected" : ""}
                key={v}
                onClick={() => setVariation(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <small>Confirme a disponibilidade diretamente com a loja.</small>
          <button className="primary whatsapp full" onClick={contact}>
            <MessageCircle size={20} />
            Conversar pelo WhatsApp
            <ArrowUpRight size={18} />
          </button>
          <div className="contact-note">
            <ShieldCheck size={19} />
            <span>A compra é combinada diretamente com o lojista.</span>
          </div>
        </div>
      </div>
      <div className="panel store-summary">
        <div>
          <span className="eyebrow muted">CONHEÇA QUEM VENDE</span>
          <h2>{s.name}</h2>
          <p>
            <MapPin size={16} />
            {s.address}
          </p>
        </div>
        <button className="outline" onClick={() => go(`loja/${s.id}`)}>
          Ver loja e avaliações
          <ArrowUpRight size={17} />
        </button>
      </div>
    </>
  );
}
