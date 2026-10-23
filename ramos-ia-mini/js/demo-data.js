/* Productos de DEMOSTRACIÓN — precios ficticios, editables desde la app. */
(function (root) {
  'use strict';
  var DEMO_PRODUCTS = [
    { id: 'p-pata-muslo', name: 'Pata muslo', category: 'Pollo', unit: 'kg', cost: 2600, price: 3900, stock: 40, minStock: 8, favorite: true,
      aliases: ['pata muslo', 'pata y muslo', 'patamuslo', 'muslo'] },
    { id: 'p-milanesas', name: 'Milanesas de pollo', category: 'Elaborados', unit: 'kg', cost: 5200, price: 7800, stock: 25, minStock: 5, favorite: true,
      aliases: ['milanesa', 'milanesas', 'milanesa de pollo', 'milanga'] },
    { id: 'p-filete', name: 'Filete', category: 'Pollo', unit: 'kg', cost: 5600, price: 8500, stock: 20, minStock: 5, favorite: true,
      aliases: ['filete', 'filet', 'filete de pollo'] },
    { id: 'p-pollo-entero', name: 'Pollo entero', category: 'Pollo', unit: 'kg', cost: 2200, price: 3400, stock: 60, minStock: 10, favorite: false,
      aliases: ['pollo entero', 'pollo'] },
    { id: 'p-alitas', name: 'Alitas', category: 'Pollo', unit: 'kg', cost: 1800, price: 2900, stock: 15, minStock: 4, favorite: false,
      aliases: ['alitas', 'alita', 'alas'] },
    { id: 'p-huevos', name: 'Huevos', category: 'Almacén', unit: 'maple', cost: 3500, price: 5200, stock: 30, minStock: 6, favorite: true,
      aliases: ['huevo', 'huevos'] },
    { id: 'p-hamburguesas', name: 'Hamburguesas de pollo', category: 'Elaborados', unit: 'unidad', cost: 600, price: 950, stock: 80, minStock: 20, favorite: false,
      aliases: ['hamburguesa', 'hamburguesas', 'hamburguesa de pollo'] }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = DEMO_PRODUCTS;
  else root.RAMOS_DEMO_PRODUCTS = DEMO_PRODUCTS;
})(this);
