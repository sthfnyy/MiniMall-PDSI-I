import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateReviewsSummary,
  fetchMerchantReviews,
  getStoreReviews,
  normalizeReviewFromApi,
} from "../services/merchant.js";

test("normalizeReviewFromApi mapeia campos da API de avaliações para o frontend", () => {
  const apiItem = {
    id: "aval-123",
    loja_id: "loja-456",
    nota: 5,
    comentario: "Atendimento impecável e produtos de excelente qualidade!",
    foto_url: "https://example.com/foto-principal.jpg",
    criado_em: "2026-11-08T15:30:00Z",
    consumidor_nome: "Ana Beatriz",
    fotos: [
      {
        id: "foto-1",
        url: "https://example.com/foto-1.jpg",
        criado_em: "2026-11-08T15:30:00Z",
      },
      {
        id: "foto-2",
        url: "https://example.com/foto-2.jpg",
        criado_em: "2026-11-08T15:31:00Z",
      },
    ],
  };

  const normalized = normalizeReviewFromApi(apiItem);

  assert.equal(normalized.id, "aval-123");
  assert.equal(normalized.storeId, "loja-456");
  assert.equal(normalized.rating, 5);
  assert.equal(normalized.comment, "Atendimento impecável e produtos de excelente qualidade!");
  assert.equal(normalized.consumerName, "Ana Beatriz");
  assert.equal(normalized.date, "2026-11-08T15:30:00Z");
  assert.equal(normalized.photos.length, 2);
  assert.equal(normalized.photos[0].url, "https://example.com/foto-1.jpg");
});

test("normalizeReviewFromApi utiliza foto_url quando fotos estiver vazio", () => {
  const apiItem = {
    id: "aval-789",
    loja_id: "loja-456",
    nota: 4,
    comentario: "Muito bom",
    foto_url: "https://example.com/capa.jpg",
    criado_em: "2026-11-07T10:00:00Z",
    consumidor_nome: null,
    fotos: [],
  };

  const normalized = normalizeReviewFromApi(apiItem);

  assert.equal(normalized.consumerName, "Consumidor");
  assert.equal(normalized.photos.length, 1);
  assert.equal(normalized.photos[0].url, "https://example.com/capa.jpg");
});

test("fetchMerchantReviews consulta GET /lojista/avaliacoes", async () => {
  const mockRequest = async (path) => {
    assert.equal(path, "/lojista/avaliacoes");
    return [
      {
        id: "a-1",
        loja_id: "l-1",
        nota: 5,
        comentario: "Gostei muito",
        foto_url: "",
        criado_em: "2026-11-01T12:00:00Z",
        consumidor_nome: "Carlos",
        fotos: [],
      },
    ];
  };

  const reviews = await fetchMerchantReviews(mockRequest);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].id, "a-1");
  assert.equal(reviews[0].rating, 5);
  assert.equal(reviews[0].consumerName, "Carlos");
});

test("getStoreReviews filtra avaliações da loja em modo demonstração", () => {
  const mockReviews = [
    { id: 1, store: 1, name: "Maria", rating: 5, comment: "Excelente!" },
    { id: 2, store: 2, name: "Pedro", rating: 4, comment: "Bom." },
    { id: 3, store: 1, name: "Julia", rating: 3, comment: "Razoável." },
  ];

  const store1Reviews = getStoreReviews(mockReviews, 1);
  assert.equal(store1Reviews.length, 2);
  assert.equal(store1Reviews[0].id, 1);
  assert.equal(store1Reviews[0].consumerName, "Maria");
  assert.equal(store1Reviews[1].id, 3);
  assert.equal(store1Reviews[1].consumerName, "Julia");

  const storeEmpty = getStoreReviews(mockReviews, 999);
  assert.equal(storeEmpty.length, 0);
});

test("calculateReviewsSummary calcula média, total e distribuição por estrelas", () => {
  const reviews = [
    { rating: 5 },
    { rating: 5 },
    { rating: 4 },
    { rating: 3 },
  ];

  const summary = calculateReviewsSummary(reviews);

  assert.equal(summary.total, 4);
  assert.equal(summary.average, "4.3"); // (5 + 5 + 4 + 3) / 4 = 17 / 4 = 4.25 -> 4.3
  assert.equal(summary.distribution[5], 2);
  assert.equal(summary.distribution[4], 1);
  assert.equal(summary.distribution[3], 1);
  assert.equal(summary.distribution[2], 0);
  assert.equal(summary.distribution[1], 0);
});

test("calculateReviewsSummary trata lista vazia", () => {
  const summary = calculateReviewsSummary([]);

  assert.equal(summary.total, 0);
  assert.equal(summary.average, "0.0");
  assert.deepEqual(summary.distribution, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
});
