/* RAMOS IA MINI — prototipo de punto de venta por voz (DEMOSTRACIÓN).
 * Todo se guarda en localStorage de este navegador. No se conecta a ningún servidor. */
(function () {
  'use strict';

  var STORAGE_KEY = 'ramos-ia-mini:v1';
  var UNITS = {
    kg: { one: 'kg', many: 'kg', step: 0.5, decimals: true },
    unidad: { one: 'u.', many: 'u.', step: 1 },
    maple: { one: 'maple', many: 'maples', step: 1 },
    docena: { one: 'docena', many: 'docenas', step: 1 },
    paquete: { one: 'paquete', many: 'paquetes', step: 1 },
    bandeja: { one: 'bandeja', many: 'bandejas', step: 1 }
  };
  var METHODS = {
    efectivo: { label: 'Efectivo', ico: '💵' },
    transferencia: { label: 'Transferencia', ico: '🏦' },
    mercadopago: { label: 'Mercado Pago', ico: '📱' },
    tarjeta: { label: 'Tarjeta', ico: '💳' }
  };
  var VOICE_EXAMPLES = [
    'Vendé dos kilos de milanesas y tres kilos de pata muslo',
    'Un kilo y medio de milanesas',
    'Dos maples de huevos',
    'Agregá tres kilos de pollo',
    'Sacá un kilo de milanesas',
    'Cambiá los dos kilos por tres'
  ];
  var TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  // ---------------------------------------------------------------- Estado
  var storageOk = true, storageWarned = false;
  var state = load();
  var ui = { tab: 'vender', category: 'Todos', query: '' };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function defaultState() {
    return {
      version: 1,
      settings: { branch: 'Sucursal Centro (demo)', voiceLang: 'es-AR', micIntroSeen: false },
      products: clone(window.RAMOS_DEMO_PRODUCTS),
      cart: [], sales: [], movements: [], nextSaleNo: 1, lastVoiceProductId: null
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.version === 1 && Array.isArray(s.products)) {
          var d = defaultState();
          s.settings = Object.assign(d.settings, s.settings || {});
          return Object.assign(d, s);
        }
      }
    } catch (e) { storageOk = false; }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageOk = true; }
    catch (e) {
      storageOk = false;
      if (!storageWarned) { storageWarned = true; toast('Este navegador no permite guardar datos: se perderán al cerrar.', 'error'); }
    }
  }
  function commit() { save(); renderAll(); }

  // ---------------------------------------------------------------- Utilidades
  function $(sel, el) { return (el || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function parseNum(v) {
    if (v == null) return null;
    var s = String(v).trim().replace(/\s/g, '').replace(/\$/g, '');
    if (!s) return null;
    // "1.500,50" -> 1500.50 ; "1,5" -> 1.5
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  var moneyFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  function money(n) { return moneyFmt.format(round2(n || 0)); }
  function numStr(n, max) { return Number(n).toLocaleString('es-AR', { maximumFractionDigits: max == null ? 3 : max }); }
  function unitOf(p) { return UNITS[p.unit] || UNITS.unidad; }
  function qtyStr(q, unitKey) {
    var u = UNITS[unitKey] || UNITS.unidad;
    return numStr(q) + ' ' + (Math.abs(q) === 1 ? u.one : u.many);
  }
  function inputQty(q) { return q == null ? '' : String(q).replace('.', ','); }
  function productById(id) {
    for (var i = 0; i < state.products.length; i++) if (state.products[i].id === id) return state.products[i];
    return null;
  }
  function cartLine(id) {
    for (var i = 0; i < state.cart.length; i++) if (state.cart[i].productId === id) return state.cart[i];
    return null;
  }
  function lineSubtotal(line) { var p = productById(line.productId); return p ? round2(line.qty * p.price) : 0; }
  function cartTotal() { return round2(state.cart.reduce(function (s, l) { return s + lineSubtotal(l); }, 0)); }
  function isLow(p) { return p.minStock != null && p.stock <= p.minStock; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function isToday(iso) { var d = new Date(iso), n = new Date(); return d.toDateString() === n.toDateString(); }
  function timeStr(iso) { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
  function dateTimeStr(iso) { return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

  // ---------------------------------------------------------------- Aviso / confirmación / hoja
  var toastTimer;
  function toast(msg, kind) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (kind ? ' ' + kind : ''); }, 2600);
  }

  function askConfirm(opts) {
    return new Promise(function (resolve) {
      var layer = $('#confirmLayer');
      $('#confirmTitle').textContent = opts.title;
      $('#confirmText').textContent = opts.text || '';
      var ok = $('#confirmOk'), cancel = $('#confirmCancel');
      ok.textContent = opts.ok || 'Aceptar';
      ok.className = 'btn ' + (opts.danger ? 'primary' : 'navy');
      layer.hidden = false;
      function done(v) { layer.hidden = true; ok.onclick = cancel.onclick = null; resolve(v); }
      ok.onclick = function () { done(true); };
      cancel.onclick = function () { done(false); };
    });
  }

  var sheetOnClose = null;
  function openSheet(title, html, opts) {
    var sheet = $('#sheet'), bd = $('#sheetBackdrop');
    if (sheetOnClose) { var prev = sheetOnClose; sheetOnClose = null; prev(); }
    $('#sheetTitle').textContent = title;
    $('#sheetBody').innerHTML = html;
    $('#sheetBody').scrollTop = 0;
    sheetOnClose = (opts && opts.onClose) || null;
    sheet.hidden = false; bd.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('open'); bd.classList.add('open'); }); });
  }
  function closeSheet() {
    var sheet = $('#sheet'), bd = $('#sheetBackdrop');
    if (sheet.hidden) return;
    if (sheetOnClose) { var cb = sheetOnClose; sheetOnClose = null; cb(); }
    sheet.classList.remove('open'); bd.classList.remove('open');
    setTimeout(function () { if (!sheet.classList.contains('open')) { sheet.hidden = true; bd.hidden = true; } }, 280);
  }
  function setSheetTitle(t) { $('#sheetTitle').textContent = t; }

  // ---------------------------------------------------------------- Reloj
  function tickClock() {
    var now = new Date();
    $('#clockTime').textContent = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    $('#clockDate').textContent = now.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // ---------------------------------------------------------------- Render
  function renderAll() {
    $('#branchName').textContent = state.settings.branch;
    renderVender();
    renderSaleBar();
    if (ui.tab === 'productos') renderProducts();
    if (ui.tab === 'stock') renderStock();
    if (ui.tab === 'ventas') renderSales();
    var low = state.products.filter(isLow).length;
    var sb = $('#stockBadge'); sb.hidden = !low; sb.textContent = low;
    var tb = $('#tabBadge'); tb.hidden = !state.cart.length; tb.textContent = state.cart.length;
  }

  function categories() {
    var seen = {}, out = [];
    state.products.forEach(function (p) { var c = p.category || 'Otros'; if (!seen[c]) { seen[c] = 1; out.push(c); } });
    return out;
  }

  function renderVender() {
    var favs = state.products.filter(function (p) { return p.favorite; });
    $('#favorites').innerHTML = favs.length ? favs.map(function (p) {
      return '<button class="chip fav" data-action="qtySheet" data-id="' + esc(p.id) + '"><b>★</b> ' + esc(p.name) + '</button>';
    }).join('') : '<span class="muted">Marcá favoritos desde Productos.</span>';

    var cats = ['Todos'].concat(categories());
    if (cats.indexOf(ui.category) < 0) ui.category = 'Todos';
    $('#categories').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === ui.category ? ' active' : '') + '" data-action="category" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');

    var q = norm(ui.query).trim();
    $('#browse').hidden = !!q;
    var list = state.products.filter(function (p) {
      if (q) return norm(p.name + ' ' + (p.category || '') + ' ' + (p.aliases || []).join(' ')).indexOf(q) >= 0;
      return ui.category === 'Todos' || (p.category || 'Otros') === ui.category;
    });
    $('#productGrid').innerHTML = list.length ? list.map(function (p) {
      var line = cartLine(p.id);
      return '<div class="product' + (line ? ' in-cart' : '') + '" data-action="qtySheet" data-id="' + esc(p.id) + '" role="button" tabindex="0">' +
        (line ? '<span class="qty-tag">' + esc(qtyStr(line.qty, p.unit)) + '</span>' : '') +
        '<span class="product-name">' + esc(p.name) + '</span>' +
        '<span class="product-cat">' + esc(p.category || '') + '</span>' +
        '<span class="product-stock' + (isLow(p) ? ' low' : '') + '">Stock: ' + esc(qtyStr(p.stock, p.unit)) + (isLow(p) ? ' · BAJO' : '') + '</span>' +
        '<div class="product-foot"><span class="product-price">' + money(p.price) + ' <small>/ ' + esc(unitOf(p).one) + '</small></span>' +
        '<button class="add-btn" data-action="quickAdd" data-id="' + esc(p.id) + '" aria-label="Agregar ' + esc(qtyStr(1, p.unit)) + ' de ' + esc(p.name) + '">+</button></div>' +
        '</div>';
    }).join('') : '<div class="empty" style="grid-column:1/-1">No hay productos que coincidan.</div>';

    renderCartInto($('#cartList'));
    $('#cartSummary').textContent = state.cart.length ? state.cart.length + (state.cart.length === 1 ? ' producto' : ' productos') : '';
  }

  function renderCartInto(el) {
    if (!state.cart.length) {
      el.innerHTML = '<div class="empty">Carrito vacío. Tocá un producto o usá <b>VENDER POR VOZ</b>.</div>';
      return;
    }
    el.innerHTML = state.cart.map(function (line) {
      var p = productById(line.productId);
      if (!p) return '';
      var short = line.qty > p.stock;
      return '<div class="cart-line">' +
        '<div><div class="name">' + esc(p.name) + '</div><div class="unit-price">' + money(p.price) + ' / ' + esc(unitOf(p).one) + '</div></div>' +
        '<div class="subtotal">' + money(lineSubtotal(line)) + '</div>' +
        '<div class="cart-controls">' +
          '<div class="stepper">' +
            '<button data-action="dec" data-id="' + esc(p.id) + '" aria-label="Restar">−</button>' +
            '<input inputmode="decimal" value="' + esc(inputQty(line.qty)) + '" data-input="cartQty" data-id="' + esc(p.id) + '" aria-label="Cantidad de ' + esc(p.name) + '">' +
            '<button data-action="inc" data-id="' + esc(p.id) + '" aria-label="Sumar">+</button>' +
          '</div>' +
          '<span class="unit-label">' + esc(unitOf(p).many) + '</span>' +
          '<button class="del-btn" data-action="removeLine" data-id="' + esc(p.id) + '" aria-label="Quitar ' + esc(p.name) + '">' + TRASH + '</button>' +
        '</div>' +
        (short ? '<div class="warn-text">⚠ Stock insuficiente: quedan ' + esc(qtyStr(p.stock, p.unit)) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  var lastTotal = null;
  function renderSaleBar() {
    var total = cartTotal();
    var el = $('#cartTotal');
    el.textContent = money(total);
    if (lastTotal !== null && lastTotal !== total) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    lastTotal = total;
    $('#cartCount').textContent = state.cart.length;
    $('#btnCheckout').disabled = !state.cart.length;
    $('#btnClear').disabled = !state.cart.length;
    document.body.classList.toggle('on-vender', ui.tab === 'vender' || state.cart.length > 0);
  }

  function renderProducts() {
    $('#productList').innerHTML = state.products.length ? state.products.map(function (p) {
      var margin = p.price > 0 ? Math.round((p.price - p.cost) / p.price * 100) : 0;
      return '<button class="row" data-action="editProduct" data-id="' + esc(p.id) + '">' +
        '<div class="row-main"><div class="row-title">' + (p.favorite ? '<span style="color:var(--red)">★</span> ' : '') + esc(p.name) + '</div>' +
        '<div class="row-sub">' + esc(p.category || 'Sin categoría') + ' · por ' + esc(unitOf(p).one) + ' · costo ' + money(p.cost) + '</div></div>' +
        '<div class="row-end">' + money(p.price) + '<small>margen ' + margin + '%</small></div>' +
        '</button>';
    }).join('') : '<div class="empty">No hay productos. Tocá “+ Nuevo”.</div>';
  }

  function renderStock() {
    var low = state.products.filter(isLow);
    $('#lowStock').innerHTML = low.length ?
      '<div class="alert warn"><b>⚠ Stock bajo</b><ul>' + low.map(function (p) {
        return '<li>' + esc(p.name) + ': ' + esc(qtyStr(p.stock, p.unit)) + ' (mínimo ' + esc(qtyStr(p.minStock, p.unit)) + ')</li>';
      }).join('') + '</ul></div>' :
      '<div class="alert ok">Todo el stock está por encima del mínimo.</div>';
    $('#stockList').innerHTML = state.products.map(function (p) {
      var ref = Math.max(p.minStock * 3, p.stock, 1);
      var pct = Math.max(0, Math.min(100, p.stock / ref * 100));
      return '<div class="row">' +
        '<div class="row-main"><div class="row-title">' + esc(p.name) + '</div>' +
        '<div class="row-sub">Mínimo: ' + esc(qtyStr(p.minStock, p.unit)) + '</div>' +
        '<div class="bar"><i class="' + (isLow(p) ? 'low' : '') + '" style="width:' + pct.toFixed(0) + '%"></i></div></div>' +
        '<div class="row-end"><span class="stock-num' + (isLow(p) ? ' low' : '') + '">' + esc(numStr(p.stock)) + '</span><small>' + esc(unitOf(p).many) + '</small></div>' +
        '<button class="btn ghost small" data-action="adjustStock" data-id="' + esc(p.id) + '">Ajustar</button>' +
        '</div>';
    }).join('');
    var moves = state.movements.slice(-30).reverse();
    $('#movementList').innerHTML = moves.length ? moves.map(function (m) {
      var cls = m.qty >= 0 ? 'ok' : 'red';
      return '<div class="row"><div class="row-main"><div class="row-title">' + esc(m.name) + '</div>' +
        '<div class="row-sub">' + esc(dateTimeStr(m.date)) + ' · ' + esc(m.reason) + '</div></div>' +
        '<div class="row-end"><span class="pill ' + cls + '">' + (m.qty >= 0 ? '+' : '') + esc(numStr(m.qty)) + ' ' + esc((UNITS[m.unit] || UNITS.unidad).many) + '</span></div></div>';
    }).join('') : '<div class="empty">Sin movimientos todavía.</div>';
  }

  function saleNetByMethod(sale) {
    // El vuelto se descuenta del efectivo.
    var out = {};
    sale.payments.forEach(function (p) { out[p.method] = (out[p.method] || 0) + p.amount; });
    if (sale.change) out.efectivo = round2((out.efectivo || 0) - sale.change);
    return out;
  }

  function renderSales() {
    var today = state.sales.filter(function (s) { return !s.voided && isToday(s.date); });
    var total = 0, profit = 0, methods = {};
    today.forEach(function (s) {
      total += s.total;
      s.items.forEach(function (it) { profit += (it.price - it.cost) * it.qty; });
      var net = saleNetByMethod(s);
      Object.keys(net).forEach(function (k) { methods[k] = (methods[k] || 0) + net[k]; });
    });
    var methodRows = Object.keys(METHODS).filter(function (k) { return methods[k]; }).map(function (k) {
      return '<span>' + METHODS[k].ico + ' ' + METHODS[k].label + '</span><b>' + money(methods[k]) + '</b>';
    }).join('');
    $('#salesStats').innerHTML =
      '<div class="stat"><div class="k">Total vendido</div><div class="v">' + money(total) + '</div></div>' +
      '<div class="stat"><div class="k">Ventas</div><div class="v">' + today.length + '</div></div>' +
      '<div class="stat"><div class="k">Ganancia estimada</div><div class="v">' + money(profit) + '</div></div>' +
      '<div class="stat"><div class="k">Ticket promedio</div><div class="v">' + money(today.length ? total / today.length : 0) + '</div></div>' +
      (methodRows ? '<div class="stat wide"><div class="k">Por medio de pago (neto de vuelto)</div><div class="methods">' + methodRows + '</div></div>' : '');
    var list = state.sales.slice().reverse().slice(0, 200);
    $('#salesList').innerHTML = list.length ? list.map(function (s) {
      var pills = s.payments.map(function (p) { return '<span class="pill">' + esc(METHODS[p.method].label) + '</span>'; }).join('');
      return '<button class="row' + (s.voided ? ' voided' : '') + '" data-action="saleDetail" data-id="' + esc(s.id) + '">' +
        '<div class="row-main"><div class="row-title">Venta #' + s.no + (s.voided ? ' <span class="pill red">ANULADA</span>' : '') + '</div>' +
        '<div class="row-sub">' + esc(dateTimeStr(s.date)) + ' · ' + s.items.length + (s.items.length === 1 ? ' producto' : ' productos') + '</div>' +
        '<div style="margin-top:4px">' + pills + '</div></div>' +
        '<div class="row-end">' + money(s.total) + '</div></button>';
    }).join('') : '<div class="empty">Todavía no hay ventas registradas.</div>';
  }

  function setTab(tab) {
    ui.tab = tab;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === tab); });
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.dataset.view === tab); });
    renderAll();
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- Carrito
  function addToCart(id, qty) {
    var p = productById(id);
    if (!p || !(qty > 0)) return;
    var line = cartLine(id);
    if (line) line.qty = round3(line.qty + qty);
    else state.cart.push({ productId: id, qty: round3(qty) });
  }
  function setCartQty(id, qty) {
    if (!(qty > 0)) { state.cart = state.cart.filter(function (l) { return l.productId !== id; }); return; }
    var line = cartLine(id);
    if (line) line.qty = round3(qty); else state.cart.push({ productId: id, qty: round3(qty) });
  }
  function validQty(p, qty) {
    if (qty == null || !(qty > 0)) return 'Ingresá una cantidad mayor a 0';
    if (p.unit === 'unidad' && Math.round(qty) !== qty) return 'Este producto se vende por unidad entera';
    return null;
  }

  function openQtySheet(id) {
    var p = productById(id);
    if (!p) return;
    var u = unitOf(p);
    var quick = p.unit === 'kg' ? [0.5, 1, 1.5, 2, 3, 5] : [1, 2, 3, 6, 10, 12];
    var line = cartLine(id);
    var start = 1;
    openSheet(p.name,
      '<div class="big-total"><div class="k">' + money(p.price) + ' por ' + esc(u.one) + ' · DEMO</div>' +
      '<div class="v" id="qtySubtotal">' + money(p.price * start) + '</div></div>' +
      '<div class="sheet-qty"><div class="stepper">' +
        '<button data-action="qtyStep" data-step="-1" aria-label="Restar">−</button>' +
        '<input id="qtyInput" inputmode="decimal" value="' + inputQty(start) + '" aria-label="Cantidad">' +
        '<button data-action="qtyStep" data-step="1" aria-label="Sumar">+</button>' +
      '</div><span class="unit-label">' + esc(u.many) + '</span></div>' +
      '<div class="quick">' + quick.map(function (q) {
        return '<button class="chip" data-action="qtyQuick" data-q="' + q + '">' + esc(qtyStr(q, p.unit)) + '</button>';
      }).join('') + '</div>' +
      '<p class="muted" id="qtyInfo">Stock: ' + esc(qtyStr(p.stock, p.unit)) + (line ? ' · En el carrito: ' + esc(qtyStr(line.qty, p.unit)) : '') + '</p>' +
      '<p class="preview-msg error" id="qtyError"></p>' +
      '<button class="btn primary block" data-action="qtyAdd" data-id="' + esc(p.id) + '">Agregar al carrito</button>');
    $('#sheetBody').dataset.productId = id;
  }
  function updateQtySheet() {
    var p = productById($('#sheetBody').dataset.productId);
    var q = parseNum($('#qtyInput').value);
    $('#qtySubtotal').textContent = money((q || 0) * p.price);
    $('#qtyError').textContent = q == null ? '' : (validQty(p, q) || '');
  }

  // ---------------------------------------------------------------- Cobro
  var checkout = null;
  function openCheckout() {
    if (!state.cart.length) return;
    checkout = { payments: [] };
    renderCheckout();
  }
  function payTotals() {
    var total = cartTotal(), cash = 0, other = 0;
    checkout.payments.forEach(function (p) { if (p.method === 'efectivo') cash += p.amount || 0; else other += p.amount || 0; });
    cash = round2(cash); other = round2(other);
    var paid = round2(cash + other);
    var res = { total: total, paid: paid, cash: cash, other: other, missing: 0, change: 0, error: null };
    if (other > total) res.error = 'Los pagos que no son en efectivo superan el total.';
    else if (paid < total) res.missing = round2(total - paid);
    else res.change = round2(paid - total);
    return res;
  }
  function renderCheckout() {
    var t = payTotals();
    var shortItems = state.cart.filter(function (l) { var p = productById(l.productId); return p && l.qty > p.stock; });
    var html =
      '<div class="big-total"><div class="k">TOTAL A COBRAR</div><div class="v">' + money(t.total) + '</div></div>' +
      (shortItems.length ? '<div class="alert warn">⚠ Stock insuficiente para: ' + shortItems.map(function (l) { return esc(productById(l.productId).name); }).join(', ') + '. Si confirmás, el stock quedará negativo.</div>' : '') +
      '<div class="methods-grid">' + Object.keys(METHODS).map(function (k) {
        var used = checkout.payments.some(function (p) { return p.method === k; });
        return '<button class="method-btn' + (used ? ' used' : '') + '" data-action="addPay" data-method="' + k + '"><span class="ico">' + METHODS[k].ico + '</span>' + METHODS[k].label + '</button>';
      }).join('') + '</div>' +
      (checkout.payments.length ? '' : '<p class="muted" style="text-align:center;margin-top:12px">Elegí uno o varios medios de pago. Podés dividir el pago.</p>') +
      '<div id="payLines">' + checkout.payments.map(function (p, i) {
        return '<div class="pay-line"><div class="lbl">' + METHODS[p.method].ico + ' ' + METHODS[p.method].label +
          (p.method === 'efectivo' ? '<small>Recibido</small>' : '') + '</div>' +
          '<input inputmode="decimal" data-input="payAmount" data-i="' + i + '" value="' + esc(p.amount ? String(p.amount).replace('.', ',') : '') + '" placeholder="$ 0" aria-label="Monto ' + METHODS[p.method].label + '">' +
          '<button class="del-btn" data-action="delPay" data-i="' + i + '" aria-label="Quitar pago">✕</button></div>';
      }).join('') + '</div>' +
      (checkout.payments.some(function (p) { return p.method === 'efectivo'; }) ?
        '<div class="quick">' + [['exact', 'Justo'], [1000, '+ $1.000'], [2000, '+ $2.000'], [10000, '+ $10.000'], [20000, '+ $20.000']].map(function (b) {
          return '<button class="chip" data-action="cashQuick" data-v="' + b[0] + '">' + b[1] + '</button>';
        }).join('') + '</div>' : '') +
      '<div class="pay-summary" id="paySummary"></div>' +
      '<button class="btn ok block" style="margin-top:14px;min-height:60px;font-size:19px" id="btnConfirmSale" data-action="confirmSale">Confirmar venta</button>';
    if ($('#sheet').hidden || $('#sheetTitle').textContent !== 'Cobrar') openSheet('Cobrar', html, { onClose: function () { checkout = null; } });
    else $('#sheetBody').innerHTML = html;
    updatePaySummary();
  }
  function updatePaySummary() {
    var t = payTotals();
    var html = '<span>Total</span><b>' + money(t.total) + '</b><span>Pagado</span><b>' + money(t.paid) + '</b>';
    if (t.error) html += '<span class="red" style="grid-column:1/-1;font-weight:700">' + esc(t.error) + '</span>';
    else if (t.missing > 0) html += '<span class="red strong">Falta</span><span class="red strong">' + money(t.missing) + '</span>';
    else html += '<span class="ok strong">Vuelto</span><span class="ok strong">' + money(t.change) + '</span>';
    $('#paySummary').innerHTML = html;
    $('#btnConfirmSale').disabled = !!t.error || t.missing > 0 || !checkout.payments.some(function (p) { return p.amount > 0; });
  }
  function confirmSale() {
    var t = payTotals();
    if (t.error || t.missing > 0) return;
    var sale = {
      id: uid(), no: state.nextSaleNo++, date: new Date().toISOString(),
      items: state.cart.map(function (l) {
        var p = productById(l.productId);
        return { productId: p.id, name: p.name, unit: p.unit, qty: l.qty, price: p.price, cost: p.cost, subtotal: lineSubtotal(l) };
      }),
      total: t.total,
      payments: checkout.payments.filter(function (p) { return p.amount > 0; }).map(function (p) { return { method: p.method, amount: round2(p.amount) }; }),
      change: t.change, voided: false
    };
    var newlyLow = [];
    sale.items.forEach(function (it) {
      var p = productById(it.productId);
      var wasLow = isLow(p);
      p.stock = round3(p.stock - it.qty);
      state.movements.push({ date: sale.date, productId: p.id, name: p.name, unit: p.unit, qty: -it.qty, reason: 'Venta #' + sale.no });
      if (!wasLow && isLow(p)) newlyLow.push(p.name);
    });
    state.sales.push(sale);
    state.cart = [];
    trimHistory();
    checkout = null;
    sheetOnClose = null;
    commit();
    requestPersistence();
    openSheet('Venta registrada',
      '<div class="success"><div class="check">✓</div>' +
      '<h3>Venta #' + sale.no + ' · ' + money(sale.total) + '</h3>' +
      (sale.change > 0 ? '<p class="muted" style="margin:10px 0 0">Vuelto</p><div class="change">' + money(sale.change) + '</div>' : '<p class="muted">Sin vuelto</p>') +
      '<p class="muted">' + sale.payments.map(function (p) { return METHODS[p.method].label + ' ' + money(p.amount); }).join(' · ') + '</p>' +
      (newlyLow.length ? '<div class="alert warn" style="text-align:left">⚠ Stock bajo: ' + esc(newlyLow.join(', ')) + '</div>' : '') +
      '<button class="btn primary block" data-action="closeSheet">Nueva venta</button></div>');
  }
  function trimHistory() {
    if (state.movements.length > 500) state.movements = state.movements.slice(-500);
    if (state.sales.length > 1000) state.sales = state.sales.slice(-1000);
  }

  function openSaleDetail(id) {
    var s = state.sales.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    openSheet('Venta #' + s.no,
      (s.voided ? '<div class="alert red"><b>Venta anulada.</b> El stock fue devuelto.</div>' : '') +
      '<p class="muted">' + esc(new Date(s.date).toLocaleString('es-AR')) + '</p>' +
      '<div class="card">' + s.items.map(function (it) {
        return '<div class="cart-line"><div><div class="name">' + esc(it.name) + '</div><div class="unit-price">' + esc(qtyStr(it.qty, it.unit)) + ' × ' + money(it.price) + '</div></div><div class="subtotal">' + money(it.subtotal) + '</div></div>';
      }).join('') + '</div>' +
      '<div class="pay-summary">' + s.payments.map(function (p) {
        return '<span>' + METHODS[p.method].ico + ' ' + METHODS[p.method].label + '</span><b>' + money(p.amount) + '</b>';
      }).join('') + (s.change ? '<span>Vuelto</span><b>' + money(s.change) + '</b>' : '') +
      '<span class="strong">Total</span><span class="strong">' + money(s.total) + '</span></div>' +
      (s.voided ? '' : '<button class="btn danger block" style="margin-top:14px" data-action="voidSale" data-id="' + esc(s.id) + '">Anular venta y devolver stock</button>'));
  }
  function voidSale(id) {
    var s = state.sales.filter(function (x) { return x.id === id; })[0];
    if (!s || s.voided) return;
    askConfirm({ title: '¿Anular venta #' + s.no + '?', text: 'El stock de los productos se devuelve.', ok: 'Anular', danger: true }).then(function (ok) {
      if (!ok) return;
      s.voided = true;
      var date = new Date().toISOString();
      s.items.forEach(function (it) {
        var p = productById(it.productId);
        if (p) {
          p.stock = round3(p.stock + it.qty);
          state.movements.push({ date: date, productId: p.id, name: p.name, unit: p.unit, qty: it.qty, reason: 'Anulación venta #' + s.no });
        }
      });
      commit();
      closeSheet();
      toast('Venta #' + s.no + ' anulada');
    });
  }

  // ---------------------------------------------------------------- Productos
  function openProductForm(id) {
    var p = id ? productById(id) : null;
    var isNew = !p;
    p = p || { name: '', category: '', unit: 'kg', cost: '', price: '', stock: '', minStock: '', favorite: false, aliases: [] };
    var cats = categories();
    openSheet(isNew ? 'Nuevo producto' : 'Editar producto',
      '<form id="productForm" autocomplete="off">' +
      '<label class="field"><span>Nombre</span><input name="name" required value="' + esc(p.name) + '" placeholder="Ej: Suprema"></label>' +
      '<div class="grid-2">' +
        '<label class="field"><span>Categoría</span><input name="category" list="catList" value="' + esc(p.category) + '" placeholder="Pollo"></label>' +
        '<label class="field"><span>Unidad de venta</span><select name="unit">' + Object.keys(UNITS).map(function (k) {
          return '<option value="' + k + '"' + (p.unit === k ? ' selected' : '') + '>' + (k === 'kg' ? 'Kilogramo (kg)' : k.charAt(0).toUpperCase() + k.slice(1)) + '</option>';
        }).join('') + '</select></label>' +
      '</div>' +
      '<datalist id="catList">' + cats.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<div class="grid-2">' +
        '<label class="field"><span>Precio de costo ($)</span><input name="cost" inputmode="decimal" value="' + esc(inputQty(p.cost)) + '" placeholder="0"></label>' +
        '<label class="field"><span>Precio de venta ($)</span><input name="price" inputmode="decimal" value="' + esc(inputQty(p.price)) + '" placeholder="0"></label>' +
      '</div>' +
      '<div class="grid-2">' +
        '<label class="field"><span>' + (isNew ? 'Stock inicial' : 'Stock actual') + '</span><input name="stock" inputmode="decimal" value="' + esc(inputQty(p.stock)) + '" placeholder="0"></label>' +
        '<label class="field"><span>Aviso stock bajo en</span><input name="minStock" inputmode="decimal" value="' + esc(inputQty(p.minStock)) + '" placeholder="0"></label>' +
      '</div>' +
      '<label class="switch">Favorito (aparece arriba en Vender)<input type="checkbox" name="favorite"' + (p.favorite ? ' checked' : '') + '></label>' +
      '<label class="field"><span>Palabras para voz (separadas por coma)</span><input name="aliases" value="' + esc((p.aliases || []).join(', ')) + '" placeholder="milanesa, milanga">' +
      '<small>El nombre ya se reconoce. Agregá otras formas en que lo dicen los clientes.</small></label>' +
      '<p class="preview-msg error" id="productError"></p>' +
      '<button class="btn primary block" type="submit">' + (isNew ? 'Crear producto' : 'Guardar cambios') + '</button>' +
      (isNew ? '' : '<button class="btn danger block" type="button" style="margin-top:10px" data-action="deleteProduct" data-id="' + esc(id) + '">Eliminar producto</button>') +
      '</form>');
    $('#productForm').dataset.id = id || '';
  }
  function submitProduct(form) {
    var f = form.elements;
    var data = {
      name: f.name.value.trim(), category: f.category.value.trim() || 'Otros', unit: f.unit.value,
      cost: parseNum(f.cost.value), price: parseNum(f.price.value),
      stock: parseNum(f.stock.value), minStock: parseNum(f.minStock.value),
      favorite: f.favorite.checked,
      aliases: f.aliases.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    };
    var err = null;
    if (!data.name) err = 'Ingresá un nombre.';
    else if (data.price == null || data.price < 0) err = 'Ingresá un precio de venta válido.';
    else if (data.cost != null && data.cost < 0) err = 'El costo no puede ser negativo.';
    var id = form.dataset.id;
    var dup = state.products.some(function (p) { return p.id !== id && norm(p.name) === norm(data.name); });
    if (!err && dup) err = 'Ya existe un producto con ese nombre.';
    if (err) { $('#productError').textContent = err; return; }
    data.cost = data.cost || 0;
    data.stock = data.stock || 0;
    data.minStock = data.minStock || 0;
    var now = new Date().toISOString();
    if (id) {
      var p = productById(id);
      if (data.stock !== p.stock) {
        state.movements.push({ date: now, productId: p.id, name: data.name, unit: data.unit, qty: round3(data.stock - p.stock), reason: 'Corrección desde Productos' });
      }
      Object.assign(p, data);
      toast('Producto actualizado');
    } else {
      var np = Object.assign({ id: 'p-' + uid() }, data);
      state.products.push(np);
      if (np.stock) state.movements.push({ date: now, productId: np.id, name: np.name, unit: np.unit, qty: np.stock, reason: 'Stock inicial' });
      toast('Producto creado');
    }
    closeSheet();
    commit();
  }
  function deleteProduct(id) {
    var p = productById(id);
    if (!p) return;
    askConfirm({ title: '¿Eliminar ' + p.name + '?', text: 'Se quita de la lista y del carrito. El historial de ventas se conserva.', ok: 'Eliminar', danger: true }).then(function (ok) {
      if (!ok) return;
      state.products = state.products.filter(function (x) { return x.id !== id; });
      state.cart = state.cart.filter(function (l) { return l.productId !== id; });
      closeSheet();
      commit();
      toast('Producto eliminado');
    });
  }

  // ---------------------------------------------------------------- Stock
  var adjust = null;
  function openAdjust(id) {
    var p = productById(id);
    if (!p) return;
    adjust = { id: id, mode: 'in' };
    openSheet('Ajustar stock',
      '<div class="big-total"><div class="k">' + esc(p.name.toUpperCase()) + ' · STOCK ACTUAL</div><div class="v">' + esc(qtyStr(p.stock, p.unit)) + '</div></div>' +
      '<div class="segmented" id="adjustModes">' +
        '<button type="button" class="active" data-action="adjustMode" data-mode="in">Ingreso +</button>' +
        '<button type="button" data-action="adjustMode" data-mode="out">Egreso −</button>' +
        '<button type="button" data-action="adjustMode" data-mode="set">Fijar =</button>' +
      '</div>' +
      '<label class="field"><span id="adjustLabel">Cantidad que ingresa (' + esc(unitOf(p).many) + ')</span><input id="adjustQty" inputmode="decimal" placeholder="0"></label>' +
      '<label class="field"><span>Motivo</span><select id="adjustReason"><option>Compra / reposición</option><option>Merma</option><option>Conteo físico</option><option>Corrección</option><option>Otro</option></select></label>' +
      '<p class="preview-msg error" id="adjustError"></p>' +
      '<button class="btn primary block" data-action="saveAdjust">Guardar ajuste</button>',
      { onClose: function () { adjust = null; } });
  }
  function saveAdjust() {
    var p = productById(adjust.id);
    var q = parseNum($('#adjustQty').value);
    if (q == null || q < 0 || (adjust.mode !== 'set' && q === 0)) { $('#adjustError').textContent = 'Ingresá una cantidad válida.'; return; }
    var delta = adjust.mode === 'in' ? q : adjust.mode === 'out' ? -q : round3(q - p.stock);
    p.stock = round3(p.stock + delta);
    state.movements.push({ date: new Date().toISOString(), productId: p.id, name: p.name, unit: p.unit, qty: round3(delta), reason: 'Ajuste: ' + $('#adjustReason').value });
    trimHistory();
    closeSheet();
    commit();
    toast('Stock de ' + p.name + ': ' + qtyStr(p.stock, p.unit) + (isLow(p) ? ' (bajo)' : ''), isLow(p) ? 'warn' : null);
  }

  // ---------------------------------------------------------------- Ajustes
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isEmbedded = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  function isStandalone() {
    return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  function openSettings() {
    var lang = state.settings.voiceLang;
    var diag = [
      ['Conexión segura (HTTPS)', window.isSecureContext],
      ['Reconocimiento de voz del navegador', !!SR],
      ['Abierta desde pantalla de inicio', isStandalone()],
      ['Dentro de otra página (vista previa)', isEmbedded],
      ['Guardado local disponible', storageOk]
    ];
    openSheet('Ajustes',
      '<label class="field"><span>Nombre de la sucursal</span><input id="setBranch" value="' + esc(state.settings.branch) + '"></label>' +
      '<label class="field"><span>Idioma del reconocimiento de voz</span><select id="setLang">' +
        [['es-AR', 'Español (Argentina)'], ['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['es-US', 'Español (EE.UU.)'], ['es-CL', 'Español (Chile)']].map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === lang ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select><small>Si Safari dice que el idioma no está disponible, probá “Español (México)” o “España”.</small></label>' +
      '<button class="btn navy block" data-action="saveSettings">Guardar</button>' +
      '<h3 class="section-title">Diagnóstico de este dispositivo</h3>' +
      '<div class="card">' + diag.map(function (d) {
        return '<div class="cart-line"><div>' + d[0] + '</div><div class="subtotal">' + (d[1] ? '<span class="pill ok">SÍ</span>' : '<span class="pill red">NO</span>') + '</div></div>';
      }).join('') + '</div>' +
      (isIOS && isStandalone() ? '<div class="alert warn" style="margin-top:10px">En iPhone, la voz web puede no funcionar en la app de la pantalla de inicio. Si falla, abrí la misma dirección en Safari o usá el 🎤 del teclado.</div>' : '') +
      '<h3 class="section-title">Datos</h3>' +
      '<div class="alert info"><b>Importante:</b> los productos, precios, stock y ventas se guardan <b>solo en este navegador</b>. Se pierden si borrás los datos de Safari, usás navegación privada o desinstalás la app. Exportá una copia si los necesitás.</div>' +
      '<p class="muted" id="persistInfo"></p>' +
      '<div class="btn-row"><button class="btn ghost" data-action="exportData">Exportar copia</button>' +
      '<button class="btn danger" data-action="resetData">Reiniciar demo</button></div>' +
      '<p class="muted" style="margin-top:18px;font-size:12px">RAMOS IA MINI · prototipo independiente de demostración. No está conectado a la base de datos de RAMOS IA.</p>');
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) {
        var el = $('#persistInfo');
        if (el) el.textContent = p ? 'El navegador marcó estos datos como persistentes.' : 'El navegador puede borrar estos datos si necesita espacio.';
      }).catch(function () {});
    }
  }
  function requestPersistence() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) { /* sin soporte */ }
  }
  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'ramos-ia-mini-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // ---------------------------------------------------------------- Voz
  var voice = { rec: null, finalText: '', interim: '', text: '', result: null, error: null, errorCode: null, cancelled: false, gotStart: false, timers: [] };

  function voiceErrorMessage(code) {
    if (isEmbedded && (code === 'not-allowed' || code === 'service-not-allowed')) {
      return 'Esta vista previa está dentro de otra página y el navegador bloquea el micrófono. Abrí la dirección publicada (GitHub Pages) en Safari, o usá el 🎤 del teclado.';
    }
    switch (code) {
      case 'not-allowed':
        return 'Safari no tiene permiso para usar el micrófono. Tocá “aA” en la barra de direcciones → Configuración del sitio web → Micrófono → Permitir. También revisá Ajustes del iPhone → Safari → Micrófono.';
      case 'service-not-allowed':
        return isStandalone()
          ? 'iOS no habilita el reconocimiento de voz en apps abiertas desde la pantalla de inicio. Abrí la misma dirección en Safari, o usá el 🎤 del teclado abajo.'
          : 'El reconocimiento de voz no está disponible. Activá “Siri” y “Dictado” en Ajustes del iPhone (General → Teclado → Activar dictado) y volvé a intentar.';
      case 'language-not-supported':
        return 'El idioma elegido no está disponible para el reconocimiento. Cambialo en Ajustes (⚙).';
      case 'network':
        return 'No hay conexión: el reconocimiento de voz de Safari necesita internet.';
      case 'audio-capture':
        return 'No se encontró un micrófono disponible. Cerrá otras apps que lo estén usando.';
      case 'no-speech':
        return 'No escuché nada. Tocá “Repetir” y hablá cerca del micrófono.';
      default:
        return 'No se pudo usar el reconocimiento de voz (' + code + '). Podés escribir o usar el 🎤 del teclado.';
    }
  }

  function clearVoiceTimers() { voice.timers.forEach(clearTimeout); voice.timers = []; }
  function abortRecognition() {
    clearVoiceTimers();
    if (voice.rec) { voice.cancelled = true; try { voice.rec.abort(); } catch (e) { /* ya terminó */ } voice.rec = null; }
  }

  function openVoice() {
    voice.text = ''; voice.result = null; voice.error = null;
    if (!SR || !window.isSecureContext) {
      voice.error = !window.isSecureContext
        ? 'El micrófono del navegador requiere una dirección segura (https://). Mientras tanto podés escribir o usar el 🎤 del teclado.'
        : 'Este navegador no tiene reconocimiento de voz web. Tocá el cuadro de texto y usá el 🎤 del teclado del iPhone para dictar.';
      renderVoiceReview();
      return;
    }
    if (!state.settings.micIntroSeen) { renderVoiceIntro(); return; }
    startListening();
  }

  function voiceSheet(html) {
    if ($('#sheet').hidden || !$('#sheetBody').dataset.voice) {
      openSheet('Vender por voz', html, { onClose: function () { abortRecognition(); delete $('#sheetBody').dataset.voice; } });
      $('#sheetBody').dataset.voice = '1';
    } else {
      $('#sheetBody').innerHTML = html;
    }
  }

  function renderVoiceIntro() {
    voiceSheet(
      '<div class="mic-stage"><div class="mic-orb idle">' + MIC + '</div>' +
      '<p class="mic-status">Permiso para usar el micrófono</p></div>' +
      '<div class="alert info">RAMOS IA MINI usa el reconocimiento de voz de Safari para convertir lo que decís en productos y cantidades.' +
      '<ul><li>Safari te va a pedir permiso para el <b>micrófono</b> y el <b>reconocimiento de voz</b>: tocá <b>Permitir</b>.</li>' +
      '<li>Siempre vas a ver el pedido antes de que se modifique el carrito.</li>' +
      '<li>El audio lo procesa Apple; RAMOS MINI solo guarda el texto en este dispositivo.</li></ul></div>' +
      '<button class="btn primary block" style="min-height:60px" data-action="voiceAllow">' + '🎙️ Permitir y empezar</button>' +
      '<button class="btn ghost block" style="margin-top:10px" data-action="voiceManual">Prefiero escribir o dictar con el teclado</button>');
  }

  function startListening() {
    abortRecognition();
    voice.finalText = ''; voice.interim = ''; voice.errorCode = null; voice.error = null;
    voice.cancelled = false; voice.gotStart = false;
    voiceSheet(
      '<div class="mic-stage"><div class="mic-orb listening" id="micOrb">' + MIC + '</div>' +
      '<p class="mic-status" id="micStatus">Preparando el micrófono…</p>' +
      '<p class="muted" id="micHint">Ejemplo: “Vendé dos kilos de milanesas y tres kilos de pata muslo”</p></div>' +
      '<div class="transcript" id="liveTranscript"><span class="interim">…</span></div>' +
      '<div class="btn-row"><button class="btn ghost" data-action="voiceCancel">Cancelar</button>' +
      '<button class="btn primary" data-action="voiceStop">Listo</button></div>' +
      '<button class="btn ghost block" style="margin-top:10px" data-action="voiceManual">Usar el teclado</button>');

    var rec;
    try { rec = new SR(); } catch (e) {
      voice.error = 'No se pudo iniciar el reconocimiento de voz en este navegador. Podés escribir o usar el 🎤 del teclado.';
      renderVoiceReview();
      return;
    }
    rec.lang = state.settings.voiceLang || 'es-AR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = function () {
      voice.gotStart = true;
      var s = $('#micStatus'); if (s) s.textContent = 'Escuchando… hablá ahora';
    };
    rec.onresult = function (e) {
      var fin = '', inter = '';
      for (var i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript; else inter += e.results[i][0].transcript;
      }
      voice.finalText = fin; voice.interim = inter;
      var el = $('#liveTranscript');
      if (el) el.innerHTML = esc(fin) + ' <span class="interim">' + esc(inter) + '</span>';
    };
    rec.onerror = function (e) { voice.errorCode = e.error || 'desconocido'; };
    rec.onend = function () {
      clearVoiceTimers();
      if (voice.rec !== rec) return;
      voice.rec = null;
      if (voice.cancelled) return;
      finishListening();
    };
    voice.rec = rec;
    try { rec.start(); } catch (e) {
      voice.rec = null;
      voice.error = 'No se pudo iniciar el micrófono. Probá otra vez o usá el teclado.';
      renderVoiceReview();
      return;
    }
    state.settings.micIntroSeen = true; save();
    // iOS a veces nunca dispara onstart en apps de pantalla de inicio: avisar sin cortar.
    voice.timers.push(setTimeout(function () {
      if (!voice.gotStart && voice.rec === rec) {
        var h = $('#micHint');
        if (h) h.innerHTML = '¿No aparece el pedido de permiso ni empieza a escuchar? ' + (isStandalone() ? 'iOS puede bloquear la voz en la app de inicio: abrí la dirección en Safari o ' : '') + 'tocá <b>Usar el teclado</b>.';
      }
    }, 6000));
    // Corte de seguridad: iOS a veces no detecta el final de la frase.
    voice.timers.push(setTimeout(function () { if (voice.rec === rec) { try { rec.stop(); } catch (e) { /* ya terminó */ } } }, 15000));
  }

  function finishListening() {
    var text = (voice.finalText + ' ' + voice.interim).trim();
    voice.text = text;
    if (!text) {
      if (voice.errorCode === 'aborted') return;
      voice.error = voiceErrorMessage(voice.errorCode || 'no-speech');
      voice.result = null;
    } else {
      voice.error = null;
      interpret(text);
    }
    renderVoiceReview();
  }

  function interpret(text) {
    voice.text = text;
    voice.result = window.RamosParser.parse(text, state.products, { cart: state.cart, lastProductId: state.lastVoiceProductId });
  }

  function renderVoiceReview() {
    var canMic = !!SR && window.isSecureContext;
    voiceSheet(
      (voice.error ? '<div class="alert red">' + esc(voice.error) + '</div>' : '') +
      '<label class="field"><span>' + (voice.text ? 'Texto reconocido (podés corregirlo)' : 'Escribí el pedido o dictalo con el 🎤 del teclado') + '</span>' +
      '<textarea id="voiceText" rows="2" placeholder="Ej: dos kilos de milanesas y tres kilos de pata muslo" enterkeyhint="done">' + esc(voice.text) + '</textarea></label>' +
      '<button class="btn navy block" data-action="voiceInterpret">Interpretar texto</button>' +
      '<div id="voicePreview"></div>' +
      '<div class="btn-row">' +
        (canMic ? '<button class="btn ghost" data-action="voiceRetry">🎙️ Repetir</button>' : '') +
        '<button class="btn ok" id="voiceConfirm" data-action="voiceConfirm" disabled>Confirmar</button>' +
      '</div>');
    renderVoicePreview();
  }

  function actionError(a) {
    if (a.type === 'clear') return null;
    var p = productById(a.productId);
    if (!p) return 'Elegí un producto';
    if (a.qty == null) return a.type === 'remove' ? null : 'Falta la cantidad';
    if (!(a.qty > 0)) return 'Cantidad inválida';
    if (p.unit === 'unidad' && Math.round(a.qty) !== a.qty) return 'La cantidad debe ser un número entero';
    if (a.type === 'remove' && !cartLine(p.id)) return p.name + ' no está en el carrito';
    return null;
  }

  function renderVoicePreview() {
    var box = $('#voicePreview');
    if (!box) return;
    var r = voice.result;
    var html = '';
    if (r) {
      if (!r.actions.length) {
        html += '<div class="alert warn" style="margin-top:12px"><b>No entendí la orden.</b> Repetila nombrando producto y cantidad, por ejemplo: “dos kilos de milanesas”.</div>';
      } else {
        html += '<h3 class="section-title">Vista previa del pedido</h3>';
        html += r.actions.map(function (a, i) {
          var kinds = { add: 'Agregar', remove: 'Quitar', set: 'Cambiar a', clear: 'Vaciar carrito' };
          if (a.type === 'clear') {
            return '<div class="preview-line clear"><div class="preview-top"><span class="kind clear">Vaciar carrito</span><span class="heard">“' + esc(a.raw) + '”</span>' +
              '<button class="del-btn" data-action="previewDel" data-i="' + i + '" aria-label="Descartar">✕</button></div>' +
              '<div class="preview-msg note">Se quitarán todos los productos de la venta actual.</div></div>';
          }
          var p = productById(a.productId);
          var sub = p && a.qty ? money(a.qty * p.price) : '';
          var subLabel = a.type === 'add' ? '+ ' + sub : a.type === 'set' ? 'Nuevo subtotal ' + sub : (a.qty == null ? 'Se quita todo' : '− ' + sub);
          return '<div class="preview-line ' + a.type + (a.error ? ' has-error' : '') + '">' +
            '<div class="preview-top"><span class="kind ' + a.type + '">' + kinds[a.type] + '</span><span class="heard">“' + esc(a.raw) + '”</span></div>' +
            '<div class="preview-edit">' +
              '<select data-input="previewProduct" data-i="' + i + '" aria-label="Producto">' + state.products.map(function (x) {
                return '<option value="' + esc(x.id) + '"' + (x.id === a.productId ? ' selected' : '') + '>' + esc(x.name) + '</option>';
              }).join('') + '</select>' +
              '<input inputmode="decimal" data-input="previewQty" data-i="' + i + '" value="' + esc(inputQty(a.qty)) + '" placeholder="' + (a.type === 'remove' ? 'todo' : '¿?') + '" aria-label="Cantidad">' +
              '<span class="unit-label">' + esc(p ? unitOf(p).many : '') + '</span>' +
              '<button class="del-btn" data-action="previewDel" data-i="' + i + '" aria-label="Descartar">✕</button>' +
            '</div>' +
            (a.error ? '<div class="preview-msg error">' + esc(a.error) + '</div>' : (a.note ? '<div class="preview-msg note">' + esc(a.note) + '</div>' : '')) +
            (sub && !a.error ? '<div class="preview-sub">' + subLabel + '</div>' : '') +
            '</div>';
        }).join('');
      }
      if (r.issues.length) {
        html += '<div class="alert warn" style="margin-top:10px"><b>No entendí esta parte:</b><ul>' + r.issues.map(function (it) {
          return '<li>' + esc(it.message) + (it.raw ? ': “' + esc(it.raw) + '”' : '') + '</li>';
        }).join('') + '</ul>Repetila o corregí el texto.</div>';
      }
    }
    if (!voice.text) {
      html += '<h3 class="section-title">Ejemplos (tocá para cargar el texto)</h3><div class="quick">' + VOICE_EXAMPLES.map(function (ex) {
        return '<button class="chip" data-action="voiceExample" data-text="' + esc(ex) + '">' + esc(ex) + '</button>';
      }).join('') + '</div>';
    }
    box.innerHTML = html;
    updateVoiceConfirm();
  }

  function updateVoiceConfirm() {
    var btn = $('#voiceConfirm');
    if (!btn) return;
    var r = voice.result;
    var ok = r && r.actions.length && r.actions.every(function (a) { return !a.error; });
    btn.disabled = !ok;
    btn.textContent = r && r.actions.some(function (a) { return a.error; }) ? 'Corregí lo marcado' : 'Confirmar';
  }

  function applyVoice() {
    var r = voice.result;
    if (!r || !r.actions.length || r.actions.some(function (a) { return a.error; })) return;
    r.actions.forEach(function (a) {
      if (a.type === 'clear') { state.cart = []; return; }
      var line = cartLine(a.productId);
      if (a.type === 'add') addToCart(a.productId, a.qty);
      else if (a.type === 'set') setCartQty(a.productId, a.qty);
      else if (a.type === 'remove') setCartQty(a.productId, a.qty == null || !line ? 0 : round3(line.qty - a.qty));
      state.lastVoiceProductId = a.productId;
    });
    closeSheet();
    commit();
    if (ui.tab !== 'vender') setTab('vender');
    toast('Carrito actualizado por voz ✓');
  }

  // ---------------------------------------------------------------- Eventos
  var actions = {
    category: function (el) { ui.category = el.dataset.cat; renderVender(); },
    qtySheet: function (el) { openQtySheet(el.dataset.id); },
    quickAdd: function (el, e) {
      e.stopPropagation();
      var p = productById(el.dataset.id);
      addToCart(p.id, 1);
      commit();
      toast('+ ' + qtyStr(1, p.unit) + ' ' + p.name);
    },
    qtyStep: function (el) {
      var p = productById($('#sheetBody').dataset.productId);
      var q = parseNum($('#qtyInput').value) || 0;
      q = Math.max(0, round3(q + Number(el.dataset.step) * unitOf(p).step));
      $('#qtyInput').value = inputQty(q);
      updateQtySheet();
    },
    qtyQuick: function (el) { $('#qtyInput').value = inputQty(Number(el.dataset.q)); updateQtySheet(); },
    qtyAdd: function (el) {
      var p = productById(el.dataset.id);
      var q = parseNum($('#qtyInput').value);
      var err = validQty(p, q);
      if (err) { $('#qtyError').textContent = err; return; }
      addToCart(p.id, q);
      closeSheet();
      commit();
      toast('+ ' + qtyStr(q, p.unit) + ' ' + p.name);
    },
    inc: function (el) { var l = cartLine(el.dataset.id), p = productById(el.dataset.id); setCartQty(p.id, round3(l.qty + unitOf(p).step)); commit(); },
    dec: function (el) {
      var l = cartLine(el.dataset.id), p = productById(el.dataset.id);
      var q = round3(l.qty - unitOf(p).step);
      if (q <= 0) { actions.removeLine(el); return; }
      setCartQty(p.id, q); commit();
    },
    removeLine: function (el) {
      var p = productById(el.dataset.id);
      setCartQty(el.dataset.id, 0); commit();
      toast(p.name + ' quitado');
    },
    clearCart: function () {
      if (!state.cart.length) return;
      askConfirm({ title: '¿Limpiar la venta?', text: 'Se quitan todos los productos del carrito.', ok: 'Limpiar', danger: true }).then(function (ok) {
        if (ok) { state.cart = []; commit(); toast('Venta limpiada'); }
      });
    },
    showCart: function () {
      if (ui.tab !== 'vender') setTab('vender');
      $('#cartCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    checkout: openCheckout,
    addPay: function (el) {
      var m = el.dataset.method;
      var idx = -1;
      checkout.payments.forEach(function (p, i) { if (p.method === m) idx = i; });
      if (idx < 0) {
        var t = payTotals();
        checkout.payments.push({ method: m, amount: t.missing > 0 ? t.missing : 0 });
        idx = checkout.payments.length - 1;
        renderCheckout();
      }
      var input = document.querySelector('[data-input="payAmount"][data-i="' + idx + '"]');
      if (input) { input.focus(); input.select && input.select(); }
    },
    delPay: function (el) { checkout.payments.splice(Number(el.dataset.i), 1); renderCheckout(); },
    cashQuick: function (el) {
      var cash = checkout.payments.filter(function (p) { return p.method === 'efectivo'; })[0];
      if (!cash) return;
      if (el.dataset.v === 'exact') {
        var other = checkout.payments.reduce(function (s, p) { return p.method === 'efectivo' ? s : s + (p.amount || 0); }, 0);
        cash.amount = Math.max(0, round2(cartTotal() - other));
      } else {
        cash.amount = round2((cash.amount || 0) + Number(el.dataset.v));
      }
      renderCheckout();
    },
    confirmSale: confirmSale,
    saleDetail: function (el) { openSaleDetail(el.dataset.id); },
    voidSale: function (el) { voidSale(el.dataset.id); },
    editProduct: function (el) { openProductForm(el.dataset.id); },
    newProduct: function () { openProductForm(null); },
    deleteProduct: function (el) { deleteProduct(el.dataset.id); },
    adjustStock: function (el) { openAdjust(el.dataset.id); },
    adjustMode: function (el) {
      adjust.mode = el.dataset.mode;
      document.querySelectorAll('#adjustModes button').forEach(function (b) { b.classList.toggle('active', b === el); });
      var p = productById(adjust.id);
      $('#adjustLabel').textContent = { in: 'Cantidad que ingresa', out: 'Cantidad que sale', set: 'Stock real contado' }[adjust.mode] + ' (' + unitOf(p).many + ')';
    },
    saveAdjust: saveAdjust,
    settings: openSettings,
    saveSettings: function () {
      state.settings.branch = $('#setBranch').value.trim() || 'Sucursal';
      state.settings.voiceLang = $('#setLang').value;
      closeSheet(); commit(); toast('Ajustes guardados');
    },
    exportData: exportData,
    resetData: function () {
      askConfirm({ title: '¿Reiniciar datos de demostración?', text: 'Se borran productos, precios, stock, carrito y ventas de este dispositivo y se cargan los de ejemplo.', ok: 'Reiniciar', danger: true }).then(function (ok) {
        if (!ok) return;
        var seen = state.settings.micIntroSeen;
        state = defaultState();
        state.settings.micIntroSeen = seen;
        closeSheet(); commit(); setTab('vender'); toast('Datos de demostración reiniciados');
      });
    },
    voice: openVoice,
    voiceAllow: function () { startListening(); },
    voiceManual: function () { abortRecognition(); voice.error = null; renderVoiceReview(); var t = $('#voiceText'); if (t) t.focus(); },
    voiceStop: function () { if (voice.rec) { try { voice.rec.stop(); } catch (e) { finishListening(); } } else finishListening(); },
    voiceCancel: function () { closeSheet(); },
    voiceRetry: function () { startListening(); },
    voiceInterpret: function () {
      var text = $('#voiceText').value.trim();
      voice.error = null;
      if (!text) { voice.result = null; voice.text = ''; renderVoiceReview(); return; }
      interpret(text);
      renderVoiceReview();
    },
    voiceExample: function (el) { $('#voiceText').value = el.dataset.text; actions.voiceInterpret(); },
    voiceConfirm: applyVoice,
    previewDel: function (el) { voice.result.actions.splice(Number(el.dataset.i), 1); renderVoicePreview(); },
    closeSheet: closeSheet
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    var fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('#confirmLayer').hidden) $('#confirmCancel').click(); else closeSheet();
    }
    if (e.key === 'Enter' && e.target.matches && e.target.matches('.product[role=button]')) e.target.click();
    if (e.key === 'Enter' && e.target.id === 'voiceText' && !e.shiftKey) { e.preventDefault(); actions.voiceInterpret(); }
    if (e.key === 'Enter' && e.target.id === 'qtyInput') { var b = $('[data-action="qtyAdd"]'); if (b) b.click(); }
  });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.id === 'search') { ui.query = el.value; renderVender(); return; }
    if (el.id === 'qtyInput') { updateQtySheet(); return; }
    var kind = el.dataset && el.dataset.input;
    if (kind === 'payAmount' && checkout) {
      checkout.payments[Number(el.dataset.i)].amount = parseNum(el.value) || 0;
      updatePaySummary();
    } else if (kind === 'previewQty' && voice.result) {
      var a = voice.result.actions[Number(el.dataset.i)];
      a.qty = parseNum(el.value);
      a.error = actionError(a); a.note = null;
      updateVoiceConfirm();
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, kind = el.dataset && el.dataset.input;
    if (kind === 'cartQty') {
      var p = productById(el.dataset.id), q = parseNum(el.value);
      var err = q === 0 ? null : validQty(p, q);
      if (err) { toast(err, 'error'); renderVender(); return; }
      setCartQty(p.id, q || 0); commit();
    } else if (kind === 'previewProduct' && voice.result) {
      var a = voice.result.actions[Number(el.dataset.i)];
      a.productId = el.value; a.error = actionError(a); a.note = null;
      renderVoicePreview();
    } else if (kind === 'previewQty' && voice.result) {
      renderVoicePreview();
    }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'productForm') { e.preventDefault(); submitProduct(e.target); }
  });

  document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { setTab(t.dataset.tab); }); });
  $('#btnVoice').addEventListener('click', openVoice);
  $('#btnCart').addEventListener('click', actions.showCart);
  $('#btnClear').addEventListener('click', actions.clearCart);
  $('#btnCheckout').addEventListener('click', openCheckout);
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnNewProduct').addEventListener('click', actions.newProduct);
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheetBackdrop').addEventListener('click', closeSheet);

  // ---------------------------------------------------------------- Inicio
  tickClock();
  setInterval(tickClock, 15000);
  renderAll();
  window.addEventListener('storage', function (e) { if (e.key === STORAGE_KEY) { state = load(); renderAll(); } });

  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo offline */ });
  }
})();
