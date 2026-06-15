const BANKS = [
  {
    id: "bac",
    name: "BAC Credomatic",
    vehiculo: { rate: 9.25, maxYears: 8, ratio: 0.32, minIncome: 750000, minAmount: 5000000, finance: 0.85 },
    personal: { rate: 18.0, maxYears: 5, ratio: 0.32, minIncome: 500000, minAmount: 500000 },
    hipoteca: { rate: 9.5, maxYears: 30, ratio: 0.35, minIncome: 750000, minAmount: 10000000, finance: 0.85 },
  },
  {
    id: "bn",
    name: "Banco Nacional",
    vehiculo: { rate: 8.9, maxYears: 8, ratio: 0.4, minIncome: 400000, minAmount: 2000000, finance: 0.85 },
    personal: { rate: 16.57, maxYears: 8, ratio: 0.4, minIncome: 400000, minAmount: 500000 },
    hipoteca: { rate: 9.0, maxYears: 30, ratio: 0.35, minIncome: 600000, minAmount: 5000000, finance: 0.9 },
  },
  {
    id: "davibank",
    name: "DaviBank",
    vehiculo: { rate: 8.95, maxYears: 8, ratio: 0.32, minIncome: 650000, minAmount: 3000000, finance: 0.9 },
    personal: { rate: 19.0, maxYears: 5, ratio: 0.32, minIncome: 500000, minAmount: 500000 },
  },
  {
    id: "promerica",
    name: "Promerica",
    vehiculo: { rate: 8.25, maxYears: 8, ratio: 0.33, minIncome: 600000, minAmount: 2500000, finance: 0.85 },
    hipoteca: { rate: 12.0, maxYears: 30, ratio: 0.35, minIncome: 750000, minAmount: 10000000, finance: 0.85 },
  },
  {
    id: "lafise",
    name: "Lafise",
    vehiculo: { rate: 10.5, maxYears: 7, ratio: 0.4, minIncome: 600000, minAmount: 2000000, finance: 0.85 },
    personal: { rate: 24.0, maxYears: 5, ratio: 0.35, minIncome: 500000, minAmount: 500000 },
  },
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function money(value) {
  const rounded = Math.max(0, Math.round(Number(value) || 0));
  return "CRC " + rounded.toLocaleString("es-CR");
}

function parseAmount(raw) {
  if (!raw) return 0;
  const cleaned = String(raw).toLowerCase().replace(/[,\s]/g, "");
  const number = Number(cleaned.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number)) return 0;
  if (/millones|millon|m\b/.test(cleaned)) return number * 1000000;
  if (/mil|k\b/.test(cleaned)) return number * 1000;
  return number;
}

function findAmount(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseAmount(match[1]);
  }
  return 0;
}

function detectProduct(text) {
  if (/(casa|vivienda|hipoteca|hipotecario|apartamento|lote|propiedad)/.test(text)) return "hipoteca";
  if (/(carro|auto|vehiculo|vehicular|moto|prendario)/.test(text)) return "vehiculo";
  return "personal";
}

function parseProfile(body) {
  const text = normalize(body);
  const income = findAmount(text, [
    /(?:gano|ingreso|salario|sueldo|neto|mensual)\D{0,18}([\d.,]+(?:\s*(?:millones|millon|mil|k|m))?)/,
    /([\d.,]+(?:\s*(?:millones|millon|mil|k|m))?)\s*(?:de ingreso|de salario|netos|mensuales)/,
  ]);
  const debt = findAmount(text, [
    /(?:debo|deuda|deudas|pago|pagos)\D{0,18}([\d.,]+(?:\s*(?:millones|millon|mil|k|m))?)/,
    /([\d.,]+(?:\s*(?:millones|millon|mil|k|m))?)\s*(?:de deuda|en deudas|de pagos)/,
  ]);
  const downPayment = findAmount(text, [
    /(?:prima|enganche|aporte)\D{0,18}([\d.,]+(?:\s*(?:millones|millon|mil|k|m))?)/,
  ]);
  const assetValue = findAmount(text, [
    /(?:carro|auto|vehiculo|casa|vivienda|propiedad|monto|valor|quiero|ocupo)\D{0,22}([\d.,]+(?:\s*(?:millones|millon|mil|k|m))?)/,
  ]);
  const yearsMatch = text.match(/(\d{1,2})\s*(?:anos|año|anios|meses|plazo)/);
  const requestedYears = yearsMatch ? Number(yearsMatch[1]) : 6;

  return {
    product: detectProduct(text),
    income,
    debt,
    downPayment,
    assetValue,
    requestedYears: Math.max(1, Math.min(requestedYears || 6, 30)),
  };
}

function paymentFor(amount, annualRate, years) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = annualRate / 100 / 12;
  if (!monthlyRate) return amount / months;
  return amount * (monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
}

function amountForPayment(payment, annualRate, years) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = annualRate / 100 / 12;
  if (!monthlyRate) return payment * months;
  return payment * ((1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate);
}

function simulate(profile) {
  const results = [];

  for (const bank of BANKS) {
    const condition = bank[profile.product];
    if (!condition) continue;

    const years = Math.min(profile.requestedYears, condition.maxYears);
    const capacity = Math.max(0, profile.income * condition.ratio - profile.debt);
    let amount = amountForPayment(capacity, condition.rate, years);

    if (profile.assetValue && profile.product !== "personal") {
      const financeLimit = profile.assetValue * (condition.finance || 0.85);
      const requested = Math.max(0, profile.assetValue - profile.downPayment);
      amount = Math.min(amount, financeLimit, requested || financeLimit);
    }

    const qualifies =
      profile.income >= condition.minIncome &&
      amount >= condition.minAmount &&
      capacity > 0;

    if (!qualifies) continue;

    const payment = paymentFor(amount, condition.rate, years);
    results.push({
      bank: bank.name,
      rate: condition.rate,
      years,
      amount,
      payment,
      capacity,
    });
  }

  return results.sort((a, b) => a.payment - b.payment);
}

function missingProfileMessage(profile) {
  const missing = [];
  if (!profile.income) missing.push("ingreso mensual");
  if (!profile.assetValue && profile.product !== "personal") missing.push("valor del bien");
  if (missing.length === 0) return "";

  return [
    "Para calcularte bien necesito: " + missing.join(", ") + ".",
    "Ejemplo:",
    "Gano 1500000, debo 250000, quiero vehiculo de 15000000, tengo 2000000 de prima, a 6 anos.",
  ].join("\n");
}

function formatResults(profile, results) {
  const title =
    profile.product === "hipoteca"
      ? "credito hipotecario"
      : profile.product === "vehiculo"
        ? "credito vehicular"
        : "credito personal";

  const lines = [
    "PreCali - comparativa preliminar",
    "Producto: " + title,
    "Ingreso: " + money(profile.income) + " | Deudas: " + money(profile.debt),
    "",
  ];

  if (!results.length) {
    lines.push("Con esos datos no encontre una opcion clara.");
    lines.push("Probemos bajando monto, subiendo prima o revisando deudas mensuales.");
    return lines.join("\n");
  }

  results.slice(0, 4).forEach((result, index) => {
    lines.push(
      `${index + 1}. ${result.bank}`,
      `Tasa: ${result.rate.toFixed(2)}% | Plazo: ${result.years} anos`,
      `Monto estimado: ${money(result.amount)}`,
      `Cuota aprox: ${money(result.payment)}`,
      ""
    );
  });

  lines.push("Queres aplicar a alguna opcion? Responde: Aplicar BAC, Aplicar BN, etc.");
  lines.push("MVP: estimacion orientativa. El banco confirma aprobacion, tasa y requisitos finales.");
  return lines.join("\n");
}

function buildReply(input) {
  const body = input && input.body ? String(input.body) : "";
  const text = normalize(body);
  const numMedia = Number(input && input.numMedia ? input.numMedia : 0);

  if (numMedia > 0) {
    return {
      message:
        "Recibi tu documento. En este MVP por WhatsApp ya puedo guardar el flujo, pero necesito que me escribas los datos clave para calcular: ingreso mensual, deudas, monto del vehiculo/casa o monto que ocupas, prima y plazo.",
    };
  }

  if (!text || /^(hola|buenas|menu|ayuda|inicio|empezar)/.test(text)) {
    return {
      message: [
        "Hola, soy PreCali por WhatsApp.",
        "Mandame tus datos y te comparo opciones en segundos.",
        "",
        "Ejemplo:",
        "Gano 1500000, debo 250000, quiero vehiculo de 15000000, tengo 2000000 de prima, a 6 anos.",
      ].join("\n"),
    };
  }

  if (/(aplicar|solicitar|me interesa|quiero esa|enviar)/.test(text)) {
    return {
      message: [
        "Perfecto. Para aplicar normalmente necesitarias:",
        "- Cedula vigente",
        "- Orden patronal o constancia de ingresos",
        "- Estados de cuenta recientes",
        "- Proforma o datos del bien si aplica",
        "",
        "En el MVP todavia no enviamos al banco automaticamente. El siguiente paso sera conectar convenios, buro y estado de aprobacion.",
      ].join("\n"),
    };
  }

  if (/(estado|aprobado|rechazado|seguimiento)/.test(text)) {
    return {
      message:
        "El flujo final seria: PreCali te avisa por WhatsApp cuando el banco responda. Ejemplo: Tu credito fue aprobado; el banco se contactara con vos en las proximas horas.",
    };
  }

  const profile = parseProfile(body);
  const missing = missingProfileMessage(profile);
  if (missing) return { message: missing };

  return { message: formatResults(profile, simulate(profile)) };
}

module.exports = {
  buildReply,
  parseProfile,
  simulate,
};
