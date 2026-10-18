import { apiRequest } from "./api.js";

export async function getConsumerPoints(request = apiRequest) {
  return request("/consumidor/pontos");
}

export async function loadConsumerPoints(useRealApi, request = apiRequest) {
  return useRealApi ? getConsumerPoints(request) : null;
}

export function buildDemoConsumerPoints(data, userId) {
  const transactions = (data?.pontos_transacoes || [])
    .filter((transaction) => String(transaction.usuario_id) === String(userId))
    .sort(
      (a, b) => new Date(b.criado_em) - new Date(a.criado_em),
    );

  const saldoTotal = transactions.reduce(
    (total, transaction) =>
      transaction.tipo === "credito"
        ? total + transaction.quantidade
        : total - transaction.quantidade,
    0,
  );

  const balancesByStore = transactions.reduce((balances, transaction) => {
    const storeId = transaction.loja_id;
    balances[storeId] =
      (balances[storeId] || 0) +
      (transaction.tipo === "credito"
        ? transaction.quantidade
        : -transaction.quantidade);
    return balances;
  }, {});

  return {
    saldo_total: saldoTotal,
    saldos_por_loja: Object.entries(balancesByStore).map(
      ([loja_id, saldo]) => ({ loja_id, saldo }),
    ),
    historico: transactions,
  };
}

export function getConsumerPointsViewData({
  useRealApi,
  realPoints,
  data,
  userId,
}) {
  return useRealApi
    ? realPoints
    : buildDemoConsumerPoints(data, userId);
}
