// Prueba de punta a punta con Playwright (viewport iPhone).
// Uso: npx http-server -p 8080 . & node tests/e2e.js [url] [carpeta-capturas]
// El reconocimiento de voz se reemplaza SOLO en esta prueba por un falso controlado,
// para verificar el flujo de resultados y errores. La app real usa el de Safari.
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');

const URL = process.argv[2] || 'http://localhost:8080/';
const SHOTS = process.argv[3] || null;

function fakeSpeech() {
  window.__speech = { next: { text: 'Vendé dos kilos de milanesas y tres kilos de pata muslo' } };
  class FakeRec {
    start() {
      const plan = window.__speech.next;
      setTimeout(() => {
        this.onstart && this.onstart();
        if (plan.error) { this.onerror && this.onerror({ error: plan.error }); this.onend && this.onend(); return; }
        const result = [{ transcript: plan.text }]; result.isFinal = true;
        this.onresult && this.onresult({ results: [result] });
        this.onend && this.onend();
      }, 50);
    }
    stop() {}
    abort() {}
  }
  window.webkitSpeechRecognition = FakeRec;
  window.SpeechRecognition = undefined;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'es-AR' });
  await ctx.addInitScript(fakeSpeech);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); };
  const total = () => page.textContent('#cartTotal');
  const stockOf = (id) => page.evaluate((i) => JSON.parse(localStorage.getItem('ramos-ia-mini:v1')).products.find((p) => p.id === i).stock, id);
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('ramos-ia-mini:v1')));

  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.product');
  await shot('01-vender');

  // Sin scroll horizontal en pantalla chica
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'hay scroll horizontal');

  // 1. Agregar manualmente: "+" rápido en Huevos y hoja de cantidad en Filete (1,5 kg)
  await page.click('.product[data-id="p-huevos"] .add-btn');
  await page.click('.product[data-id="p-filete"]');
  await page.waitForSelector('#qtyInput');
  await page.click('[data-action="qtyQuick"][data-q="1.5"]');
  await shot('02-cantidad');
  await page.click('[data-action="qtyAdd"]');
  await page.waitForTimeout(350);
  assert.equal((await total()).replace(/\s/g, ' '), '$ 17.950'); // 5200 + 1.5*8500
  // 2. Cambiar cantidades: + en huevos -> 2 maples; escribir 2 en filete
  await page.click('[data-action="inc"][data-id="p-huevos"]');
  await page.fill('[data-input="cartQty"][data-id="p-filete"]', '2');
  await page.press('[data-input="cartQty"][data-id="p-filete"]', 'Tab');
  assert.equal((await total()).replace(/\s/g, ' '), '$ 27.400'); // 10400 + 17000
  await shot('03-carrito');

  // 3. Voz (reconocimiento falso de prueba): primera vez muestra el pedido de permiso
  await page.click('#btnVoice');
  await page.waitForSelector('[data-action="voiceAllow"]');
  await shot('04-permiso');
  await page.click('[data-action="voiceAllow"]');
  await page.waitForSelector('.preview-line');
  assert.equal(await page.inputValue('#voiceText'), 'Vendé dos kilos de milanesas y tres kilos de pata muslo');
  assert.equal(await page.locator('.preview-line').count(), 2);
  await shot('05-vista-previa');
  // El carrito NO cambia hasta confirmar
  assert.equal((await total()).replace(/\s/g, ' '), '$ 27.400');
  // Corrección manual: cambiar la cantidad de milanesas a 2,5 en la vista previa
  await page.fill('[data-input="previewQty"][data-i="0"]', '2,5');
  await page.dispatchEvent('[data-input="previewQty"][data-i="0"]', 'change');
  await page.click('#voiceConfirm');
  await page.waitForTimeout(350);
  // 27400 + 2.5*7800 + 3*3900 = 27400 + 19500 + 11700 = 58600
  assert.equal((await total()).replace(/\s/g, ' '), '$ 58.600');

  // "Cambiá los dos kilos por tres" -> filete (único con 2 kg)
  await page.evaluate(() => { window.__speech.next = { text: 'Cambiá los dos kilos por tres' }; });
  await page.click('#btnVoice');
  await page.waitForSelector('.preview-line.set');
  await page.click('#voiceConfirm');
  await page.waitForTimeout(350);
  assert.equal((await total()).replace(/\s/g, ' '), '$ 67.100'); // +8500

  // Orden no entendida -> pide repetir, Confirmar deshabilitado
  await page.evaluate(() => { window.__speech.next = { text: 'dos kilos de carne picada' }; });
  await page.click('#btnVoice');
  await page.waitForSelector('#voicePreview .alert');
  assert.ok(await page.isDisabled('#voiceConfirm'));
  await shot('06-no-entendi');
  // Corregir el texto a mano y reinterpretar: "sacá un kilo de milanesas"
  await page.fill('#voiceText', 'sacá un kilo de milanesas');
  await page.click('[data-action="voiceInterpret"]');
  await page.waitForSelector('.preview-line.remove');
  await page.click('#voiceConfirm');
  await page.waitForTimeout(350);
  assert.equal((await total()).replace(/\s/g, ' '), '$ 59.300'); // -7800

  // Error de permiso -> mensaje claro
  await page.evaluate(() => { window.__speech.next = { error: 'not-allowed' }; });
  await page.click('#btnVoice');
  await page.waitForSelector('.sheet-body .alert.red');
  assert.match(await page.textContent('.sheet-body .alert.red'), /permiso/);
  await page.click('#sheetClose');
  await page.waitForTimeout(350);

  // 4. Cobrar dividido: transferencia 20.000 + efectivo 50.000 -> vuelto 10.700
  await page.click('#btnCheckout');
  await page.waitForSelector('[data-action="addPay"]');
  await page.click('[data-action="addPay"][data-method="transferencia"]');
  await page.fill('[data-input="payAmount"][data-i="0"]', '20000');
  await page.click('[data-action="addPay"][data-method="efectivo"]');
  await page.fill('[data-input="payAmount"][data-i="1"]', '50000');
  assert.match(await page.textContent('#paySummary'), /Vuelto\s*\$\s*10\.700/);
  await shot('07-cobro');
  const stockBefore = await stockOf('p-milanesas');
  await page.click('#btnConfirmSale');
  await page.waitForSelector('.success');
  await shot('08-venta-ok');
  let s = await store();
  assert.equal(s.sales.length, 1);
  assert.equal(s.sales[0].total, 59300);
  assert.equal(s.sales[0].change, 10700);
  assert.equal(s.cart.length, 0);
  assert.equal(await stockOf('p-milanesas'), stockBefore - 1.5);
  await page.click('[data-action="closeSheet"]');
  await page.waitForTimeout(350);

  // Pago insuficiente no permite confirmar; tarjeta mayor al total da error
  await page.click('.product[data-id="p-alitas"] .add-btn');
  await page.click('#btnCheckout');
  await page.click('[data-action="addPay"][data-method="tarjeta"]');
  await page.fill('[data-input="payAmount"][data-i="0"]', '1000');
  assert.ok(await page.isDisabled('#btnConfirmSale'));
  await page.fill('[data-input="payAmount"][data-i="0"]', '5000');
  assert.ok(await page.isDisabled('#btnConfirmSale'));
  await page.fill('[data-input="payAmount"][data-i="0"]', '2900');
  await page.click('#btnConfirmSale');
  await page.waitForSelector('.success');
  await page.click('[data-action="closeSheet"]');
  await page.waitForTimeout(350);

  // 5. Ventas
  await page.click('.tab[data-tab="ventas"]');
  await page.waitForSelector('#salesList .row');
  assert.equal(await page.locator('#salesList .row').count(), 2);
  await shot('09-ventas');

  // 6. Modificar precio y unidad de un producto
  await page.click('.tab[data-tab="productos"]');
  await page.click('[data-action="editProduct"][data-id="p-alitas"]');
  await page.fill('#productForm [name="price"]', '3100');
  await page.fill('#productForm [name="cost"]', '2000');
  await shot('10-editar');
  await page.click('#productForm [type="submit"]');
  await page.waitForTimeout(350);
  s = await store();
  assert.equal(s.products.find((p) => p.id === 'p-alitas').price, 3100);

  // Crear y eliminar producto
  await page.click('#btnNewProduct');
  await page.fill('#productForm [name="name"]', 'Suprema');
  await page.fill('#productForm [name="price"]', '9000');
  await page.fill('#productForm [name="stock"]', '10');
  await page.fill('#productForm [name="aliases"]', 'supremas');
  await page.click('#productForm [type="submit"]');
  await page.waitForTimeout(350);
  s = await store();
  const sup = s.products.find((p) => p.name === 'Suprema');
  assert.ok(sup);
  await page.click(`[data-action="editProduct"][data-id="${sup.id}"]`);
  await page.click('[data-action="deleteProduct"]');
  await page.click('#confirmOk');
  await page.waitForTimeout(350);
  s = await store();
  assert.ok(!s.products.find((p) => p.name === 'Suprema'));

  // 7. Stock: ajuste manual y aviso de stock bajo
  await page.click('.tab[data-tab="stock"]');
  await page.click('[data-action="adjustStock"][data-id="p-alitas"]');
  await page.click('[data-action="adjustMode"][data-mode="set"]');
  await page.fill('#adjustQty', '3');
  await page.click('[data-action="saveAdjust"]');
  await page.waitForTimeout(350);
  assert.equal(await stockOf('p-alitas'), 3);
  assert.match(await page.textContent('#lowStock'), /Alitas/);
  assert.equal(await page.isHidden('#stockBadge'), false);
  await shot('11-stock');

  // 8. Ajustes y reinicio de datos
  await page.click('#btnSettings');
  await page.waitForSelector('[data-action="resetData"]');
  await shot('12-ajustes');
  await page.click('[data-action="resetData"]');
  await page.click('#confirmOk');
  await page.waitForTimeout(350);
  s = await store();
  assert.equal(s.sales.length, 0);
  assert.equal(s.products.find((p) => p.id === 'p-alitas').stock, 15);

  // Pantalla muy chica (iPhone SE 1ª gen, 320px)
  await page.setViewportSize({ width: 320, height: 568 });
  await page.click('.tab[data-tab="vender"]');
  await page.click('.product[data-id="p-huevos"] .add-btn');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'scroll horizontal en 320px');
  await shot('13-pantalla-chica');

  assert.deepEqual(errors, [], 'errores en consola');
  await browser.close();
  console.log('E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
