/*
 * RAMOS IA MINI — Intérprete de comandos de venta (limitado, sin IA).
 *
 * Convierte texto reconocido ("Vendé dos kilos de milanesas y tres kilos de pata muslo")
 * en acciones sobre el carrito. Reglas:
 *   - Solo reconoce productos existentes (por nombre o "palabras para voz").
 *   - Nunca inventa cantidades: si falta la cantidad al agregar, la acción queda con error.
 *   - Todo lo que no entiende se devuelve en `issues` para mostrarlo al usuario.
 */
(function (root) {
  'use strict';

  var NUMBER_WORDS = {
    cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
    siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
    quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
    veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23,
    veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
    veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70,
    ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200,
    trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
    quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
    setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
    novecientos: 900, novecientas: 900
  };

  var UNIT_WORDS = {
    kilo: 'kg', kilos: 'kg', kg: 'kg', kgs: 'kg', kilogramo: 'kg', kilogramos: 'kg',
    gramo: 'g', gramos: 'g', gr: 'g', grs: 'g', g: 'g',
    unidad: 'unidad', unidades: 'unidad',
    maple: 'maple', maples: 'maple',
    docena: 'docena', docenas: 'docena',
    paquete: 'paquete', paquetes: 'paquete',
    bandeja: 'bandeja', bandejas: 'bandeja'
  };

  var VERBS = {
    add: /^(vende|vendeme|vendele|vender|vendi|agrega|agregame|agregale|agregar|agregue|suma|sumame|sumale|sumar|pone|poneme|ponele|poner|pon|dame|deme|quiero|queria|carga|cargame|cargale|cargar|anota|anotame|anotale|anotar|mete|meteme|metele|anadi|anade|anadir|incorpora)$/,
    remove: /^(saca|sacame|sacale|sacar|saque|quita|quitame|quitale|quitar|quite|elimina|eliminame|eliminale|eliminar|borra|borrame|borrale|borrar|resta|restame|restale|restar|desconta|descontame|menos)$/,
    set: /^(cambia|cambiame|cambiale|cambiar|cambie|corregi|corregime|corregir|corrige|modifica|modificame|modificar|deja|dejame|dejale|dejar|reemplaza|reemplazar)$/,
    clear: /^(vacia|vaciame|vaciar|limpia|limpiame|limpiar|cancela|cancelar)$/
  };

  // Palabras ignoradas al buscar nombres de productos ("pata y muslo" = "pata muslo").
  var MATCH_STOPWORDS = { de: 1, del: 1, la: 1, las: 1, el: 1, los: 1, y: 1 };
  // Palabras de relleno que no indican nada no entendido.
  var FILLER = /^(de|del|la|las|el|los|y|e|que|me|te|le|lo|por|favor|porfa|a|al|en|con|para|mas|tambien|otro|otra|otros|otras|todo|toda|ahora|che|bueno|hola|eh|este|esto|ese|esa|carrito|venta|pedido|kilos?|unidades?|cliente|senor|senora|amigo|amiga|gracias|ok|dale|listo|nomas|hay|son|va|vamos|necesito|necesita|lleva|llevo|llevar|me|nos)$/;

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/½/g, ' 1/2 ').replace(/¼/g, ' 1/4 ').replace(/¾/g, ' 3/4 ')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2') // "1.500 gramos" -> 1500
      .replace(/(\d)([a-z])/g, '$1 $2')
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/[^a-z0-9./\s-]/g, ' ')
      .replace(/(^|\s)[.-]+|[.-]+(\s|$)/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stem(word) {
    return word.length > 3 && word.charAt(word.length - 1) === 's' ? word.slice(0, -1) : word;
  }

  function tokenize(text) {
    var norm = normalize(text);
    return norm ? norm.split(' ') : [];
  }

  function isNumberWord(w) { return Object.prototype.hasOwnProperty.call(NUMBER_WORDS, w); }

  // Lee un número a partir de tokens[i]. Devuelve {value, end} (end exclusivo) o null.
  function readNumber(tokens, i) {
    var t = tokens[i];
    if (t == null) return null;
    if (/^\d+(\.\d+)?$/.test(t)) {
      var v = parseFloat(t), end = i + 1;
      // "1 coma 5"
      if (tokens[end] === 'coma' && /^\d+$/.test(tokens[end + 1] || '')) {
        v = parseFloat(t + '.' + tokens[end + 1]);
        end += 2;
      }
      return { value: v, end: end };
    }
    var frac = /^(\d+)\/(\d+)$/.exec(t);
    if (frac && +frac[2] > 0) return { value: +frac[1] / +frac[2], end: i + 1 };
    if (!isNumberWord(t)) return null;

    var total = 0, j = i, last = null;
    while (j < tokens.length) {
      var w = tokens[j];
      if (isNumberWord(w)) {
        var n = NUMBER_WORDS[w];
        // No encadenar dos unidades ("dos tres") ni "un" después de otro número.
        if (last !== null && !(last >= 100 && n < 100) && !(last >= 20 && last % 10 === 0 && last < 100 && n < 10)) break;
        total += n; last = n; j++;
        continue;
      }
      if (w === 'y' && last !== null && last >= 20 && last < 100 && last % 10 === 0 &&
          isNumberWord(tokens[j + 1] || '') && NUMBER_WORDS[tokens[j + 1]] < 10 && NUMBER_WORDS[tokens[j + 1]] > 0) {
        j++;
        continue;
      }
      if (w === 'mil') { total = (total || 1) * 1000; last = 1000; j++; continue; }
      break;
    }
    if (tokens[j] === 'coma' && isNumberWord(tokens[j + 1] || '') && NUMBER_WORDS[tokens[j + 1]] < 10) {
      total += NUMBER_WORDS[tokens[j + 1]] / 10;
      j += 2;
    }
    return { value: total, end: j };
  }

  function readHalfQuarter(tokens, i) {
    // "y medio", "y media", "y cuarto"
    if (tokens[i] !== 'y') return null;
    var w = tokens[i + 1];
    if (w === 'medio' || w === 'media') return { value: 0.5, end: i + 2 };
    if (w === 'cuarto') return { value: 0.25, end: i + 2 };
    return null;
  }

  // Intenta leer una expresión de cantidad que empieza en tokens[i].
  // Devuelve {qty, unit, start, end} o null. unit puede ser null si no se dijo.
  function readQuantity(tokens, i) {
    var t = tokens[i];
    if (t == null) return null;
    var qty, unit = null, j;

    if (t === 'medio' || t === 'media') {
      qty = 0.5; j = i + 1;
      if (UNIT_WORDS[tokens[j]]) { unit = UNIT_WORDS[tokens[j]]; j++; }
      return { qty: qty, unit: unit, start: i, end: j };
    }

    if (UNIT_WORDS[t] && /^(kilo|unidad|maple|docena|paquete|bandeja)$/.test(t)) {
      // "kilo y medio" (sin número)
      var hq0 = readHalfQuarter(tokens, i + 1);
      if (hq0) return { qty: 1 + hq0.value, unit: UNIT_WORDS[t], start: i, end: hq0.end };
      return null;
    }

    var num = readNumber(tokens, i);
    if (!num) return null;
    qty = num.value; j = num.end;

    // "tres cuartos", "un cuarto"
    if (tokens[j] === 'cuarto' || tokens[j] === 'cuartos') {
      qty = qty * 0.25; j++;
      if (UNIT_WORDS[tokens[j]]) { unit = UNIT_WORDS[tokens[j]]; j++; }
      return { qty: qty, unit: unit, start: i, end: j };
    }

    // "dos y medio kilos"
    var hq = readHalfQuarter(tokens, j);
    if (hq) { qty += hq.value; j = hq.end; }

    if (UNIT_WORDS[tokens[j]]) { unit = UNIT_WORDS[tokens[j]]; j++; }

    if (!hq) {
      // "un kilo y medio"
      var hq2 = readHalfQuarter(tokens, j);
      if (hq2 && unit) { qty += hq2.value; j = hq2.end; }
      // "un kilo doscientos" / "1 kilo 500" -> 1,2 kg / 1,5 kg
      else if (unit === 'kg') {
        var grams = readNumber(tokens, j);
        if (grams && grams.value >= 100 && grams.value < 1000 && (!UNIT_WORDS[tokens[grams.end]] || UNIT_WORDS[tokens[grams.end]] === 'g')) {
          qty += grams.value / 1000;
          j = grams.end + (UNIT_WORDS[tokens[grams.end]] === 'g' ? 1 : 0);
        }
      }
    }
    return { qty: round3(qty), unit: unit, start: i, end: j };
  }

  function round3(n) { return Math.round(n * 1000) / 1000; }

  function findQuantities(tokens, from, to) {
    var out = [];
    for (var i = from; i < to;) {
      var q = readQuantity(tokens, i);
      if (q && q.end <= to) { out.push(q); i = q.end; } else { i++; }
    }
    return out;
  }

  // Construye índice de alias por producto.
  function buildAliasIndex(products) {
    var list = [];
    products.forEach(function (p) {
      var names = [p.name].concat(p.aliases || []);
      var seen = {};
      names.forEach(function (n) {
        var toks = tokenize(n).filter(function (w) { return !MATCH_STOPWORDS[w]; }).map(stem);
        var key = toks.join(' ');
        if (!toks.length || seen[key]) return;
        seen[key] = 1;
        list.push({ productId: p.id, tokens: toks });
      });
    });
    return list;
  }

  // Busca menciones de productos dentro de tokens[from, to).
  function findMentions(tokens, from, to, aliasIndex) {
    var filtered = [];
    for (var i = from; i < to; i++) {
      if (!MATCH_STOPWORDS[tokens[i]]) filtered.push({ w: stem(tokens[i]), i: i });
    }
    var candidates = [];
    aliasIndex.forEach(function (a) {
      for (var k = 0; k + a.tokens.length <= filtered.length; k++) {
        var ok = true;
        for (var m = 0; m < a.tokens.length; m++) {
          if (filtered[k + m].w !== a.tokens[m]) { ok = false; break; }
        }
        if (ok) {
          candidates.push({
            productId: a.productId,
            start: filtered[k].i,
            end: filtered[k + a.tokens.length - 1].i + 1,
            size: a.tokens.length
          });
        }
      }
    });
    candidates.sort(function (x, y) { return y.size - x.size || x.start - y.start; });
    var chosen = [];
    candidates.forEach(function (c) {
      var overlaps = chosen.some(function (o) { return c.start < o.end && o.start < c.end; });
      if (!overlaps) chosen.push(c);
    });
    chosen.sort(function (x, y) { return x.start - y.start; });
    return chosen;
  }

  function verbType(word) {
    for (var type in VERBS) if (VERBS[type].test(word)) return type;
    return null;
  }

  function rawText(tokens, from, to) {
    var words = tokens.slice(from, to);
    while (words.length && FILLER.test(words[words.length - 1])) words.pop();
    while (words.length && FILLER.test(words[0])) words.shift();
    return words.join(' ');
  }

  function meaningful(tokens, from, to) {
    for (var i = from; i < to; i++) {
      if (!FILLER.test(tokens[i]) && !verbType(tokens[i])) return true;
    }
    return false;
  }

  // Ajusta la cantidad a la unidad del producto. Devuelve {qty, error, note}.
  function fitUnit(qty, spokenUnit, product) {
    var unit = product.unit;
    var res = { qty: qty, error: null, note: null };
    if (qty == null || isNaN(qty)) { res.error = 'Falta la cantidad'; return res; }
    if (qty <= 0) { res.error = 'Cantidad inválida'; return res; }
    if (spokenUnit === 'g') {
      if (unit === 'kg') { res.qty = round3(qty / 1000); res.note = 'Convertido de gramos a kg'; }
      else res.error = 'Dijiste gramos pero ' + product.name + ' se vende por ' + unit;
    } else if (spokenUnit && spokenUnit !== unit) {
      res.error = 'Dijiste "' + spokenUnit + '" pero ' + product.name + ' se vende por ' + unit;
    } else if (!spokenUnit && unit === 'kg') {
      res.note = 'No se dijo la unidad: se tomó como kg';
    }
    if (!res.error && unit === 'unidad' && Math.round(res.qty) !== res.qty) {
      res.error = 'La cantidad debe ser un número entero';
    }
    return res;
  }

  function cartQty(cart, productId) {
    for (var i = 0; i < cart.length; i++) if (cart[i].productId === productId) return cart[i].qty;
    return 0;
  }

  /**
   * parse(text, products, context) -> { text, actions, issues }
   * context: { cart: [{productId, qty}], lastProductId }
   * action: { type: 'add'|'remove'|'set'|'clear', productId, qty, oldQty, error, note, raw }
   */
  function parse(text, products, context) {
    context = context || {};
    var cart = context.cart || [];
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });
    var tokens = tokenize(text);
    var aliasIndex = buildAliasIndex(products);
    var actions = [], issues = [];

    // Separar en cláusulas: cada verbo empieza una cláusula nueva.
    var clauses = [], current = { type: 'add', explicit: false, start: 0 };
    for (var i = 0; i < tokens.length; i++) {
      var vt = verbType(tokens[i]);
      if (vt) {
        current.end = i;
        clauses.push(current);
        current = { type: vt, explicit: true, start: i + 1 };
      }
    }
    current.end = tokens.length;
    clauses.push(current);

    clauses.forEach(function (cl) {
      if (cl.end <= cl.start && !cl.explicit) return;
      var mentions = findMentions(tokens, cl.start, cl.end, aliasIndex);

      if (cl.type === 'clear' || (cl.type === 'remove' && !mentions.length && tokens.slice(cl.start, cl.end).indexOf('todo') >= 0)) {
        actions.push({ type: 'clear', raw: rawText(tokens, cl.start - 1, cl.end) || 'vaciar' });
        return;
      }

      if (cl.type === 'set') { parseSet(cl, mentions); return; }

      if (!mentions.length) {
        if (meaningful(tokens, cl.start, cl.end)) {
          issues.push({ message: 'No reconocí ningún producto', raw: rawText(tokens, cl.start, cl.end) });
        } else if (cl.explicit) {
          issues.push({ message: 'Falta decir el producto', raw: rawText(tokens, cl.start - 1, cl.end) });
        }
        return;
      }

      // ¿Cantidad antes ("dos kilos de milanesas") o después ("milanesas dos kilos")?
      var first = mentions[0];
      var preFirst = findQuantities(tokens, cl.start, first.start);
      var nextStart = mentions[1] ? mentions[1].start : cl.end;
      var postFirst = findQuantities(tokens, first.end, nextStart);
      var postMode = !preFirst.length && postFirst.length && postFirst[0].start <= first.end + 1;

      mentions.forEach(function (m, k) {
        var from, to, qs, q;
        if (postMode) {
          from = m.end; to = mentions[k + 1] ? mentions[k + 1].start : cl.end;
          qs = findQuantities(tokens, from, to);
          q = qs[0];
          qs.slice(1).forEach(function (extra) {
            issues.push({ message: 'Cantidad sin producto', raw: rawText(tokens, extra.start, extra.end) });
          });
          // Texto sobrante entre menciones sin cantidad ni producto
        } else {
          from = k === 0 ? cl.start : mentions[k - 1].end; to = m.start;
          qs = findQuantities(tokens, from, to);
          q = qs[qs.length - 1];
          qs.slice(0, -1).forEach(function (extra, idx) {
            var nextQ = qs[idx + 1];
            issues.push({ message: 'No reconocí el producto', raw: rawText(tokens, extra.start, nextQ.start) });
          });
        }
        pushItem(cl.type, m.productId, q, rawText(tokens, q ? Math.min(q.start, m.start) : m.start, q ? Math.max(q.end, m.end) : m.end));
      });

      if (!postMode) {
        var last = mentions[mentions.length - 1];
        var tail = findQuantities(tokens, last.end, cl.end);
        if (tail.length) {
          issues.push({ message: 'No reconocí el producto', raw: rawText(tokens, tail[0].start, cl.end) });
        }
      }
    });

    function pushItem(type, productId, q, raw) {
      var product = byId[productId];
      var action = { type: type, productId: productId, qty: null, error: null, note: null, raw: raw };
      if (type === 'remove' && !q) {
        action.qty = null; // quitar todo
        action.note = 'Se quita el producto completo';
      } else {
        var fit = fitUnit(q ? q.qty : null, q ? q.unit : null, product);
        action.qty = fit.qty; action.error = fit.error; action.note = fit.note;
      }
      if (type === 'remove' && cartQty(cart, productId) === 0) {
        action.error = product.name + ' no está en el carrito';
      }
      actions.push(action);
    }

    function parseSet(cl, mentions) {
      var connector = -1;
      for (var c = cl.start; c < cl.end; c++) {
        if (/^(por|a|en)$/.test(tokens[c]) && findQuantities(tokens, c + 1, cl.end).length) { connector = c; break; }
      }
      var raw = rawText(tokens, cl.start - 1, cl.end);
      var oldQ = null, newQ = null;
      if (connector >= 0) {
        oldQ = findQuantities(tokens, cl.start, connector)[0] || null;
        newQ = findQuantities(tokens, connector + 1, cl.end)[0] || null;
      } else {
        var qs = findQuantities(tokens, cl.start, cl.end);
        if (qs.length >= 2) { oldQ = qs[0]; newQ = qs[1]; } else { newQ = qs[0] || null; }
      }
      if (!newQ) { issues.push({ message: 'No entendí la nueva cantidad', raw: raw }); return; }

      var productId = null;
      if (mentions.length === 1) productId = mentions[0].productId;
      else if (mentions.length > 1) { issues.push({ message: 'Nombrá un solo producto para cambiar', raw: raw }); return; }
      else {
        var candidates = cart.filter(function (line) {
          var p = byId[line.productId];
          if (!p) return false;
          if (!oldQ) return true;
          var f = fitUnit(oldQ.qty, oldQ.unit, p);
          return !f.error && Math.abs(f.qty - line.qty) < 0.0005;
        });
        if (candidates.length === 1) productId = candidates[0].productId;
        else if (candidates.length > 1 && context.lastProductId &&
                 candidates.some(function (l) { return l.productId === context.lastProductId; })) productId = context.lastProductId;
        else {
          issues.push({
            message: candidates.length ? '¿Qué producto querés cambiar? Hay varios posibles' : 'No encontré en el carrito lo que querés cambiar',
            raw: raw
          });
          return;
        }
      }
      var product = byId[productId];
      var unit = newQ.unit || (oldQ && oldQ.unit) || null;
      var fit = fitUnit(newQ.qty, unit, product);
      var action = { type: 'set', productId: productId, qty: fit.qty, oldQty: cartQty(cart, productId), error: fit.error, note: fit.note, raw: raw };
      if (!action.oldQty && !action.error) action.note = 'No estaba en el carrito: se agrega';
      actions.push(action);
    }

    return { text: text, actions: actions, issues: issues };
  }

  var api = { parse: parse, normalize: normalize, readQuantity: readQuantity, tokenize: tokenize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RamosParser = api;
})(this);
