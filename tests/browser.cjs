// Optional integration checks: requires Playwright and an HTTP server at BASE_URL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'placa-tests-'));
  const url = process.env.BASE_URL || 'http://127.0.0.1:8000';
  const key = 'placa.vendas.v1';
  const text = async selector => (await page.locator(selector).textContent()).replaceAll('\u00a0', ' ');
  const rows = () => page.locator('#sales-body tr').count();
  const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  async function chooseMonth(month) { await page.locator('#month-filter').fill(month); await page.locator('#month-filter').dispatchEvent('change'); }
  async function add(customer, quantity, amount, payment, date) {
    await page.locator('#new-sale').click();
    await page.locator('#customer').fill(customer);
    await page.locator('#quantity').fill(String(quantity));
    await page.locator('#amount').fill(amount);
    await page.locator('#payment').selectOption(payment);
    await page.locator('#sale-date').fill(date);
    await page.locator('#save-sale').click();
    assert.equal(await page.locator('#sale-dialog').evaluate(el => el.open), false);
  }
  async function importData(data) {
    await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) });
  }
  async function addPurchase(quantity, cost, date) {
    await page.locator('#new-purchase').click();
    await page.locator('#purchase-quantity').fill(String(quantity));
    await page.locator('#purchase-unit-cost').fill(cost);
    await page.locator('#purchase-date').fill(date);
    await page.locator('#save-purchase').click();
    assert.equal(await page.locator('#purchase-dialog').evaluate(el => el.open), false);
  }
  try {
    await page.goto(url);
    assert.equal(await rows(), 0);
    assert.equal(await text('#total-sold'), 'R$ 0,00');
    await page.locator('#new-sale').click();
    assert.equal(await page.locator('#sale-date').inputValue(), await page.evaluate(() => {
      const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }));
    await page.keyboard.press('Escape');
    console.log('PASS empty state, local default date and Escape');

    const existingRecords = { app: 'placa', version: 2, sales: [
      { id: 'previous-month', customer: 'Registro anterior', quantity: 1, amountCents: 9000, payment: 'paid', date: '2026-09-30' }
    ], purchases: [{ id: 'previous-purchase', quantity: 50, unitCostCents: 1300, date: '2026-09-28' }] };
    await page.evaluate(({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data));
      localStorage.removeItem('placa.visao.v1');
    }, { key, data: existingRecords });
    await page.reload();
    assert.equal(await page.locator('#month-filter').inputValue(), '2026-09');
    assert.equal(await rows(), 1);
    assert.equal(await page.locator('#purchases-body tr').count(), 1);
    const reopenedPage = await context.newPage();
    await reopenedPage.goto(url);
    assert.equal(await reopenedPage.locator('#month-filter').inputValue(), '2026-09');
    assert.equal(await reopenedPage.locator('#sales-body tr').count(), 1);
    await reopenedPage.close();
    assert.deepEqual((await stored()).sales, existingRecords.sales);
    await page.evaluate(key => { localStorage.removeItem(key); localStorage.removeItem('placa.visao.v1'); }, key);
    await page.reload();
    console.log('PASS existing records in a previous month remain visible after reload and reopening');

    await add('Café da Esquina', 2, '250,50', 'paid', '2026-10-01');
    await add('Loja Central', 3, '449.50', 'pending', '2026-10-03');
    await add('Ateliê Setembro', 1, '1.250,00', 'paid', '2026-09-30');
    assert.equal(await text('#total-sold'), 'R$ 1.250,00');
    await page.reload();
    assert.equal(await page.locator('#month-filter').inputValue(), '2026-09');
    assert.equal(await rows(), 1);
    assert.equal(await text('#total-sold'), 'R$ 1.250,00');
    await chooseMonth('2026-10');
    assert.equal(await rows(), 2);
    assert.equal(await text('#total-sold'), 'R$ 700,00');
    assert.equal(await text('#total-paid'), 'R$ 250,50');
    assert.equal(await text('#total-pending'), 'R$ 449,50');
    assert.equal(await text('#total-quantity'), '5 un.');
    assert.equal(await page.locator('.chart-day').count(), 31);
    assert.equal(await page.locator('.bar.has-value').count(), 2);
    assert.match(await page.locator('.bar.has-value').first().getAttribute('aria-label'), /250,50/);
    await page.reload();
    assert.equal(await page.locator('#month-filter').inputValue(), '2026-10');
    assert.equal(await rows(), 2);
    assert.equal((await stored()).sales.length, 3);
    console.log('PASS create, manual total, decimal formats, monthly totals/chart and persistence');

    await page.getByRole('button', { name: 'Marcar venda de Loja Central como paga' }).click();
    assert.equal(await text('#total-paid'), 'R$ 700,00');
    assert.equal(await text('#total-pending'), 'R$ 0,00');
    await page.getByRole('button', { name: 'Editar venda de Café da Esquina' }).click();
    await page.locator('#amount').fill('300,25');
    await page.locator('#quantity').fill('4');
    await page.locator('#payment').selectOption('pending');
    await page.locator('#save-sale').click();
    assert.equal(await text('#total-sold'), 'R$ 749,75');
    assert.equal(await text('#total-pending'), 'R$ 300,25');
    assert.equal(await text('#total-quantity'), '7 un.');
    await page.getByRole('button', { name: 'Excluir venda de Loja Central' }).click();
    await page.locator('#confirm-dialog').getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(await rows(), 2);
    await page.getByRole('button', { name: 'Excluir venda de Loja Central' }).click();
    await page.locator('#confirm-action').click();
    assert.equal(await rows(), 1);
    assert.equal(await text('#total-sold'), 'R$ 300,25');
    console.log('PASS paid action, edit, cancel/confirm deletion and recalculation');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-backup').click();
    const download = await downloadPromise;
    const backup = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(backup.sales.length, 2);
    assert.equal(backup.sales.find(sale => sale.customer === 'Café da Esquina').amountCents, 30025);
    const before = await stored();
    await importData('{invalid');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('Não foi possível ler'));
    assert.deepEqual(await stored(), before);
    await importData({ ...backup, sales: [...backup.sales, backup.sales[0]] });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('identificador repetido'));
    assert.deepEqual(await stored(), before);
    await importData({ ...backup, sales: [{ ...backup.sales[0], date: '2026-02-30' }] });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('dados inválidos'));
    assert.deepEqual(await stored(), before);
    await importData({ ...backup, sales: [] });
    await page.locator('#confirm-dialog').getByRole('button', { name: 'Cancelar' }).click();
    assert.deepEqual(await stored(), before);
    await importData({ ...backup, sales: [] });
    await page.locator('#confirm-action').click();
    assert.equal((await stored()).sales.length, 0);
    await importData(backup);
    await page.locator('#confirm-action').click();
    assert.deepEqual((await stored()).sales, backup.sales);
    console.log('PASS all-month export, invalid JSON/date/duplicate rejection, cancel/confirm replacement and round-trip');

    await add('<img src=x onerror=alert(1)>', 1, '0,10', 'paid', '2026-10-01');
    await add('Centavos', 1, '0,20', 'paid', '2026-10-01');
    assert.equal(await text('#total-paid'), 'R$ 0,30');
    assert.equal(await page.locator('#sales-body img').count(), 0);
    await page.locator('#new-sale').click();
    await page.locator('#customer').fill('Inválida');
    await page.locator('#amount').fill('-10');
    await page.locator('#save-sale').click();
    assert.equal(await page.locator('#form-error').isVisible(), true);
    await page.keyboard.press('Escape');
    await chooseMonth('2024-02');
    assert.equal(await page.locator('.chart-day').count(), 29);
    await chooseMonth('2025-02');
    assert.equal(await page.locator('.chart-day').count(), 28);
    assert.equal(await page.locator('#period-notice').isVisible(), true);
    await page.reload();
    assert.equal(await page.locator('#month-filter').inputValue(), '2025-02');
    assert.equal(await page.locator('#period-notice').isVisible(), true);
    await page.locator('#view-latest-month').click();
    assert.equal(await page.locator('#month-filter').inputValue(), '2026-10');
    assert.equal(await rows(), 3);
    await page.evaluate(() => localStorage.removeItem('placa.visao.v1'));
    await page.reload();
    assert.equal(await rows(), 3);
    await page.evaluate(() => localStorage.setItem('placa.visao.v1', 'invalid'));
    await page.reload();
    assert.equal(await rows(), 3);
    await chooseMonth('2025-02');
    await page.locator('#previous-month').click();
    assert.equal(await page.locator('#month-filter').inputValue(), '2025-01');
    await page.locator('#previous-month').click();
    assert.equal(await page.locator('#month-filter').inputValue(), '2024-12');
    console.log('PASS safe customer rendering, exact cents, invalid amount, leap years, saved month and empty-period recovery');

    await chooseMonth('2026-10');
    const otherPage = await context.newPage();
    await otherPage.goto(url);
    await page.locator('#new-sale').click();
    await otherPage.evaluate(key => {
      const data = JSON.parse(localStorage.getItem(key)); data.sales[0].customer = 'Alterada em outra aba'; localStorage.setItem(key, JSON.stringify(data));
    }, key);
    await page.waitForFunction(() => !document.querySelector('#sale-dialog').open);
    assert.match(await text('#sales-body'), /Alterada em outra aba/);
    await otherPage.close();
    const saved = await stored();
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
    await page.locator('#new-sale').click();
    await page.locator('#customer').fill('Sem espaço'); await page.locator('#amount').fill('10');
    await page.locator('#save-sale').click();
    assert.match(await text('#form-error'), /Não foi possível salvar/);
    assert.deepEqual(await stored(), saved);
    await page.reload();
    console.log('PASS cross-tab updates and write failure preserving existing data');

    await page.evaluate(key => localStorage.setItem(key, '{broken'), key);
    await page.reload();
    assert.equal(await page.locator('#storage-error').isVisible(), true);
    assert.equal(await page.locator('#new-sale').isDisabled(), true);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{broken');
    await importData(backup); await page.locator('#confirm-action').click();
    assert.equal(await page.locator('#storage-error').isVisible(), false);
    assert.equal(await page.locator('#new-sale').isEnabled(), true);
    console.log('PASS corrupt storage preservation and recovery');

    // Simulate an existing installation: loading v1 must not overwrite its sales.
    const legacy = { ...backup, version: 1 }; delete legacy.purchases;
    const legacyRaw = JSON.stringify(legacy);
    await page.evaluate(({key,raw}) => localStorage.setItem(key,raw), {key,raw:legacyRaw});
    await page.reload(); await chooseMonth('2026-10');
    assert.equal(await page.evaluate(key => localStorage.getItem(key),key), legacyRaw);
    assert.deepEqual((await stored()).sales, backup.sales);
    assert.equal(await text('#total-profit'), '—');
    await addPurchase(10, '20,00', '2026-09-01');
    assert.equal((await stored()).version, 2);
    assert.deepEqual((await stored()).sales, backup.sales);
    await page.reload();
    assert.equal(await page.locator('#month-filter').inputValue(), '2026-09');
    assert.equal(await page.locator('#purchases-body tr').count(), 1);
    await chooseMonth('2026-10');
    assert.equal(await text('#average-unit-cost'), 'R$ 20,00');
    assert.equal(await text('#total-sale-cost'), 'R$ 80,00');
    assert.equal(await text('#total-profit'), 'R$ 220,25');
    assert.equal(await page.locator('#purchases-body tr').count(), 0);
    await addPurchase(10, '30,00', '2026-10-01');
    assert.equal(await text('#purchased-quantity'), '10 un.');
    assert.equal(await text('#purchased-total'), 'R$ 300,00');
    assert.equal(await text('#average-unit-cost'), 'R$ 25,00');
    assert.equal(await text('#total-sale-cost'), 'R$ 100,00');
    assert.equal(await text('#total-profit'), 'R$ 200,25');
    await addPurchase(10, '100,00', '2026-11-01');
    await chooseMonth('2026-10');
    assert.equal(await text('#average-unit-cost'), 'R$ 25,00');
    assert.equal(await text('#total-profit'), 'R$ 200,25');
    await page.getByRole('button', { name: 'Editar compra de 01/10/2026, 10 plaquinhas' }).click();
    await page.locator('#purchase-unit-cost').fill('40,00');
    assert.equal(await text('#purchase-total-preview'), 'R$ 400,00');
    await page.locator('#save-purchase').click();
    assert.equal(await text('#average-unit-cost'), 'R$ 30,00');
    assert.equal(await text('#total-profit'), 'R$ 180,25');
    await chooseMonth('2026-09');
    await page.getByRole('button', { name: 'Excluir compra de 01/09/2026, 10 plaquinhas' }).click();
    await page.locator('#confirm-dialog').getByRole('button', { name: 'Cancelar' }).click();
    assert.equal((await stored()).purchases.length, 3);
    await page.getByRole('button', { name: 'Excluir compra de 01/09/2026, 10 plaquinhas' }).click();
    await page.locator('#confirm-action').click();
    await chooseMonth('2026-10');
    assert.equal(await text('#total-profit'), 'R$ 140,25');
    await page.reload(); await chooseMonth('2026-10');
    assert.equal(await text('#total-profit'), 'R$ 140,25');
    console.log('PASS legacy migration, purchases, weighted cost, prior/future months, profit, edit/delete and persistence');

    const fullDownloadPromise = page.waitForEvent('download');
    await page.locator('#export-backup').click();
    const fullDownload = await fullDownloadPromise;
    const fullBackup = JSON.parse(await fs.readFile(await fullDownload.path(), 'utf8'));
    assert.equal(fullBackup.version, 2);
    assert.equal(fullBackup.purchases.length, 2);
    assert.deepEqual(fullBackup.sales, backup.sales);
    const beforeInvalid = await stored();
    await importData({ ...fullBackup, purchases: [{ ...fullBackup.purchases[0], unitCostCents: -1 }] });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('A compra 1 contém dados inválidos'));
    assert.deepEqual(await stored(), beforeInvalid);
    await importData({ ...fullBackup, purchases: [...fullBackup.purchases, fullBackup.purchases[0]] });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('identificador repetido'));
    assert.deepEqual(await stored(), beforeInvalid);
    await importData(legacy);
    assert.match(await text('#confirm-description'), /compras atuais serão removidas/);
    await page.locator('#confirm-dialog').getByRole('button', { name: 'Cancelar' }).click();
    assert.deepEqual(await stored(), beforeInvalid);
    await importData(legacy); await page.locator('#confirm-action').click();
    assert.equal((await stored()).purchases.length, 0);
    assert.equal(await text('#total-profit'), '—');
    await importData(fullBackup); await page.locator('#confirm-action').click();
    assert.deepEqual((await stored()).purchases, fullBackup.purchases);
    await chooseMonth('2026-10');
    assert.equal(await text('#total-profit'), 'R$ 140,25');
    await page.locator('#new-purchase').click();
    await page.locator('#purchase-unit-cost').fill('-1');
    await page.locator('#save-purchase').click();
    assert.equal(await page.locator('#purchase-form-error').isVisible(), true);
    assert.deepEqual((await stored()).purchases, fullBackup.purchases);
    await page.keyboard.press('Escape');
    await importData({ ...fullBackup, sales: [{ id: 'loss', customer: 'Prejuízo', quantity: 1, amountCents: 100, payment: 'paid', date: '2026-10-01' }] });
    await page.locator('#confirm-action').click();
    assert.equal(await text('#total-profit'), '-R$ 39,00');
    assert.equal(await page.locator('#total-profit').evaluate(el => el.classList.contains('loss')), true);
    await chooseMonth('2026-12');
    assert.equal(await text('#total-profit'), 'R$ 0,00');
    await importData({ ...fullBackup, sales: [{ id: 'shortfall', customer: 'Compra faltando', quantity: 100, amountCents: 10000, payment: 'pending', date: '2026-10-01' }] });
    await page.locator('#confirm-action').click();
    await chooseMonth('2026-10');
    assert.match(await text('#profit-explanation'), /mais plaquinhas vendidas/);
    console.log('PASS v2 backup round-trip, invalid purchases, legacy import warning, purchase validation, loss and missing-cost warning');

    const demo = { app: 'placa', version: 2, purchases: [{ id: 'purchase-demo', quantity: 30, unitCostCents: 2500, date: '2026-09-20' }, { id: 'purchase-demo-2', quantity: 10, unitCostCents: 3000, date: '2026-10-01' }], sales: [
      { id: 'demo1', customer: 'Café da Esquina', quantity: 3, amountCents: 39000, payment: 'paid', date: '2026-10-02' },
      { id: 'demo2', customer: 'Studio Forma', quantity: 2, amountCents: 28000, payment: 'pending', date: '2026-10-05' },
      { id: 'demo3', customer: 'Padaria São Bento', quantity: 4, amountCents: 52000, payment: 'paid', date: '2026-10-08' },
      { id: 'demo4', customer: 'Casa Botânica', quantity: 1, amountCents: 15000, payment: 'paid', date: '2026-10-12' },
      { id: 'demo5', customer: 'Barbearia Central', quantity: 2, amountCents: 28000, payment: 'pending', date: '2026-10-16' }
    ] };
    await importData(demo); await page.locator('#confirm-action').click();
    await chooseMonth('2026-10');
    await page.locator('#toast').evaluate(el => el.hidden = true);
    await page.screenshot({ path: path.join(artifacts, 'desktop.png'), fullPage: true });
    await page.locator('#new-sale').click();
    await page.screenshot({ path: path.join(artifacts, 'form.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.locator('#new-purchase').click();
    await page.screenshot({ path: path.join(artifacts, 'purchase-form.png') });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: true });
    await page.locator('#new-sale').click();
    assert.equal(await page.locator('#save-sale').isVisible(), true);
    await page.screenshot({ path: path.join(artifacts, 'mobile-form.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`PASS responsive layout, dialogs and no browser errors\nScreenshots: ${artifacts}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
