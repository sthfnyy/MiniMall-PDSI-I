import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAddress,
  normalizeStoreFromApi,
  fetchMerchantStore,
  createMerchantStore,
  updateMerchantStore,
  requestStoreApproval,
  validateStoreData,
  saveMerchantStore,
  getMerchantStore,
} from "../services/merchant.js";

test("parseAddress extrai cidade e estado ou aplica valores padrão", () => {
  const full = parseAddress("Rua Coronel Francisco Santos, 120, Centro, Picos – PI");
  assert.equal(full.endereco_cidade, "Picos");
  assert.equal(full.endereco_uf, "PI");
  assert.equal(full.endereco_logradouro, "Rua Coronel Francisco Santos, 120, Centro");

  const dash = parseAddress("Av. Getúlio Vargas, 500 - Picos - PI");
  assert.equal(dash.endereco_cidade, "Picos");
  assert.equal(dash.endereco_uf, "PI");

  const noCity = parseAddress("Rua São José, 45");
  assert.equal(noCity.endereco_cidade, "Picos");
  assert.equal(noCity.endereco_uf, "PI");
  assert.equal(noCity.endereco_logradouro, "Rua São José, 45");

  const empty = parseAddress("");
  assert.equal(empty.endereco_cidade, "Picos");
  assert.equal(empty.endereco_uf, "PI");
});

test("normalizeStoreFromApi mapeia campos do backend para formato do frontend", () => {
  const apiData = {
    id: "f8d3c12a-5b12-4c6e-8d9f-123456789abc",
    lojista_id: "u123",
    nome_loja: "Flor de Lis",
    descricao: "Loja de roupas e acessórios",
    endereco_logradouro: "Rua das Flores, 100",
    endereco_cidade: "Picos",
    endereco_uf: "PI",
    horario_funcionamento: { descricao: "Seg a Sex, 8h às 18h" },
    whatsapp: "89999998888",
    instagram: "@flordelis",
    status: "rejeitada",
    motivo_rejeicao: "Comprovante de endereço ilegível",
  };

  const normalized = normalizeStoreFromApi(apiData);

  assert.equal(normalized.id, "f8d3c12a-5b12-4c6e-8d9f-123456789abc");
  assert.equal(normalized.name, "Flor de Lis");
  assert.equal(normalized.nome_loja, "Flor de Lis");
  assert.equal(normalized.description, "Loja de roupas e acessórios");
  assert.equal(normalized.descricao, "Loja de roupas e acessórios");
  assert.equal(normalized.whatsapp, "89999998888");
  assert.equal(normalized.hours, "Seg a Sex, 8h às 18h");
  assert.equal(normalized.status, "rejeitada");
  assert.equal(normalized.motivo_rejeicao, "Comprovante de endereço ilegível");
  assert.equal(normalized.initials, "fd");
  assert.ok(normalized.color);
  assert.ok(normalized.address.includes("Rua das Flores, 100"));
});

test("normalizeStoreFromApi suporta horario_funcionamento como string ou nulo", () => {
  const storeWithStringHours = normalizeStoreFromApi({
    id: "uuid-1",
    nome_loja: "Loja Teste",
    whatsapp: "89999999999",
    horario_funcionamento: "8h às 18h",
  });
  assert.equal(storeWithStringHours.hours, "8h às 18h");

  const storeWithNullHours = normalizeStoreFromApi({
    id: "uuid-2",
    nome_loja: "Loja Sem Horário",
    whatsapp: "89999999999",
    horario_funcionamento: null,
  });
  assert.equal(storeWithNullHours.hours, "");
});

test("fetchMerchantStore consulta GET /lojista/loja e normaliza resposta", async () => {
  const calls = [];
  const fakeStore = {
    id: "loja-1",
    nome_loja: "Dona Flor",
    whatsapp: "89999999999",
    status: "aprovada",
    endereco_cidade: "Picos",
    endereco_uf: "PI",
  };

  const request = async (...args) => {
    calls.push(args);
    return fakeStore;
  };

  const result = await fetchMerchantStore(request);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/lojista/loja");
  assert.equal(result.name, "Dona Flor");
  assert.equal(result.status, "aprovada");
});

test("fetchMerchantStore retorna null quando lojista não possui loja (404)", async () => {
  const notFoundError = new Error("Loja não encontrada para este lojista");
  notFoundError.status = 404;

  const request = async () => {
    throw notFoundError;
  };

  const result = await fetchMerchantStore(request);
  assert.equal(result, null);
});

test("fetchMerchantStore propaga outros erros da API", async () => {
  const serverError = new Error("Erro interno do servidor");
  serverError.status = 500;

  const request = async () => {
    throw serverError;
  };

  await assert.rejects(
    async () => fetchMerchantStore(request),
    /Erro interno do servidor/,
  );
});

test("createMerchantStore envia POST /lojista/loja com payload estrito", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return {
      id: "nova-loja-uuid",
      nome_loja: "Atelier Encanto",
      whatsapp: "89988887777",
      status: "pendente",
      endereco_cidade: "Picos",
      endereco_uf: "PI",
    };
  };

  const storeValues = {
    name: "Atelier Encanto",
    description: "Moda autoral",
    whatsapp: "89988887777",
    address: "Rua Coelho Rodrigues, 80, Picos - PI",
    category: "Vestuário", // campo que não deve vazar para a API pois extra="forbid"
    hours: "Segunda a sábado, 8h às 18h",
    instagram: "@atelierencanto",
  };

  const created = await createMerchantStore(storeValues, request);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/lojista/loja");
  assert.equal(calls[0].options.method, "POST");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.nome_loja, "Atelier Encanto");
  assert.equal(body.descricao, "Moda autoral");
  assert.equal(body.whatsapp, "89988887777");
  assert.equal(body.endereco_cidade, "Picos");
  assert.equal(body.endereco_uf, "PI");
  assert.deepEqual(body.horario_funcionamento, {
    descricao: "Segunda a sábado, 8h às 18h",
  });
  assert.equal(body.instagram, "@atelierencanto");
  // Certifica que 'category' não foi enviado (extra='forbid')
  assert.equal(body.category, undefined);

  assert.equal(created.id, "nova-loja-uuid");
  assert.equal(created.status, "pendente");
});

test("updateMerchantStore envia PATCH /lojista/loja com alterações", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return {
      id: "loja-1",
      nome_loja: "Atelier Encanto Atualizado",
      whatsapp: "89988887777",
      status: "pendente",
      endereco_cidade: "Picos",
      endereco_uf: "PI",
    };
  };

  const updateValues = {
    name: "Atelier Encanto Atualizado",
    description: "Nova descrição",
    whatsapp: "89988887777",
    address: "Av. Severo Eulálio, 200, Picos - PI",
    hours: "8h às 19h",
    instagram: "@atelier.novo",
  };

  const updated = await updateMerchantStore(updateValues, request);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/lojista/loja");
  assert.equal(calls[0].options.method, "PATCH");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.nome_loja, "Atelier Encanto Atualizado");
  assert.equal(body.descricao, "Nova descrição");
  assert.equal(body.endereco_cidade, "Picos");
  assert.equal(body.endereco_uf, "PI");
  assert.deepEqual(body.horario_funcionamento, { descricao: "8h às 19h" });

  assert.equal(updated.name, "Atelier Encanto Atualizado");
});

test("requestStoreApproval envia POST /lojista/loja/solicitar-aprovacao", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return {
      id: "loja-1",
      nome_loja: "Minha Loja",
      whatsapp: "89999999999",
      status: "pendente",
      motivo_rejeicao: null,
      endereco_cidade: "Picos",
      endereco_uf: "PI",
    };
  };

  const result = await requestStoreApproval(request);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/lojista/loja/solicitar-aprovacao");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(result.status, "pendente");
  assert.equal(result.motivo_rejeicao, null);
});

test("validateStoreData valida campos obrigatórios com mensagens claras", () => {
  assert.throws(
    () => validateStoreData({ name: "A", whatsapp: "8999999999", address: "Rua X, 10" }),
    /Informe o nome da loja/
  );

  assert.throws(
    () => validateStoreData({ name: "Loja ABC", whatsapp: "123", address: "Rua X, 10" }),
    /Informe um número de WhatsApp válido/
  );

  assert.throws(
    () => validateStoreData({ name: "Loja ABC", whatsapp: "8999999999", address: "Oi" }),
    /Informe a localização ou endereço da loja/
  );

  // Válido
  const valid = validateStoreData({
    name: "Loja Sucesso",
    whatsapp: "(89) 99999-0000",
    address: "Rua Principal, 100",
    description: "Tudo para seu lar",
    hours: "8h às 18h",
    instagram: "@sucesso",
  });
  assert.equal(valid.name, "Loja Sucesso");
  assert.equal(valid.whatsapp, "(89) 99999-0000");
  assert.equal(valid.address, "Rua Principal, 100");
  assert.equal(valid.description, "Tudo para seu lar");
  assert.equal(valid.hours, "8h às 18h");
});

test("modo demo mantém funcionamento com saveMerchantStore e getMerchantStore", () => {
  const mockData = {
    stores: [
      {
        id: 1,
        owner: "merchant",
        name: "Loja Demo",
        whatsapp: "89999991111",
        address: "Rua Demo, 1",
        status: "aprovada",
      },
    ],
  };
  const mockUser = { id: "merchant", role: "lojista" };

  const store = getMerchantStore(mockData, mockUser);
  assert.equal(store.name, "Loja Demo");

  const saveResult = saveMerchantStore(mockData, mockUser, {
    name: "Loja Demo Atualizada",
    whatsapp: "89999992222",
    address: "Rua Nova, 2",
    hours: "9h às 18h",
  });

  assert.equal(saveResult.isNew, false);
  assert.equal(saveResult.store.name, "Loja Demo Atualizada");
  assert.equal(mockData.stores[0].name, "Loja Demo Atualizada");
});
