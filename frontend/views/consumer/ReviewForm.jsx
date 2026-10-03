import React, { useState } from "react";
import { Star } from "lucide-react";
import { Field } from "../../components/ui";

export default function ReviewForm({ store, onPublish, onCancel }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    try {
      onPublish({ rating, comment });
    } catch (publicationError) {
      setError(publicationError.message);
    }
  };

  return (
    <section className="consumer-page">
      <button className="back-link" type="button" onClick={onCancel}>
        ← Voltar à loja
      </button>

      <div className="page-title">
        <span className="eyebrow muted">MINHA CONTA</span>
        <h1>Avaliar loja</h1>
        <p>Compartilhe como foi sua experiência na {store.name}.</p>
      </div>

      <form className="review-form panel" onSubmit={handleSubmit}>
        <div className="review-form-store">
          <span className="eyebrow muted">LOJA</span>
          <h2>{store.name}</h2>
        </div>

        <fieldset className="review-rating-field">
          <legend>Como foi sua experiência?</legend>
          <div className="review-rating-options">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= rating ? "selected" : ""}
                aria-label={`${value} ${value === 1 ? "estrela" : "estrelas"}`}
                aria-pressed={rating === value}
                onClick={() => setRating(value)}
              >
                <Star size={32} fill={value <= rating ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
          <span className="review-rating-status" aria-live="polite">
            {rating ? `${rating} de 5 estrelas` : "Nenhuma nota selecionada"}
          </span>
        </fieldset>

        <Field label="Sua avaliação">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Escreva sobre sua experiência com a loja..."
            required
          />
        </Field>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="review-form-actions">
          <button className="outline" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary" type="submit">
            Publicar avaliação
          </button>
        </div>
      </form>
    </section>
  );
}
