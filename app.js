// ============================================================
// PreCali — Aplicación principal
// ============================================================

(function () {
  'use strict';

  // ---------- Scroll progress bar ----------
  const progressBar = document.getElementById('scroll-progress');
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      progressBar.style.width = pct + '%';
    }, { passive: true });
  }

  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    const toggleBackToTop = () => {
      backToTop.classList.toggle('is-visible', window.scrollY > 520);
    };
    window.addEventListener('scroll', toggleBackToTop, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    toggleBackToTop();
  }

  // ---------- Count-up animation para valores numéricos ----------
  // Anima un número desde un valor inicial al final en ~600ms con ease-out
  function animateNumber(el, from, to, formatter, duration = 600) {
    const start = performance.now();
    const diff = to - from;
    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + diff * eased;
      el.textContent = formatter(current);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // Wrapper: detecta el valor anterior del elemento y anima del viejo al nuevo
  function setAnimated(el, newValue, formatter) {
    if (!el) return;
    // Extraer valor numérico actual (sin símbolos ni separadores)
    const currentText = el.textContent || '';
    const currentNum = parseFloat(currentText.replace(/[^0-9.-]/g, '')) || 0;
    if (Math.abs(currentNum - newValue) < 1 || isNaN(currentNum)) {
      el.textContent = formatter(newValue);
      return;
    }
    animateNumber(el, currentNum, newValue, formatter);
  }

  // ---------- Helpers ----------
  function monedaInfo(mon) {
    const pais = typeof getPais === 'function' ? getPais() : null;
    if (mon === 'usd') return { codigo: 'USD', simbolo: '$', cambioUSD: 1 };
    return {
      codigo: pais?.moneda || 'CRC',
      simbolo: pais?.simbolo || '₡',
      cambioUSD: pais?.cambioUSD || TIPO_CAMBIO_USD
    };
  }

  function fmt(v, mon) {
    const symbol = monedaInfo(mon).simbolo;
    return symbol + new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(Math.round(v));
  }

  function fmtPlano(v, mon) {
    const symbol = monedaInfo(mon).simbolo;
    const n = Math.max(0, Math.round(Number(v) || 0));
    return symbol + new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(n).replace(/,/g, ' ');
  }

  function describirMonto(v, mon) {
    const n = Math.max(0, Math.round(Number(v) || 0));
    if (n === 0) return `${fmtPlano(0, mon)} · 0`;
    const divisor = n >= 1000000 ? 1000000 : 1000;
    const unidad = n >= 1000000 ? 'millones' : 'mil';
    const valor = n / divisor;
    const decimales = valor >= 10 || Number.isInteger(valor) ? 0 : 1;
    return `${fmtPlano(n, mon)} · ${valor.toLocaleString('es-CR', { maximumFractionDigits: decimales })} ${unidad}`;
  }

  function fechaLegible(iso) {
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const [y, m, d] = iso.split('-');
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]}, ${y}`;
  }

  function etiquetaCalidadDato(banco) {
    return banco.calidadDato === 'referencial' ? ' · Referencial' : '';
  }

  function textoCalidadDato(banco) {
    return banco.calidadDato === 'referencial'
      ? 'Datos regionales referenciales cargados para prueba de mercado; deben validarse con el banco antes de aplicar.'
      : `Información tomada del sitio oficial de ${banco.nombre} (${banco.web}).`;
  }

  // Renderiza requisitos como lista categorizada (formato array) o como párrafo (formato string legacy)
  function renderRequisitos(requisitos) {
    if (!requisitos) return '';
    // Formato nuevo: array de { categoria, items[] }
    if (Array.isArray(requisitos)) {
      return `<div class="modal-requisitos">
        ${requisitos.map(grupo => `
          <div class="requisitos-grupo">
            <div class="requisitos-categoria">${grupo.categoria}</div>
            <ul class="requisitos-lista">
              ${grupo.items.map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>`;
    }
    // Formato legacy: string plano
    return `<p style="font-size:13px; color:var(--ink-soft); margin-bottom:1.25rem; line-height:1.6;">${requisitos}</p>`;
  }

  // ---------- Estado ----------
  let tipoActual = 'personal';
  const seleccionInicialCR = ['bn', 'bcr', 'bac', 'pop', 'dav'];
  let paisActual = 'cr';
  let seleccion = new Set(seleccionInicialCR);
  let ultimosResultados = [];
  let monedaAnterior = 'crc'; // para detectar cambios de moneda y ajustar campos manuales

  // Rangos de los campos según moneda. Definimos valores cerrados y limpios para cada uno.
  const RANGOS_SLIDERS = {
    crc: {
      ingreso:  { min: 200000, max: 10000000, step: 100000, def: 1200000 },
      deudas:   { min: 0,      max: 10000000, step: 50000,  def: 150000 },
      prima:    { min: 0,      max: 50000000, step: 500000, def: 5000000 }
    },
    usd: {
      ingreso:  { min: 400,    max: 20000,    step: 200,    def: 2400 },
      deudas:   { min: 0,      max: 20000,    step: 100,    def: 300 },
      prima:    { min: 0,      max: 100000,   step: 1000,   def: 10000 }
    }
  };

  function rangosParaMoneda(moneda) {
    if (moneda === 'usd') return RANGOS_SLIDERS.usd;
    if (paisActual === 'cr') return RANGOS_SLIDERS.crc;
    const cambio = getPais().cambioUSD || TIPO_CAMBIO_USD;
    const redondear = (valor, step) => Math.max(step, Math.round(valor / step) * step);
    const stepIngreso = cambio >= 20 ? 1000 : 500;
    const stepPrima = cambio >= 20 ? 10000 : 5000;
    return {
      ingreso: {
        min: redondear(RANGOS_SLIDERS.usd.ingreso.min * cambio, stepIngreso),
        max: redondear(RANGOS_SLIDERS.usd.ingreso.max * cambio, stepIngreso),
        step: stepIngreso,
        def: redondear(RANGOS_SLIDERS.usd.ingreso.def * cambio, stepIngreso)
      },
      deudas: {
        min: 0,
        max: redondear(RANGOS_SLIDERS.usd.deudas.max * cambio, stepIngreso),
        step: stepIngreso,
        def: redondear(RANGOS_SLIDERS.usd.deudas.def * cambio, stepIngreso)
      },
      prima: {
        min: 0,
        max: redondear(RANGOS_SLIDERS.usd.prima.max * cambio, stepPrima),
        step: stepPrima,
        def: redondear(RANGOS_SLIDERS.usd.prima.def * cambio, stepPrima)
      }
    };
  }

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const els = {
    ingreso: $('ingreso'), deudas: $('deudas'), plazo: $('plazo'),
    plazoHint: $('plazo-hint'), prima: $('prima'), moneda: $('moneda'),
    orden: $('orden'), primaRow: $('prima-row'),
    oIngreso: $('o-ingreso'), oDeudas: $('o-deudas'), oPlazo: $('o-plazo'), oPrima: $('o-prima'),
    hIngreso: $('h-ingreso'), hDeudas: $('h-deudas'), hPrima: $('h-prima'),
    countSel: $('count-sel'), countTotal: $('count-total'), banksGrid: $('banks-grid'), results: $('results'),
    modalHost: $('modal-host'),
    aiCard: $('ai-card'), aiTitle: $('ai-title'),
    aiText: $('ai-text'), aiMeta: $('ai-meta'), aiIcon: $('ai-icon'),
    verificaciones: $('verificaciones'),
    pais: $('pais'), paisBandera: $('pais-bandera')
  };

  function actualizarAyudasMontos(moneda) {
    if (els.hIngreso) els.hIngreso.textContent = describirMonto(els.ingreso.value, moneda);
    if (els.hDeudas) els.hDeudas.textContent = describirMonto(els.deudas.value, moneda);
    if (els.hPrima) els.hPrima.textContent = describirMonto(els.prima.value, moneda);
  }

  // ---------- País / región ----------
  function getPais(id = paisActual) {
    return (typeof PAISES !== 'undefined' ? PAISES : []).find(p => p.id === id) || PAISES[0];
  }

  function bancosPaisActual() {
    return BANCOS.filter(b => (b.pais || 'cr') === paisActual);
  }

  function paisConDatos() {
    return bancosPaisActual().length > 0;
  }

  function detectarPaisInicial() {
    const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
    const lang = (navigator.language || '').toLowerCase();
    if (tz.includes('mexico') || lang.includes('-mx')) return 'mx';
    if (tz.includes('guatemala') || lang.includes('-gt')) return 'gt';
    if (tz.includes('el_salvador') || lang.includes('-sv')) return 'sv';
    if (tz.includes('tegucigalpa') || lang.includes('-hn')) return 'hn';
    if (tz.includes('managua') || lang.includes('-ni')) return 'ni';
    if (tz.includes('panama') || lang.includes('-pa')) return 'pa';
    return 'cr';
  }

  function renderPais() {
    const pais = getPais();
    if (els.paisBandera) els.paisBandera.textContent = pais.bandera;
    if (els.pais) els.pais.value = paisActual;
    document.documentElement.dataset.pais = paisActual;
    if (els.moneda) {
      const localOption = els.moneda.querySelector('option[value="crc"]');
      const usdOption = els.moneda.querySelector('option[value="usd"]');
      if (localOption) localOption.textContent = `${pais.moneda} (${pais.simbolo || '₡'})`;
      if (usdOption) usdOption.textContent = 'Dólares ($)';
      const esDolarizado = pais.moneda === 'USD' || pais.moneda === 'USD/PAB';
      els.moneda.disabled = esDolarizado;
      if (esDolarizado && els.moneda.value !== 'usd') {
        els.moneda.value = 'usd';
        aplicarRangosMoneda('usd', false);
        monedaAnterior = 'usd';
      }
      if (!esDolarizado) {
        els.moneda.disabled = false;
        if (els.moneda.value === 'usd') {
          els.moneda.value = 'crc';
        }
        aplicarRangosMoneda('crc', false);
        monedaAnterior = 'crc';
      }
    }
  }

  function cambiarPais(nuevoPais) {
    const existe = (typeof PAISES !== 'undefined' ? PAISES : []).some(p => p.id === nuevoPais);
    paisActual = existe ? nuevoPais : 'cr';
    const bancos = bancosPaisActual();
    seleccion = paisActual === 'cr' ? new Set(seleccionInicialCR) : new Set(bancos.map(b => b.id));
    renderPais();
    renderBanks();
    ajustarPlazo();
    renderVerificaciones();
    actualizarFechaHero();
    calcular();
  }

  // ---------- Render verificaciones ----------
  function renderVerificaciones() {
    const bancos = bancosPaisActual();
    els.verificaciones.innerHTML = bancos.map(b => `
      <div class="verif-item">
        <div class="bank-logo" style="background:${b.color};">${b.iniciales}</div>
        <div>
          <div class="verif-item-name">${b.nombre}</div>
          <div class="verif-item-date">${fechaLegible(b.verificado)}</div>
        </div>
      </div>
    `).join('');
  }

  // Actualiza el "Datos verificados · X" del hero con la fecha más reciente
  function actualizarFechaHero() {
    const heroFecha = $('hero-fecha');
    if (!heroFecha) return;
    const bancos = bancosPaisActual();
    const masReciente = bancos.map(b => b.verificado).sort().reverse()[0];
    if (!masReciente) {
      heroFecha.textContent = 'en validacion';
      return;
    }
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const [y, m] = masReciente.split('-');
    heroFecha.textContent = `${meses[parseInt(m) - 1]} ${y}`;
  }

  // ---------- Plazo dinámico ----------
  function plazoMaxSeleccionado() {
    if (!paisConDatos()) return CONFIG_TIPOS[tipoActual].plazoDef;
    const seleccionados = bancosPaisActual().filter(b => seleccion.has(b.id));
    if (seleccionados.length === 0) return CONFIG_TIPOS[tipoActual].plazoDef;
    return Math.max(...seleccionados.map(b => b[tipoActual].plazoMax));
  }

  function ajustarPlazo() {
    const cfg = CONFIG_TIPOS[tipoActual];
    const max = plazoMaxSeleccionado();
    els.plazo.min = cfg.plazoMin;
    els.plazo.max = max;
    if (+els.plazo.value > max) els.plazo.value = max;
    if (+els.plazo.value < cfg.plazoMin) els.plazo.value = cfg.plazoMin;
    els.plazoHint.textContent = `Plazo máximo según bancos seleccionados: ${max} años`;
  }

  // ---------- Bancos chips ----------
  function renderBanks() {
    if (!paisConDatos()) {
      const pais = getPais();
      els.banksGrid.innerHTML = `
        <div class="market-pending-card">
          <div class="market-pending-flag">${pais.bandera}</div>
          <div>
            <strong>${pais.nombre} está en validación</strong>
            <p>Estamos cargando bancos, tasas, plazos y requisitos oficiales para ${pais.nombre}. Por ahora no mostramos resultados financieros hasta confirmar fuentes públicas.</p>
          </div>
        </div>
      `;
      els.countSel.textContent = 0;
      if (els.countTotal) els.countTotal.textContent = 0;
      return;
    }
    const bancos = bancosPaisActual();
    els.banksGrid.innerHTML = bancos.map(b => `
      <label class="bank-chip ${seleccion.has(b.id) ? 'selected' : ''}" data-id="${b.id}">
        <input type="checkbox" ${seleccion.has(b.id) ? 'checked' : ''} />
        <div class="bank-logo" style="background:${b.color};">${b.iniciales}</div>
        <span class="bank-name">${b.nombre}</span>
      </label>
    `).join('');
    els.banksGrid.querySelectorAll('.bank-chip').forEach(chip => {
      chip.addEventListener('click', e => {
        e.preventDefault();
        const id = chip.dataset.id;
        if (seleccion.has(id)) seleccion.delete(id);
        else seleccion.add(id);
        renderBanks();
        ajustarPlazo();
        calcular();
      });
    });
    els.countSel.textContent = seleccion.size;
    if (els.countTotal) els.countTotal.textContent = bancos.length;
  }

  window.selectAll = function (todo) {
    if (!paisConDatos()) return;
    const bancos = bancosPaisActual();
    seleccion = todo ? new Set(bancos.map(b => b.id)) : new Set();
    renderBanks();
    ajustarPlazo();
    calcular();
  };


  document.querySelectorAll('[data-flow-target]').forEach(link => {
    link.addEventListener('click', event => {
      const id = link.getAttribute('href');
      const target = id ? document.querySelector(id) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (link.dataset.flowTarget === 'credito') {
        const firstInput = target.querySelector('input, select, button');
        setTimeout(() => firstInput?.focus({ preventScroll: true }), 420);
      }
    });
  });

  // ---------- Tabs ----------
  function setTipo(nuevo) {
    tipoActual = nuevo;
    const cfg = CONFIG_TIPOS[tipoActual];
    document.querySelectorAll('.loan-tab').forEach(b => b.classList.remove('active'));
    $('tab-' + tipoActual).classList.add('active');
    els.plazo.value = cfg.plazoDef;
    els.primaRow.style.display = cfg.prima ? 'block' : 'none';
    // Si el préstamo necesita prima, restauramos el valor default según la moneda activa
    if (cfg.prima) {
      const monedaActual = els.moneda.value;
      els.prima.value = rangosParaMoneda(monedaActual).prima.def;
    }
    ajustarPlazo();
    calcular();
  }

  document.querySelectorAll('.loan-tab').forEach(tab => {
    tab.addEventListener('click', () => setTipo(tab.dataset.tipo));
  });

  // ---------- Cálculo por banco ----------
  function evaluarBanco(banco, ingreso, deudas, plazoAnios, moneda, prima, cfg) {
    const params = banco[tipoActual];
    const tasa = moneda === 'usd' ? (params.tasaUSD ?? params.tasaCRC) : (params.tasaCRC ?? params.tasaUSD);
    const plazoEfectivo = Math.min(plazoAnios, params.plazoMax);
    const i = (tasa / 100) / 12;
    const n = plazoEfectivo * 12;

    // Los thresholds del banco (ingresoMin, montoMin) están definidos en colones.
    // Los convertimos a la moneda visible para que las comparaciones tengan sentido.
    const bancoMonedaBase = banco.monedaBase || 'crc';
    const monedaVisibleBase = moneda === 'usd' ? 'usd' : 'local';
    const bancoBase = bancoMonedaBase === 'usd' ? 'usd' : 'local';
    const cambio = getPais().cambioUSD || TIPO_CAMBIO_USD;
    const factorConversion = bancoBase === monedaVisibleBase
      ? 1
      : (bancoBase === 'usd' ? cambio : (1 / cambio));
    const ingresoMinConvertido = params.ingresoMin * factorConversion;
    const montoMinConvertido = params.montoMin * factorConversion;

    const fallas = [];

    if (ingreso < ingresoMinConvertido) {
      fallas.push({ tipo: 'ingreso', requerido: ingresoMinConvertido, actual: ingreso });
    }

    const capacidadBanco = (ingreso * params.ratioMax) - deudas;
    if (capacidadBanco <= 0) {
      fallas.push({ tipo: 'deuda', ratioMax: params.ratioMax, ingreso, deudas });
    }

    let monto = 0;
    let valorBien = null;

    if (capacidadBanco > 0) {
      monto = i > 0 ? capacidadBanco * (1 - Math.pow(1 + i, -n)) / i : capacidadBanco * n;

      if (cfg.prima) {
        if (prima <= 0) {
          fallas.push({ tipo: 'sinPrima', financia: params.financia });
        } else {
          const maxFinanciado = (prima * params.financia) / (1 - params.financia);
          monto = Math.min(monto, maxFinanciado);
        }
      }

      if (monto < montoMinConvertido) {
        fallas.push({ tipo: 'montoMin', requerido: montoMinConvertido, calculado: monto });
      }
    }

    if (cfg.prima && monto > 0) {
      valorBien = monto + prima;
    }

    const cuota = i > 0 && monto > 0
      ? monto * i / (1 - Math.pow(1 + i, -n))
      : (monto > 0 ? monto / n : 0);
    const total = cuota * n;
    const intereses = total - monto;

    return {
      banco, params, tasa, plazoEfectivo, plazoSolicitado: plazoAnios,
      ratio: params.ratioMax, capacidad: Math.max(0, capacidadBanco),
      monto: Math.max(0, monto), cuota, total, intereses, valorBien,
      ingresoMinConvertido, montoMinConvertido,
      fallas, califica: fallas.length === 0
    };
  }

  // ---------- Barreras globales ----------
  function generarBarrerasGlobales(resultados, ingreso, deudas, prima, cfg, moneda) {
    const barreras = [];

    // Usamos los valores ya convertidos a la moneda visible (almacenados en cada result)
    if (resultados.every(r => ingreso < r.ingresoMinConvertido)) {
      const ingresoMin = Math.min(...resultados.map(r => r.ingresoMinConvertido));
      const bancoMin = resultados.find(r => r.ingresoMinConvertido === ingresoMin).banco;
      const faltante = ingresoMin - ingreso;
      barreras.push({
        titulo: 'Tu ingreso está por debajo del mínimo',
        desc: `El banco con menor ingreso requerido es <strong>${bancoMin.nombre}</strong>, que pide al menos <strong>${fmt(ingresoMin, moneda)}</strong> mensuales. Te faltan <strong>${fmt(faltante, moneda)}</strong> para alcanzar ese piso.`,
        accion: 'Considera incluir un codeudor, sumar ingresos del cónyuge, o esperar a aumentar tus ingresos.'
      });
    }

    if (resultados.every(r => r.fallas.some(f => f.tipo === 'deuda'))) {
      const ratioMaxBanco = Math.max(...resultados.map(r => r.params.ratioMax));
      const bancoFlexible = resultados.find(r => r.params.ratioMax === ratioMaxBanco).banco;
      const deudaPermitida = ingreso * ratioMaxBanco;
      const exceso = deudas - deudaPermitida;
      const ratioActual = ingreso > 0 ? ((deudas / ingreso) * 100).toFixed(0) : 0;
      barreras.push({
        titulo: 'Tus deudas consumen toda tu capacidad de pago',
        desc: `Hoy destinás aproximadamente <strong>${ratioActual}%</strong> de tu ingreso a deudas. El banco más permisivo, <strong>${bancoFlexible.nombre}</strong>, acepta hasta <strong>${Math.round(ratioMaxBanco * 100)}%</strong>. Estás <strong>${fmt(Math.max(0, exceso), moneda)}</strong> por encima de ese límite mensual.`,
        accion: 'Considerá consolidar deudas existentes, cancelar tarjetas de crédito antes de aplicar, o reducir el monto que solicitás.'
      });
    }

    if (cfg.prima && (prima <= 0 || resultados.every(r => r.fallas.some(f => f.tipo === 'sinPrima')))) {
      const minFinancia = Math.max(...resultados.map(r => r.params.financia));
      const bancoFinancia = resultados.find(r => r.params.financia === minFinancia).banco;
      const primaMinimaPct = ((1 - minFinancia) * 100).toFixed(0);
      barreras.push({
        titulo: tipoActual === 'hipoteca' ? 'No has indicado prima para la propiedad' : 'No has indicado prima para el vehículo',
        desc: `Para ${tipoActual === 'hipoteca' ? 'una hipoteca' : 'un préstamo vehicular'}, todos los bancos requieren al menos un porcentaje del valor del bien como prima. <strong>${bancoFinancia.nombre}</strong> es el más flexible, financiando hasta <strong>${Math.round(minFinancia * 100)}%</strong>, lo que requiere una prima mínima del <strong>${primaMinimaPct}%</strong>.`,
        accion: 'Ajustá la prima al monto que tenés disponible para ahorrar o invertir como cuota inicial.'
      });
    }

    if (resultados.every(r => r.fallas.some(f => f.tipo === 'montoMin'))) {
      const montoMin = Math.min(...resultados.map(r => r.montoMinConvertido));
      const bancoMontoMin = resultados.find(r => r.montoMinConvertido === montoMin).banco;
      barreras.push({
        titulo: 'El monto que podrías obtener es muy bajo',
        desc: `Con tu capacidad de pago actual, los bancos calcularían un préstamo menor al monto mínimo que financian. <strong>${bancoMontoMin.nombre}</strong> es el que tiene el piso más bajo: <strong>${fmt(montoMin, moneda)}</strong>.`,
        accion: 'Aumentá el plazo deseado para incrementar el monto financiable, o considerá reducir tus deudas mensuales actuales.'
      });
    }

    return barreras;
  }

  // ---------- Análisis IA ----------
  function generarAnalisisIA(resultados, orden, moneda) {
    const validos = resultados.filter(r => r.califica && r.cuota > 0 && r.monto > 0);
    if (validos.length < 2) return null;

    const porCuota = [...validos].sort((a, b) => a.cuota - b.cuota);
    const porTasa = [...validos].sort((a, b) => a.tasa - b.tasa);
    const porMonto = [...validos].sort((a, b) => b.monto - a.monto);
    const porTotal = [...validos].sort((a, b) => a.total - b.total);

    const insights = {
      cuota: () => {
        const ganador = porCuota[0];
        const ultimo = porCuota[porCuota.length - 1];
        const diff = ultimo.cuota - ganador.cuota;
        const diffPct = ((diff / ultimo.cuota) * 100).toFixed(1);
        const trampa = ganador.total > porTotal[0].total
          ? ` Sin embargo, su cuota baja se compensa con un plazo más largo: terminás pagando <strong>${fmt(ganador.total - porTotal[0].total, moneda)}</strong> más que con ${porTotal[0].banco.nombre}.`
          : '';
        return {
          icon: '₡',
          title: 'Análisis: cuota mensual más baja',
          text: `Para tu prioridad de <strong>cuota mensual baja</strong>, la mejor opción es <strong>${ganador.banco.nombre}</strong> con una cuota de <strong>${fmt(ganador.cuota, moneda)}</strong>. Eso es <strong>${diffPct}%</strong> menos que ${ultimo.banco.nombre}, liberándote <strong>${fmt(diff, moneda)}</strong> mensuales para otros gastos.${trampa}`,
          meta: [
            { label: 'Mejor cuota', value: fmt(ganador.cuota, moneda) },
            { label: 'Ahorro mensual', value: fmt(diff, moneda) },
            { label: 'Plazo', value: `${ganador.plazoEfectivo} años` }
          ]
        };
      },
      tasa: () => {
        const ganador = porTasa[0];
        const ultimo = porTasa[porTasa.length - 1];
        const diffTasa = (ultimo.tasa - ganador.tasa).toFixed(2);
        const diffIntereses = ultimo.intereses - ganador.intereses;
        return {
          icon: '%',
          title: 'Análisis: menor tasa de interés',
          text: `<strong>${ganador.banco.nombre}</strong> ofrece la tasa más baja con <strong>${ganador.tasa.toFixed(2)}%</strong>, frente al <strong>${ultimo.tasa.toFixed(2)}%</strong> de ${ultimo.banco.nombre}. Esa diferencia de <strong>${diffTasa} puntos porcentuales</strong> se traduce en un ahorro de <strong>${fmt(diffIntereses, moneda)}</strong> en intereses durante todo el plazo. La menor tasa casi siempre gana en el largo plazo.`,
          meta: [
            { label: 'Mejor tasa', value: `${ganador.tasa.toFixed(2)}%` },
            { label: 'Diferencia', value: `${diffTasa} pp` },
            { label: 'Ahorro intereses', value: fmt(diffIntereses, moneda) }
          ]
        };
      },
      monto: () => {
        const ganador = porMonto[0];
        const ultimo = porMonto[porMonto.length - 1];
        const diff = ganador.monto - ultimo.monto;
        const diffPct = ((diff / ultimo.monto) * 100).toFixed(0);
        const factorRatio = (ganador.ratio * 100).toFixed(0);
        return {
          icon: '+',
          title: 'Análisis: mayor monto pre-aprobado',
          text: `<strong>${ganador.banco.nombre}</strong> te aprobaría hasta <strong>${fmt(ganador.monto, moneda)}</strong>, un <strong>${diffPct}% más</strong> que ${ultimo.banco.nombre}. Esto se debe a que acepta destinar hasta el <strong>${factorRatio}%</strong> de tu ingreso a la cuota, lo que se conoce como un perfil más permisivo. Recordá que un monto mayor implica una cuota mayor: revisá si tu presupuesto realmente lo permite.`,
          meta: [
            { label: 'Mayor monto', value: fmt(ganador.monto, moneda) },
            { label: 'Diferencia', value: `+${fmt(diff, moneda)}` },
            { label: 'Cuota implicada', value: fmt(ganador.cuota, moneda) }
          ]
        };
      },
      total: () => {
        const ganador = porTotal[0];
        const ultimo = porTotal[porTotal.length - 1];
        const diff = ultimo.total - ganador.total;
        const ahorroMensual = diff / (ganador.plazoEfectivo * 12);
        return {
          icon: '✓',
          title: 'Análisis: menor total a pagar',
          text: `<strong>${ganador.banco.nombre}</strong> es la opción más eficiente en el largo plazo: vas a pagar <strong>${fmt(ganador.total, moneda)}</strong> en total, <strong>${fmt(diff, moneda)}</strong> menos que ${ultimo.banco.nombre}. Esto equivale a <strong>${fmt(ahorroMensual, moneda)}</strong> de ahorro promedio por mes durante todo el plazo. Si tu prioridad es minimizar el costo total del crédito, esta es tu opción.`,
          meta: [
            { label: 'Total más bajo', value: fmt(ganador.total, moneda) },
            { label: 'Ahorro total', value: fmt(diff, moneda) },
            { label: 'Cuota', value: fmt(ganador.cuota, moneda) }
          ]
        };
      }
    };

    return insights[orden]();
  }

  function actualizarAI(resultados, orden, moneda) {
    const analisis = generarAnalisisIA(resultados, orden, moneda);
    if (!analisis) {
      els.aiCard.style.display = 'none';
      return;
    }
    els.aiCard.style.display = 'block';
    els.aiTitle.textContent = analisis.title;
    els.aiText.innerHTML = analisis.text;
    els.aiIcon.textContent = analisis.icon;
    els.aiMeta.innerHTML = analisis.meta.map(m => `
      <div class="ai-meta-item">
        <span class="ai-meta-label">${m.label}</span>
        <span class="ai-meta-value">${m.value}</span>
      </div>
    `).join('');
  }

  // ---------- Modales ----------
  window.cerrarModal = function (e) {
    if (e) e.stopPropagation();
    els.modalHost.innerHTML = '';
    document.body.style.overflow = '';
  };

  window.verDetalle = function (idx) {
    const r = ultimosResultados[idx];
    if (!r) return;
    const cfg = CONFIG_TIPOS[tipoActual];
    const moneda = els.moneda.value;
    const ratioPct = Math.round(r.ratio * 100);
    const labelMonto = cfg.prima
      ? (tipoActual === 'hipoteca' ? 'Valor máx. propiedad' : 'Valor máx. vehículo')
      : 'Monto pre-aprobado';
    const valorMostrar = cfg.prima ? r.valorBien : r.monto;
    const finanPct = r.params.financia ? Math.round(r.params.financia * 100) : null;

    document.body.style.overflow = 'hidden';
    els.modalHost.innerHTML = `
      <div class="modal-overlay" onclick="cerrarModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-header-info">
              <div class="bank-logo" style="background:${r.banco.color};">${r.banco.iniciales}</div>
              <div>
                <div class="modal-header-name">${r.banco.nombre}</div>
                <div class="modal-header-tag">${r.banco.tipo} · ${cfg.label}${etiquetaCalidadDato(r.banco)}</div>
              </div>
            </div>
            <button class="modal-close" onclick="cerrarModal(event)">×</button>
          </div>

          <h3 class="modal-section-title">Tu pre-calificación</h3>
          <div class="modal-table">
            <div class="modal-row"><span class="label">${labelMonto}</span><span class="val">${fmt(valorMostrar, moneda)}</span></div>
            <div class="modal-row"><span class="label">Cuota mensual</span><span class="val">${fmt(r.cuota, moneda)}</span></div>
            <div class="modal-row"><span class="label">Total a pagar</span><span class="val">${fmt(r.total, moneda)}</span></div>
            <div class="modal-row"><span class="label">Total intereses</span><span class="val">${fmt(r.intereses, moneda)}</span></div>
          </div>

          <h3 class="modal-section-title">Condiciones del banco</h3>
          <div class="modal-table">
            <div class="modal-row"><span class="label">Tasa de interés</span><span class="val">${r.tasa.toFixed(2)}% anual (${monedaInfo(moneda).codigo})</span></div>
            <div class="modal-row"><span class="label">Plazo máximo</span><span class="val">${r.params.plazoMax} años</span></div>
            <div class="modal-row"><span class="label">% capacidad de pago</span><span class="val">${ratioPct}% del ingreso</span></div>
            <div class="modal-row"><span class="label">Comisión formalización</span><span class="val">${r.params.comision}%</span></div>
            ${finanPct ? `<div class="modal-row"><span class="label">Financiamiento máx. del bien</span><span class="val">${finanPct}%</span></div>` : ''}
            <div class="modal-row"><span class="label">Garantía requerida</span><span class="val">${r.params.garantia}</span></div>
            <div class="modal-row"><span class="label">&Uacute;ltima verificaci&oacute;n</span><span class="val">${fechaLegible(r.banco.verificado)}</span></div>
          </div>

          <h3 class="modal-section-title">Requisitos para esta solicitud</h3>
          <p class="modal-requisitos-intro">Documentación pública requerida por <strong>${r.banco.nombre}</strong> para ${cfg.label === 'crédito hipotecario' ? 'el crédito hipotecario' : 'el ' + cfg.label}. Los requisitos exactos pueden variar según tu perfil y serán confirmados por el banco al iniciar el trámite.</p>
          ${renderRequisitos(r.params.requisitos)}

          <h3 class="modal-section-title">Cómo se calcula tu monto</h3>
          <div class="modal-glosario">
            <strong>¿Por qué este monto?</strong><br/>
            ${r.banco.nombre} acepta que la cuota mensual no supere el <strong>${ratioPct}%</strong> de tu ingreso bruto. Sobre tu ingreso menos tus deudas actuales, queda una capacidad de pago de <strong>${fmt(r.capacidad, moneda)}</strong> mensuales. Aplicando esa cuota a una tasa del <strong>${r.tasa.toFixed(2)}%</strong> durante <strong>${r.plazoEfectivo} años</strong>, el monto financiable resulta en <strong>${fmt(r.monto, moneda)}</strong>.${cfg.prima && finanPct ? ` El banco financia hasta el ${finanPct}% del valor del bien, por lo que tu prima determina el valor máximo.` : ''}
          </div>
          <div class="modal-glosario">
            <strong>Fórmula utilizada (sistema francés):</strong><br/>
            cuota = monto × i / (1 − (1 + i)<sup>−n</sup>), donde i = tasa mensual y n = número de cuotas.
          </div>
          <div class="modal-glosario">
            <strong>Glosario rápido:</strong><br/>
            <em>Capacidad de pago</em>: porcentaje de tu ingreso que el banco permite destinar a cuotas.<br/>
            <em>Tasa nominal anual</em>: % de interés anual antes de comisiones y seguros.<br/>
            <em>Comisión de formalización</em>: cargo único al desembolsar el préstamo.<br/>
            <em>% financiamiento</em>: máximo del valor del bien que el banco cubre.
          </div>

          <div class="modal-actions">
            <a href="${r.params.url}" target="_blank" rel="noopener" class="modal-link-official">
              Ver en sitio oficial
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
            </a>
            <button class="modal-btn-email" onclick="abrirEmail(${idx})">Enviarme el detalle por email</button>
            <button class="modal-btn-cancel" onclick="cerrarModal(event)">Cerrar</button>
          </div>

          <p class="modal-source">
            ${textoCalidadDato(r.banco)} Datos vigentes a ${fechaLegible(r.banco.verificado)}. Esta es una estimación referencial, no una oferta vinculante.
          </p>
        </div>
      </div>
    `;
  };

  window.abrirEmail = function (idx) {
    const r = ultimosResultados[idx];
    document.body.style.overflow = 'hidden';
    els.modalHost.innerHTML = `
      <div class="modal-overlay" onclick="cerrarModal(event)">
        <div class="modal" style="max-width: 460px;" onclick="event.stopPropagation()" role="dialog" aria-labelledby="email-modal-title">
          <div class="modal-header">
            <div>
              <div class="modal-header-name" id="email-modal-title" style="font-size:20px;">Recibí tu simulación</div>
              <div class="modal-header-tag" style="margin-top:4px;">PDF con detalle, glosario y tabla de amortización</div>
            </div>
            <button class="modal-close" onclick="cerrarModal(event)" aria-label="Cerrar">×</button>
          </div>

          <form onsubmit="event.preventDefault(); enviarEmail(${idx});" novalidate>
            <div style="display:flex; flex-direction:column; gap:0.85rem;">
              <div>
                <label class="input-label" for="lead-nombre">Nombre</label>
                <input type="text" id="lead-nombre" class="input-text" placeholder="María" autocomplete="given-name" required />
              </div>
              <div>
                <label class="input-label" for="lead-apellido">Apellido</label>
                <input type="text" id="lead-apellido" class="input-text" placeholder="Rodríguez" autocomplete="family-name" required />
              </div>
              <div>
                <label class="input-label" for="lead-email">Email</label>
                <input type="email" id="lead-email" class="input-text" placeholder="maria@ejemplo.com" autocomplete="email" required />
              </div>
              <label class="checkbox-row" for="lead-acepta">
                <input type="checkbox" id="lead-acepta" required onchange="actualizarBotonEnvio()" />
                <span>Acepto los <a href="terminos.html" target="_blank" rel="noopener" class="legal-link">Términos y Condiciones</a> y la <a href="privacidad.html" target="_blank" rel="noopener" class="legal-link">Política de Privacidad</a> de PreCali.</span>
              </label>
              <label class="checkbox-row" for="lead-marketing">
                <input type="checkbox" id="lead-marketing" checked />
                <span>Quiero recibir actualizaciones de tasas y nuevas funciones de PreCali (opcional, podés darte de baja cuando quieras).</span>
              </label>
            </div>

            <div class="modal-actions">
              <button type="submit" class="modal-btn-email" id="btn-enviar" disabled title="Aceptá los Términos y Condiciones para continuar">Aceptá los términos para enviar</button>
              <button type="button" class="modal-btn-cancel" onclick="cerrarModal(event)">Cancelar</button>
            </div>
          </form>

          <p class="modal-source">
            Tus datos se tratan conforme a la Ley 8968 de Costa Rica. Al aceptar los Términos y Condiciones y la Política de Privacidad, autorizás a PreCali a compartir tu información con socios comerciales aliados que puedan ofrecerte opciones financieras personalizadas. Podés revocar tu consentimiento cuando quieras.
          </p>
        </div>
      </div>
    `;
    // Autofocus en el primer campo
    setTimeout(() => { const f = $('lead-nombre'); if (f) f.focus(); }, 50);
  };

  // Actualiza el estado del botón Enviar según el checkbox de términos
  window.actualizarBotonEnvio = function () {
    const checkbox = $('lead-acepta');
    const btn = $('btn-enviar');
    if (!checkbox || !btn) return;
    if (checkbox.checked) {
      btn.disabled = false;
      btn.textContent = 'Enviar PDF';
      btn.removeAttribute('title');
    } else {
      btn.disabled = true;
      btn.textContent = 'Aceptá los términos para enviar';
      btn.setAttribute('title', 'Aceptá los Términos y Condiciones para continuar');
    }
  };

  window.enviarEmail = function (idx) {
    const nombre = $('lead-nombre').value.trim();
    const apellido = $('lead-apellido').value.trim();
    const email = $('lead-email').value.trim();
    const acepta = $('lead-acepta').checked;
    const marketing = $('lead-marketing') ? $('lead-marketing').checked : false;
    const btn = $('btn-enviar');

    // Guard de seguridad absoluto: sin aceptación de términos no se envía nada,
    // aunque alguien fuerce el botón habilitándolo desde DevTools.
    if (!acepta) {
      btn.disabled = true;
      btn.textContent = 'Aceptá los términos para enviar';
      // Vibración visual del checkbox para llamar la atención
      const checkbox = $('lead-acepta');
      if (checkbox) {
        const row = checkbox.closest('.checkbox-row');
        if (row) {
          row.classList.add('checkbox-shake');
          setTimeout(() => row.classList.remove('checkbox-shake'), 600);
        }
      }
      return;
    }

    // Si el botón ya está procesando, ignoramos doble-click
    if (btn.dataset.sending === 'true') return;

    const original = 'Enviar PDF';

    if (!nombre || !apellido || !email) {
      btn.textContent = 'Completá todos los campos';
      setTimeout(() => { btn.textContent = original; }, 1800);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      btn.textContent = 'Email inválido';
      setTimeout(() => { btn.textContent = original; }, 1800);
      return;
    }

    const r = ultimosResultados[idx];
    const moneda = els.moneda.value;
    btn.textContent = 'Enviando…';
    btn.disabled = true;
    btn.dataset.sending = 'true';

    // Enviar a Netlify Forms
    const formData = new URLSearchParams();
    formData.append('form-name', 'lead-precalificacion');
    formData.append('nombre', nombre);
    formData.append('apellido', apellido);
    formData.append('email', email);
    formData.append('banco', r.banco.nombre);
    formData.append('tipo-prestamo', CONFIG_TIPOS[tipoActual].label);
    formData.append('monto', fmt(r.monto, moneda));
    formData.append('cuota', fmt(r.cuota, moneda));
    formData.append('acepta-terminos', 'sí');
    formData.append('acepta-marketing', marketing ? 'sí' : 'no');
    formData.append('bot-field', '');

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    })
      .then(response => {
        if (!response.ok) throw new Error('Error en el envío');
        mostrarConfirmacion(nombre, email, r);
      })
      .catch(err => {
        console.error('Error enviando lead:', err);
        // Igual mostrar confirmación al usuario
        mostrarConfirmacion(nombre, email, r);
      });
  };

  function mostrarConfirmacion(nombre, email, r) {
    document.body.style.overflow = 'hidden';
    els.modalHost.innerHTML = `
      <div class="modal-overlay" onclick="cerrarModal(event)">
        <div class="modal success-modal" style="max-width: 420px;" onclick="event.stopPropagation()">
          <div class="success-icon">✓</div>
          <h3 class="success-title">¡Listo, ${nombre}!</h3>
          <p class="success-text">
            Recibimos tu solicitud. Te enviaremos a <strong>${email}</strong> el detalle de tu pre-calificación de ${r.banco.nombre} en las próximas horas.
          </p>
          <button class="modal-btn-email" onclick="cerrarModal(event)" style="width: 100%;">Entendido</button>
        </div>
      </div>
    `;
  }

  window.abrirPrivacidad = function (e) {
    if (e) e.preventDefault();
    document.body.style.overflow = 'hidden';
    els.modalHost.innerHTML = `
      <div class="modal-overlay" onclick="cerrarModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div class="modal-header-name">Política de privacidad</div>
            <button class="modal-close" onclick="cerrarModal(event)">×</button>
          </div>
          <div style="font-size:13.5px; color:var(--ink-soft); line-height:1.7;">
            <p style="margin-bottom:1rem;"><strong>1. Qué datos recopilamos.</strong> Únicamente los que vos nos das voluntariamente al solicitar tu PDF: nombre, apellido y correo electrónico. Los datos del simulador (ingreso, deudas) se procesan localmente en tu navegador y no se almacenan en nuestros servidores.</p>
            <p style="margin-bottom:1rem;"><strong>2. Para qué los usamos.</strong> Para enviarte el PDF que solicitaste y, si aceptaste, comunicaciones ocasionales sobre actualizaciones de tasas o nuevas funciones.</p>
            <p style="margin-bottom:1rem;"><strong>3. Con quién los compartimos.</strong> Con nadie sin tu consentimiento explícito. Si en el futuro habilitamos referidos a bancos, te pediremos autorización adicional.</p>
            <p style="margin-bottom:1rem;"><strong>4. Tus derechos (Ley 8968).</strong> Podés solicitar acceso, rectificación o eliminación de tus datos en cualquier momento escribiendo a <a href="mailto:privacidad@precali.net" style="color:var(--emerald);">privacidad@precali.net</a>.</p>
            <p><strong>5. Cookies.</strong> No usamos cookies de seguimiento de terceros. Solo cookies técnicas necesarias para el funcionamiento del sitio.</p>
          </div>
        </div>
      </div>
    `;
  };

  // Cerrar modal con tecla Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.cerrarModal();
  });

  // Ajusta límites y convierte los campos manuales cuando cambia la moneda.
  function aplicarRangosMoneda(moneda, convertirValores = true) {
    const rangos = rangosParaMoneda(moneda);
    const campos = ['ingreso', 'deudas', 'prima'];
    const tasa = tasaCambioActual();

    campos.forEach(name => {
      const el = els[name];
      const r = rangos[name];
      if (!el) return;

      let nuevoValor = Number(el.value) || 0;
      if (convertirValores) {
        nuevoValor = moneda === 'usd' ? nuevoValor / tasa : nuevoValor * tasa;
        nuevoValor = Math.round(nuevoValor / r.step) * r.step;
      } else {
        nuevoValor = r.def;
      }

      el.min = r.min;
      el.max = r.max;
      el.step = r.step;
      el.value = Math.max(r.min, Math.min(r.max, Math.round(nuevoValor)));
    });
  }

  function describirFallaPrincipal(r, moneda) {
    const falla = r.fallas[0];
    if (!falla) return 'No cumple una condicion basica del banco.';
    if (falla.tipo === 'ingreso') {
      return `Ingreso minimo requerido: ${fmt(falla.requerido, moneda)}.`;
    }
    if (falla.tipo === 'deuda') {
      const ratioActual = falla.ingreso > 0 ? Math.round((falla.deudas / falla.ingreso) * 100) : 0;
      return `Deudas actuales: ${ratioActual}% del ingreso. Maximo banco: ${Math.round(falla.ratioMax * 100)}%.`;
    }
    if (falla.tipo === 'sinPrima') {
      return `Requiere prima para financiar hasta ${Math.round(falla.financia * 100)}% del bien.`;
    }
    if (falla.tipo === 'montoMin') {
      return `Monto calculado bajo el minimo: ${fmt(falla.requerido, moneda)}.`;
    }
    return 'No cumple una condicion basica del banco.';
  }

  // ---------- Render principal ----------
  function calcular() {
    const cfg = CONFIG_TIPOS[tipoActual];
    const moneda = els.moneda.value;

    // Detectar cambio de moneda y convertir campos manuales ANTES de leer valores
    if (moneda !== monedaAnterior) {
      aplicarRangosMoneda(moneda, true);
      monedaAnterior = moneda;
      // Re-ajustar plazo (que depende de bancos seleccionados) por si cambió algo
      ajustarPlazo();
    }

    // Los valores están EN LA MONEDA ACTIVA (no se convierten)
    const valIngreso = +els.ingreso.value;
    const valDeudas = +els.deudas.value;
    const plazo = +els.plazo.value;
    const valPrima = cfg.prima ? +els.prima.value : 0;

    // Mostrar tal cual en la moneda activa
    els.oIngreso.textContent = fmt(valIngreso, moneda);
    els.oDeudas.textContent = fmt(valDeudas, moneda);
    els.oPlazo.textContent = plazo + (plazo === 1 ? ' año' : ' años');
    els.oPrima.textContent = fmt(valPrima, moneda);
    actualizarAyudasMontos(moneda);

    if (!paisConDatos()) {
      const pais = getPais();
      ultimosResultados = [];
      els.aiCard.style.display = 'none';
      els.results.innerHTML = `
        <div class="no-calif-card market-results-card">
          <div class="no-calif-header">
            <div class="market-pending-flag">${pais.bandera}</div>
            <div>
              <div class="no-calif-title">${pais.nombre} todavía está en validación</div>
              <div class="no-calif-sub">PreCali ya reconoce este país, pero no calcula préstamos ahí hasta cargar bancos y fuentes oficiales. Costa Rica sigue siendo el mercado activo.</div>
            </div>
          </div>
          <div class="no-calif-foot">
            <strong>Regla de datos:</strong> no inventamos tasas ni condiciones regionales. Cuando activemos ${pais.nombre}, los resultados tendrán la misma lógica de detalle, requisitos y comparación que ves en Costa Rica.
          </div>
        </div>
      `;
      return;
    }

    // Para el cálculo interno, ya están en la moneda correcta
    const dIng = valIngreso;
    const dDeu = valDeudas;
    const dPri = valPrima;

    if (seleccion.size === 0) {
      els.results.innerHTML = `
        <div style="text-align:center; padding:3rem 1rem; color:var(--ink-muted); font-size:14px; background:var(--paper); border-radius:var(--r-xl); border:1px dashed rgba(26,26,23,0.1);">
          Seleccioná al menos un banco para ver los resultados
        </div>
      `;
      els.aiCard.style.display = 'none';
      return;
    }

    const resultados = bancosPaisActual()
      .filter(b => seleccion.has(b.id))
      .map(b => evaluarBanco(b, dIng, dDeu, plazo, moneda, dPri, cfg));

    const calificantes = resultados.filter(r => r.califica);
    const orden = els.orden.value;
    const sorters = {
      cuota: (a, b) => a.cuota - b.cuota,
      tasa: (a, b) => a.tasa - b.tasa,
      monto: (a, b) => b.monto - a.monto,
      total: (a, b) => a.total - b.total
    };
    calificantes.sort(sorters[orden]);
    ultimosResultados = calificantes;

    if (calificantes.length === 0) {
      els.aiCard.style.display = 'none';
      const barreras = generarBarrerasGlobales(resultados, dIng, dDeu, dPri, cfg, moneda);
      const cantidadBancos = resultados.length;
      els.results.innerHTML = `
        <div class="no-calif-card">
          <div class="no-calif-header">
            <div class="no-calif-icon">⚠</div>
            <div>
              <div class="no-calif-title">Aún no calificás en ${cantidadBancos === 1 ? 'el banco evaluado' : `los ${cantidadBancos} bancos seleccionados`}</div>
              <div class="no-calif-sub">Detectamos las barreras específicas que te impiden calificar y te sugerimos cómo ajustarlas para volver a intentarlo.</div>
            </div>
          </div>
          <div class="barrier-list">
            ${barreras.map(b => `
              <div class="barrier-item">
                <div class="barrier-title">${b.titulo}</div>
                <div class="barrier-desc">${b.desc}</div>
                <div class="barrier-action">${b.accion}</div>
              </div>
            `).join('')}
          </div>
          <div class="no-calif-foot">
            <strong>Recordá:</strong> esto es una estimación con criterios públicos. Algunos bancos pueden flexibilizar requisitos según tu historial CIC, antigüedad laboral, o si tenés productos vigentes con ellos. Te recomendamos contactar directamente al banco para una evaluación personalizada.
          </div>
        </div>
      `;
      return;
    }

    actualizarAI(calificantes, orden, moneda);

    const noCalifican = resultados.filter(r => !r.califica);
    const notQualifiedHtml = noCalifican.length > 0 ? `
      <div class="not-qualified-section">
        <div class="not-qualified-title">Bancos donde todavía no calificás</div>
        <div class="not-qualified-grid">
          ${noCalifican.map(r => `
            <div class="bank-card bank-card-muted">
              <div class="bank-card-header">
                <div class="bank-card-info">
                  <div class="bank-logo" style="background:${r.banco.color};">${r.banco.iniciales}</div>
                  <div class="bank-card-info-text">
                    <div class="bank-card-name">${r.banco.nombre}</div>
                    <div class="bank-card-meta">${describirFallaPrincipal(r, moneda)}</div>
                  </div>
                </div>
                <span class="status-no">No califica</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    els.results.innerHTML = calificantes.map((r, idx) => {
      const isBest = idx === 0;
      const labelMonto = cfg.prima
        ? (tipoActual === 'hipoteca' ? 'Valor máx. propiedad' : 'Valor máx. vehículo')
        : 'Monto pre-aprobado';
      const valorMostrar = cfg.prima ? r.valorBien : r.monto;
      const ratioPct = Math.round(r.ratio * 100);
      const ajuste = r.plazoEfectivo < r.plazoSolicitado
        ? ` <span class="warn">(ajustado de ${r.plazoSolicitado})</span>`
        : '';
      return `
        <div class="bank-card ${isBest ? 'best' : ''}" style="animation-delay: ${idx * 60}ms;">
          ${isBest ? `<span class="best-badge">Mejor opción</span>` : ''}
          <div class="bank-card-header">
            <div class="bank-card-info">
              <div class="bank-logo" style="background:${r.banco.color};">${r.banco.iniciales}</div>
              <div class="bank-card-info-text">
                <div class="bank-card-name">${r.banco.nombre}</div>
                <div class="bank-card-meta">${r.tasa.toFixed(2)}% · ${r.plazoEfectivo} años${ajuste} · ${ratioPct}% capacidad${etiquetaCalidadDato(r.banco)}</div>
              </div>
            </div>
            <div class="bank-card-actions">
              <span class="status-ok">✓ Califica</span>
              <button class="btn-detail" onclick="verDetalle(${idx})">Ver detalles</button>
              <button class="btn-email" onclick="abrirEmail(${idx})">Envíenmelo por email</button>
            </div>
          </div>
          <div class="bank-metrics">
            <div class="metric"><span class="metric-label">${labelMonto}</span><span class="metric-value">${fmt(valorMostrar, moneda)}</span></div>
            <div class="metric"><span class="metric-label">Cuota mensual</span><span class="metric-value">${fmt(r.cuota, moneda)}</span></div>
            <div class="metric"><span class="metric-label">Total a pagar</span><span class="metric-value">${fmt(r.total, moneda)}</span></div>
            <div class="metric"><span class="metric-label">Total intereses</span><span class="metric-value">${fmt(r.intereses, moneda)}</span></div>
          </div>
        </div>
      `;
    }).join('') + notQualifiedHtml;
  }

  // ---------- Listeners ----------
  ['ingreso', 'deudas', 'plazo', 'prima', 'moneda', 'orden'].forEach(id => {
    els[id].addEventListener('input', calcular);
    els[id].addEventListener('change', calcular);
  });

  if (els.pais) {
    els.pais.addEventListener('change', () => cambiarPais(els.pais.value));
    els.pais.addEventListener('input', () => cambiarPais(els.pais.value));
  }

  // ---------- Init ----------
  paisActual = detectarPaisInicial();
  if (!(typeof PAISES !== 'undefined' ? PAISES : []).some(p => p.id === paisActual)) paisActual = 'cr';
  seleccion = paisActual === 'cr' ? new Set(seleccionInicialCR) : new Set(bancosPaisActual().map(b => b.id));
  renderPais();
  renderBanks();
  ajustarPlazo();
  renderVerificaciones();
  actualizarFechaHero();
  calcular();
})();
