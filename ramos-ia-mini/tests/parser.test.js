// Pruebas del intérprete de voz: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../js/parser.js');
const products = require('../js/demo-data.js');

const MILA = 'p-milanesas', PATA = 'p-pata-muslo', HUEVOS = 'p-huevos', POLLO = 'p-pollo-entero', HAMB = 'p-hamburguesas';
const simple = (r) => r.actions.map((a) => [a.type, a.productId, a.qty, a.error]);

test('dos kilos de milanesas y tres kilos de pata muslo', () => {
  const r = parse('Vendé dos kilos de milanesas y tres kilos de pata muslo', products);
  assert.deepEqual(simple(r), [['add', MILA, 2, null], ['add', PATA, 3, null]]);
  assert.equal(r.issues.length, 0);
});

test('un kilo y medio de milanesas', () => {
  assert.deepEqual(simple(parse('Un kilo y medio de milanesas', products)), [['add', MILA, 1.5, null]]);
});

test('variantes de cantidades', () => {
  const cases = [
    ['kilo y medio de milanesas', 1.5],
    ['medio kilo de milanesas', 0.5],
    ['1,5 kg de milanesas', 1.5],
    ['1.5 kilos de milanesas', 1.5],
    ['dos y medio kilos de milanesas', 2.5],
    ['un kilo doscientos de milanesas', 1.2],
    ['500 gramos de milanesas', 0.5],
    ['trescientos cincuenta gramos de milanesas', 0.35],
    ['tres cuartos kilo de milanesas', 0.75],
    ['milanesas dos kilos', 2]
  ];
  for (const [text, qty] of cases) {
    assert.deepEqual(simple(parse(text, products)), [['add', MILA, qty, null]], text);
  }
});

test('dos maples de huevos', () => {
  assert.deepEqual(simple(parse('Dos maples de huevos', products)), [['add', HUEVOS, 2, null]]);
});

test('agregá tres kilos de pollo -> pollo entero', () => {
  assert.deepEqual(simple(parse('Agregá tres kilos de pollo', products)), [['add', POLLO, 3, null]]);
});

test('milanesas de pollo no se confunde con pollo entero', () => {
  assert.deepEqual(simple(parse('dos kilos de milanesas de pollo y un kilo de pollo', products)),
    [['add', MILA, 2, null], ['add', POLLO, 1, null]]);
});

test('sacá un kilo de milanesas', () => {
  const cart = [{ productId: MILA, qty: 2 }];
  assert.deepEqual(simple(parse('Sacá un kilo de milanesas', products, { cart })), [['remove', MILA, 1, null]]);
});

test('sacá algo que no está en el carrito da error', () => {
  const r = parse('Sacá un kilo de milanesas', products, { cart: [] });
  assert.match(r.actions[0].error, /no está en el carrito/);
});

test('cambiá los dos kilos por tres', () => {
  const cart = [{ productId: MILA, qty: 2 }, { productId: PATA, qty: 3 }];
  const r = parse('Cambiá los dos kilos por tres', products, { cart });
  assert.deepEqual(simple(r), [['set', MILA, 3, null]]);
  assert.equal(r.actions[0].oldQty, 2);
});

test('cambiá ambiguo pide aclarar', () => {
  const cart = [{ productId: MILA, qty: 2 }, { productId: PATA, qty: 2 }];
  const r = parse('Cambiá los dos kilos por tres', products, { cart });
  assert.equal(r.actions.length, 0);
  assert.equal(r.issues.length, 1);
});

test('cambiá las milanesas a cuatro kilos', () => {
  const cart = [{ productId: MILA, qty: 2 }];
  assert.deepEqual(simple(parse('cambiá las milanesas a cuatro kilos', products, { cart })), [['set', MILA, 4, null]]);
});

test('mezcla de verbos en una frase', () => {
  const cart = [{ productId: PATA, qty: 3 }];
  assert.deepEqual(simple(parse('agregá dos kilos de milanesas y sacá un kilo de pata muslo', products, { cart })),
    [['add', MILA, 2, null], ['remove', PATA, 1, null]]);
});

test('nunca inventa cantidades', () => {
  const r = parse('agregá milanesas', products);
  assert.equal(r.actions[0].qty, null);
  assert.equal(r.actions[0].error, 'Falta la cantidad');
});

test('nunca inventa productos', () => {
  const r = parse('dos kilos de carne picada', products);
  assert.equal(r.actions.length, 0);
  assert.equal(r.issues.length, 1);
});

test('producto desconocido junto a uno conocido', () => {
  const r = parse('dos kilos de carne y tres kilos de milanesas', products);
  assert.deepEqual(simple(r), [['add', MILA, 3, null]]);
  assert.equal(r.issues.length, 1);
  assert.match(r.issues[0].raw, /carne/);
});

test('unidad que no corresponde da error', () => {
  const r = parse('dos kilos de huevos', products);
  assert.match(r.actions[0].error, /maple/);
});

test('unidades enteras', () => {
  assert.deepEqual(simple(parse('seis hamburguesas', products)), [['add', HAMB, 6, null]]);
  assert.ok(parse('media hamburguesa', products).actions[0].error);
});

test('vaciar el carrito', () => {
  assert.deepEqual(parse('vaciá el carrito', products).actions.map((a) => a.type), ['clear']);
  assert.deepEqual(parse('borrá todo', products).actions.map((a) => a.type), ['clear']);
});

test('texto sin sentido no genera acciones', () => {
  const r = parse('hola qué tal el clima', products);
  assert.equal(r.actions.length, 0);
  assert.equal(r.issues.length, 1);
});
