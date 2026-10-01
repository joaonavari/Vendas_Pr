(() => {
  'use strict';

  const STORAGE_KEY = 'placa.vendas.v1';
  const VIEW_KEY = 'placa.visao.v1';
  const MAX_AMOUNT = 999999999;
  const $ = (selector) => document.querySelector(selector);
  const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const integer = (value) => value.toLocaleString('pt-BR');
  const localDate = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const dateLabel = (date) => date.split('-').reverse().join('/');
  const monthLabel = (month) => new Date(`${month}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  let sales = [];
  let purchases = [];
  let lastRaw = null;
  let storageHealthy = true;
  let editingId = null;
  let editingPurchaseId = null;
  let pendingConfirmation = null;
  let toastTimer;

  function validDate(value) {
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value < '0001-01-01') return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function parseAmount(value) {
    let clean = value.trim();
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(clean)) clean = clean.replaceAll('.', '');
    if (!/^\d+([,.]\d{1,2})?$/.test(clean)) return null;
    const [whole, fraction = ''] = clean.replace(',', '.').split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_AMOUNT ? cents : null;
  }

  function validateBackup(data) {
    if (!data || data.app !== 'placa' || ![1, 2].includes(data.version) || !Array.isArray(data.sales)
      || (data.version === 2 && !Array.isArray(data.purchases))) {
      throw new Error('Este arquivo não é um backup válido do Placa (versões 1 ou 2).');
    }
    if (data.sales.length > 100000) throw new Error('O arquivo excede o limite de 100.000 vendas.');
    const ids = new Set();
    const validSales = data.sales.map((sale, index) => {
      if (!sale || typeof sale.id !== 'string' || !sale.id.trim() || sale.id.length > 100 || ids.has(sale.id)
        || typeof sale.customer !== 'string' || !sale.customer.trim() || sale.customer.trim().length > 120
        || !Number.isSafeInteger(sale.quantity) || sale.quantity < 1 || sale.quantity > 1000000
        || !Number.isSafeInteger(sale.amountCents) || sale.amountCents < 1 || sale.amountCents > MAX_AMOUNT
        || !['paid', 'pending'].includes(sale.payment) || !validDate(sale.date)) {
        throw new Error(`A venda ${index + 1} contém dados inválidos ou um identificador repetido. Nenhum dado foi substituído.`);
      }
      ids.add(sale.id);
      return { id: sale.id, customer: sale.customer.trim(), quantity: sale.quantity, amountCents: sale.amountCents, payment: sale.payment, date: sale.date };
    });
    const purchaseData = data.version === 1 ? [] : data.purchases;
    if (purchaseData.length > 100000) throw new Error('O arquivo excede o limite de 100.000 compras.');
    const purchaseIds = new Set();
    const validPurchases = purchaseData.map((purchase, index) => {
      if (!purchase || typeof purchase.id !== 'string' || !purchase.id.trim() || purchase.id.length > 100 || purchaseIds.has(purchase.id)
        || !Number.isSafeInteger(purchase.quantity) || purchase.quantity < 1 || purchase.quantity > 1000000
        || !Number.isSafeInteger(purchase.unitCostCents) || purchase.unitCostCents < 1
        || !Number.isSafeInteger(purchase.quantity * purchase.unitCostCents) || purchase.quantity * purchase.unitCostCents > MAX_AMOUNT
        || !validDate(purchase.date)) {
        throw new Error(`A compra ${index + 1} contém dados inválidos ou um identificador repetido. Nenhum dado foi substituído.`);
      }
      purchaseIds.add(purchase.id);
      return { id: purchase.id, quantity: purchase.quantity, unitCostCents: purchase.unitCostCents, date: purchase.date };
    });
    return { sales: validSales, purchases: validPurchases };
  }

  const envelope = (records, purchaseRecords = purchases) => ({ app: 'placa', version: 2, exportedAt: new Date().toISOString(), sales: records, purchases: purchaseRecords });

  function latestRecordMonth() {
    return [...sales, ...purchases].reduce((latest, record) => record.date.slice(0, 7) > latest ? record.date.slice(0, 7) : latest, '');
  }

  function initialMonth() {
    try {
      const savedMonth = localStorage.getItem(VIEW_KEY);
      if (typeof savedMonth === 'string' && /^[0-9]{4}-[0-9]{2}$/.test(savedMonth) && validDate(`${savedMonth}-01`)) return savedMonth;
    } catch {
      // A preference must not prevent reading sales or reporting storage errors.
    }
    const currentMonth = localDate().slice(0, 7);
    const hasCurrentRecords = [...sales, ...purchases].some(record => record.date.startsWith(`${currentMonth}-`));
    return hasCurrentRecords ? currentMonth : latestRecordMonth() || currentMonth;
  }

  function rememberMonth(month) {
    try {
      if (localStorage.getItem(VIEW_KEY) !== month) localStorage.setItem(VIEW_KEY, month);
    } catch {
      // Sales still follow the normal save/error flow if preferences cannot be saved.
    }
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5500);
  }

  function load() {
    try {
      lastRaw = localStorage.getItem(STORAGE_KEY);
      const records = lastRaw === null ? { sales: [], purchases: [] } : validateBackup(JSON.parse(lastRaw));
      sales = records.sales;
      purchases = records.purchases;
      storageHealthy = true;
      $('#storage-error').hidden = true;
    } catch {
      sales = [];
      purchases = [];
      storageHealthy = false;
      $('#storage-error').textContent = 'Não foi possível ler os registros. Os dados existentes foram preservados. Exporte uma cópia para recuperação ou importe um backup válido. Se o navegador bloqueou o armazenamento, permita os dados deste site e recarregue.';
      $('#storage-error').hidden = false;
    }
    $('#new-sale').disabled = !storageHealthy;
    $('#empty-new-sale').disabled = !storageHealthy;
    $('#new-purchase').disabled = !storageHealthy;
    $('.local-badge').lastChild.textContent = storageHealthy ? 'Salvo neste navegador' : 'Armazenamento indisponível';
  }

  function persist(nextSales, allowRecovery = false, nextPurchases = purchases) {
    if (nextSales.length > 100000) throw new Error('O limite é de 100.000 vendas. Exporte um backup antes de remover registros antigos.');
    if (nextPurchases.length > 100000) throw new Error('O limite é de 100.000 compras. Exporte um backup antes de remover registros antigos.');
    if (!storageHealthy && !allowRecovery) throw new Error('O armazenamento não está disponível. Exporte seus dados e recarregue a página.');
    let currentRaw;
    try { currentRaw = localStorage.getItem(STORAGE_KEY); }
    catch { throw new Error('O navegador bloqueou o armazenamento. Permita os dados deste site para salvar.'); }
    if (currentRaw !== lastRaw) {
      load();
      render();
      $('#sale-dialog').close();
      $('#purchase-dialog').close();
      throw new Error('Os registros mudaram em outra aba. Confira os dados atualizados e tente novamente.');
    }
    const nextRaw = JSON.stringify(envelope(nextSales, nextPurchases));
    try { localStorage.setItem(STORAGE_KEY, nextRaw); }
    catch { throw new Error('Não foi possível salvar. O armazenamento pode estar cheio ou bloqueado. Exporte um backup; a alteração não foi aplicada.'); }
    lastRaw = nextRaw;
    sales = nextSales;
    purchases = nextPurchases;
    storageHealthy = true;
    $('#storage-error').hidden = true;
    $('#new-sale').disabled = false;
    $('#empty-new-sale').disabled = false;
    $('#new-purchase').disabled = false;
    $('.local-badge').lastChild.textContent = 'Salvo neste navegador';
    render();
  }

  function iconButton(icon, label, action, id, extraClass = '') {
    const button = document.createElement('button');
    button.className = `icon-button ${extraClass}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.dataset.action = action;
    button.dataset.id = id;
    // Only fixed internal icon names enter markup; customer data uses textContent.
    button.innerHTML = `<svg aria-hidden="true"><use href="#i-${icon}"/></svg>`;
    return button;
  }

  function render() {
    const month = $('#month-filter').value;
    rememberMonth(month);
    const filtered = sales.filter(sale => sale.date.startsWith(`${month}-`)).sort((a, b) => b.date.localeCompare(a.date));
    const hasMonthPurchases = purchases.some(purchase => purchase.date.startsWith(`${month}-`));
    const hasOtherRecords = sales.length > 0 || purchases.length > 0;
    $('#period-notice').hidden = filtered.length > 0 || hasMonthPurchases || !hasOtherRecords;
    $('#period-notice-text').textContent = `Nenhum registro em ${monthLabel(month)}. Seus dados continuam salvos em outros meses.`;
    const totals = filtered.reduce((sum, sale) => {
      sum.sold += sale.amountCents;
      sum[sale.payment] += sale.amountCents;
      sum.quantity += sale.quantity;
      return sum;
    }, { sold: 0, paid: 0, pending: 0, quantity: 0 });
    $('#total-sold').textContent = money(totals.sold);
    $('#total-paid').textContent = money(totals.paid);
    $('#total-pending').textContent = money(totals.pending);
    $('#total-quantity').replaceChildren(document.createTextNode(`${integer(totals.quantity)} `));
    const unit = document.createElement('small'); unit.textContent = 'un.'; $('#total-quantity').append(unit);
    $('#sales-count').textContent = filtered.length ? `${integer(filtered.length)} ${filtered.length === 1 ? 'venda no mês' : 'vendas no mês'}` : 'Nenhuma venda no mês';
    $('#list-count').textContent = integer(filtered.length);
    $('#list-period').textContent = monthLabel(month);
    $('#previous-month').disabled = month === '0001-01';
    $('#next-month').disabled = month === '9999-12';
    $('#empty-state').hidden = filtered.length > 0;
    $('#table-container').hidden = filtered.length === 0;
    const rows = document.createDocumentFragment();
    filtered.forEach(sale => {
      const row = document.createElement('tr');
      const customer = document.createElement('td');
      const name = document.createElement('span'); name.className = 'customer-name'; name.textContent = sale.customer; name.title = sale.customer; customer.append(name);
      const date = document.createElement('td'); date.textContent = dateLabel(sale.date);
      const quantity = document.createElement('td'); quantity.className = 'number'; quantity.textContent = integer(sale.quantity);
      const amount = document.createElement('td'); amount.className = 'number amount-cell'; amount.textContent = money(sale.amountCents);
      const payment = document.createElement('td');
      const badge = document.createElement('span'); badge.className = `payment-badge ${sale.payment}`; badge.textContent = sale.payment === 'paid' ? 'Pago' : 'Pendente'; payment.append(badge);
      const actions = document.createElement('td'); const buttons = document.createElement('div'); buttons.className = 'row-actions';
      if (sale.payment === 'pending') {
        const paid = document.createElement('button'); paid.className = 'paid-action'; paid.textContent = 'Marcar como paga'; paid.dataset.action = 'pay'; paid.dataset.id = sale.id; paid.setAttribute('aria-label', `Marcar venda de ${sale.customer} como paga`); buttons.append(paid);
      }
      buttons.append(iconButton('edit', `Editar venda de ${sale.customer}`, 'edit', sale.id), iconButton('trash', `Excluir venda de ${sale.customer}`, 'delete', sale.id, 'delete-action'));
      actions.append(buttons); row.append(customer, date, quantity, amount, payment, actions); rows.append(row);
    });
    $('#sales-body').replaceChildren(rows);
    renderPurchases(month);
    renderProfit(month, totals);
    renderChart(filtered, month);
  }

  function renderProfit(month, totals) {
    // A cumulative weighted average gives a simple estimate without assigning lots to sales.
    // Future purchases must never change earlier months.
    const acquired = purchases.filter(purchase => purchase.date.slice(0, 7) <= month).reduce((sum, purchase) => {
      sum.quantity += purchase.quantity;
      sum.cost += purchase.quantity * purchase.unitCostCents;
      return sum;
    }, { quantity: 0, cost: 0 });
    const averageCost = acquired.quantity ? acquired.cost / acquired.quantity : null;
    const cost = totals.quantity === 0 ? 0 : averageCost === null ? null : Math.round(totals.quantity * averageCost);
    const profit = cost === null ? null : totals.sold - cost;
    $('#average-unit-cost').textContent = averageCost === null ? '—' : money(averageCost);
    $('#total-sale-cost').textContent = cost === null ? '—' : money(cost);
    $('#total-profit').textContent = profit === null ? '—' : money(profit);
    $('#total-profit').classList.toggle('loss', profit !== null && profit < 0);
    const soldToDate = sales.reduce((sum, sale) => sale.date.slice(0, 7) <= month ? sum + sale.quantity : sum, 0);
    $('#profit-explanation').textContent = averageCost === null
      ? 'Cadastre suas compras, inclusive as anteriores, para calcular o lucro. Sem custo registrado, não estimamos o lucro das vendas.'
      : `Estimativa pelo custo médio ponderado de todas as compras até o fim do mês. Inclui vendas pendentes e considera apenas o custo das plaquinhas.${soldToDate > acquired.quantity ? ' Atenção: há mais plaquinhas vendidas do que compradas até este mês. Confira se faltam compras no cadastro.' : ''}`;
  }

  function renderPurchases(month) {
    const filtered = purchases.filter(purchase => purchase.date.startsWith(`${month}-`)).sort((a, b) => b.date.localeCompare(a.date));
    const quantity = filtered.reduce((sum, purchase) => sum + purchase.quantity, 0);
    const total = filtered.reduce((sum, purchase) => sum + purchase.quantity * purchase.unitCostCents, 0);
    $('#purchase-count').textContent = integer(filtered.length);
    $('#purchased-quantity').textContent = `${integer(quantity)} un.`;
    $('#purchased-total').textContent = money(total);
    $('#purchase-empty-state').hidden = filtered.length > 0;
    $('#purchase-table-container').hidden = filtered.length === 0;
    const rows = document.createDocumentFragment();
    filtered.forEach(purchase => {
      const row = document.createElement('tr');
      const date = document.createElement('td'); date.textContent = dateLabel(purchase.date);
      const quantity = document.createElement('td'); quantity.className = 'number'; quantity.textContent = integer(purchase.quantity);
      const unitCost = document.createElement('td'); unitCost.className = 'number'; unitCost.textContent = money(purchase.unitCostCents);
      const total = document.createElement('td'); total.className = 'number amount-cell'; total.textContent = money(purchase.quantity * purchase.unitCostCents);
      const actions = document.createElement('td'); const buttons = document.createElement('div'); buttons.className = 'row-actions';
      const label = `${dateLabel(purchase.date)}, ${integer(purchase.quantity)} plaquinhas`;
      buttons.append(iconButton('edit', `Editar compra de ${label}`, 'edit', purchase.id), iconButton('trash', `Excluir compra de ${label}`, 'delete', purchase.id, 'delete-action'));
      actions.append(buttons); row.append(date, quantity, unitCost, total, actions); rows.append(row);
    });
    $('#purchases-body').replaceChildren(rows);
  }

  function renderChart(filtered, month) {
    const date = new Date(`${month}-01T12:00:00`);
    date.setMonth(date.getMonth() + 1, 0);
    const days = date.getDate();
    const values = Array(days).fill(0);
    filtered.forEach(sale => { values[Number(sale.date.slice(-2)) - 1] += sale.amountCents; });
    const maximum = Math.max(...values);
    const rawStep = (maximum || 10000) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const step = Math.ceil(rawStep / magnitude) * magnitude;
    const ceiling = step * 4;
    const chart = $('#chart'); chart.replaceChildren();
    const grid = document.createElement('div'); grid.className = 'chart-grid'; grid.setAttribute('aria-hidden', 'true');
    for (let i = 0; i <= 4; i++) {
      const line = document.createElement('div'); line.className = 'grid-line'; line.style.bottom = `${i * 25}%`;
      const label = document.createElement('span');
      label.textContent = (step * i / 100).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
      line.append(label); grid.append(line);
    }
    const bars = document.createElement('div'); bars.className = 'chart-bars';
    values.forEach((value, index) => {
      const day = document.createElement('div'); day.className = 'chart-day';
      const bar = document.createElement('div'); bar.className = `bar ${value ? 'has-value' : 'bar-zero'}`; bar.style.height = `${value / ceiling * 100}%`;
      const description = `${String(index + 1).padStart(2, '0')}/${month.slice(-2)}: ${money(value)}`;
      bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', description);
      if (value) {
        bar.tabIndex = 0;
        const tip = document.createElement('span'); tip.className = 'bar-tip'; tip.textContent = description; tip.setAttribute('aria-hidden', 'true'); bar.append(tip);
      }
      const label = document.createElement('span'); label.className = 'day-label'; label.textContent = String(index + 1).padStart(2, '0'); label.setAttribute('aria-hidden', 'true');
      day.append(bar, label); bars.append(day);
    });
    chart.append(grid, bars);
    $('#chart-caption').textContent = maximum ? 'Valores em reais · Passe sobre uma barra ou use Tab para ver o total do dia.' : 'Valores em reais · Suas vendas aparecerão aqui assim que forem cadastradas neste mês.';
  }

  function openSale(sale = null) {
    if (!storageHealthy) return;
    editingId = sale?.id || null;
    $('#sale-form').reset();
    $('#form-error').hidden = true;
    $('#sale-dialog-title').textContent = sale ? 'Editar venda' : 'Cadastrar venda';
    $('#save-sale').textContent = sale ? 'Salvar alterações' : 'Salvar venda';
    $('#customer').value = sale?.customer || '';
    $('#quantity').value = sale?.quantity || 1;
    $('#amount').value = sale ? (sale.amountCents / 100).toFixed(2).replace('.', ',') : '';
    $('#payment').value = sale?.payment || 'paid';
    $('#sale-date').value = sale?.date || localDate();
    $('#sale-dialog').showModal();
    $('#customer').focus();
  }

  function confirmAction(title, description, label, action, danger = false) {
    $('#confirm-title').textContent = title;
    $('#confirm-description').textContent = description;
    $('#confirm-action').textContent = label;
    $('#confirm-action').className = `button ${danger ? 'danger' : 'primary'}`;
    $('#confirm-error').hidden = true;
    pendingConfirmation = action;
    $('#confirm-dialog').showModal();
  }

  function updatePurchasePreview() {
    const quantity = Number($('#purchase-quantity').value);
    const unitCost = parseAmount($('#purchase-unit-cost').value);
    const total = quantity * unitCost;
    $('#purchase-total-preview').textContent = Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 1000000 && unitCost !== null && total <= MAX_AMOUNT ? money(total) : '—';
  }

  function openPurchase(purchase = null) {
    if (!storageHealthy) return;
    editingPurchaseId = purchase?.id || null;
    $('#purchase-form').reset();
    $('#purchase-form-error').hidden = true;
    $('#purchase-dialog-title').textContent = purchase ? 'Editar compra' : 'Cadastrar compra';
    $('#save-purchase').textContent = purchase ? 'Salvar alterações' : 'Salvar compra';
    $('#purchase-quantity').value = purchase?.quantity || 1;
    $('#purchase-unit-cost').value = purchase ? (purchase.unitCostCents / 100).toFixed(2).replace('.', ',') : '';
    $('#purchase-date').value = purchase?.date || localDate();
    updatePurchasePreview();
    $('#purchase-dialog').showModal();
    $('#purchase-quantity').focus();
  }

  $('#purchase-quantity').addEventListener('input', updatePurchasePreview);
  $('#purchase-unit-cost').addEventListener('input', updatePurchasePreview);
  $('#new-purchase').addEventListener('click', () => openPurchase());
  $('#purchase-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const quantity = Number($('#purchase-quantity').value);
      const unitCostCents = parseAmount($('#purchase-unit-cost').value);
      const date = $('#purchase-date').value;
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new Error('Informe uma quantidade inteira entre 1 e 1.000.000.');
      if (unitCostCents === null) throw new Error('Informe um custo por unidade maior que zero, com até duas casas decimais. Ex.: 25,50.');
      if (quantity * unitCostCents > MAX_AMOUNT) throw new Error('O total de uma compra deve ser de até R$ 9.999.999,99.');
      if (!validDate(date)) throw new Error('Informe uma data válida.');
      if (editingPurchaseId && !purchases.some(purchase => purchase.id === editingPurchaseId)) throw new Error('Esta compra não existe mais. Feche o formulário e confira a lista.');
      const purchase = { id: editingPurchaseId || crypto.randomUUID(), quantity, unitCostCents, date };
      const next = editingPurchaseId ? purchases.map(existing => existing.id === editingPurchaseId ? purchase : existing) : [...purchases, purchase];
      const previousMonth = $('#month-filter').value;
      persist(sales, false, next);
      $('#month-filter').value = date.slice(0, 7);
      render();
      $('#purchase-dialog').close();
      toast(`${editingPurchaseId ? 'Compra atualizada' : 'Compra cadastrada'}.${previousMonth !== date.slice(0, 7) ? ` Exibindo ${monthLabel(date.slice(0, 7))}.` : ''}`);
    } catch (error) {
      $('#purchase-form-error').textContent = error.message; $('#purchase-form-error').hidden = false;
      if (!$('#purchase-dialog').open) toast(error.message);
    }
  });
  $('#purchases-body').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const purchase = purchases.find(item => item.id === button.dataset.id);
    if (!purchase) return;
    if (button.dataset.action === 'edit') openPurchase(purchase);
    if (button.dataset.action === 'delete') confirmAction('Excluir esta compra?', `A compra de ${integer(purchase.quantity)} plaquinhas em ${dateLabel(purchase.date)}, no total de ${money(purchase.quantity * purchase.unitCostCents)}, será excluída. O custo médio e o lucro serão recalculados. Esta ação não pode ser desfeita.`, 'Excluir compra', () => {
      persist(sales, false, purchases.filter(item => item.id !== purchase.id)); toast('Compra excluída.');
    }, true);
  });

  $('#sale-form').addEventListener('submit', event => {
    event.preventDefault();
    const customer = $('#customer').value.trim();
    const quantity = Number($('#quantity').value);
    const amountCents = parseAmount($('#amount').value);
    try {
      if (!customer || customer.length > 120) throw new Error('Informe o nome do cliente ou da loja.');
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new Error('Informe uma quantidade inteira entre 1 e 1.000.000.');
      if (amountCents === null) throw new Error('Informe um valor entre R$ 0,01 e R$ 9.999.999,99, com até duas casas decimais. Ex.: 250,00.');
      const date = $('#sale-date').value;
      if (!validDate(date)) throw new Error('Informe uma data válida.');
      if (editingId && !sales.some(sale => sale.id === editingId)) throw new Error('Esta venda não existe mais. Feche o formulário e confira a lista.');
      const sale = { id: editingId || crypto.randomUUID(), customer, quantity, amountCents, payment: $('#payment').value, date };
      const next = editingId ? sales.map(existing => existing.id === editingId ? sale : existing) : [...sales, sale];
      const previousMonth = $('#month-filter').value;
      persist(next);
      $('#month-filter').value = date.slice(0, 7);
      render();
      $('#sale-dialog').close();
      toast(`${editingId ? 'Venda atualizada' : 'Venda cadastrada'}.${previousMonth !== date.slice(0, 7) ? ` Exibindo ${monthLabel(date.slice(0, 7))}.` : ''}`);
    } catch (error) {
      $('#form-error').textContent = error.message; $('#form-error').hidden = false;
      if (!$('#sale-dialog').open) toast(error.message);
    }
  });

  $('#sales-body').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const sale = sales.find(item => item.id === button.dataset.id);
    if (!sale) return;
    if (button.dataset.action === 'edit') openSale(sale);
    if (button.dataset.action === 'pay') {
      try { persist(sales.map(item => item.id === sale.id ? { ...item, payment: 'paid' } : item)); toast('Pagamento confirmado.'); }
      catch (error) { toast(error.message); }
    }
    if (button.dataset.action === 'delete') confirmAction('Excluir esta venda?', `A venda de ${sale.customer}, no valor de ${money(sale.amountCents)}, será excluída. Esta ação não pode ser desfeita.`, 'Excluir venda', () => {
      persist(sales.filter(item => item.id !== sale.id)); toast('Venda excluída.');
    }, true);
  });

  $('#confirm-action').addEventListener('click', event => {
    event.preventDefault();
    try { pendingConfirmation?.(); $('#confirm-dialog').close(); }
    catch (error) { $('#confirm-error').textContent = error.message; $('#confirm-error').hidden = false; }
  });
  $('#confirm-dialog').addEventListener('close', () => { pendingConfirmation = null; });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
  $('#new-sale').addEventListener('click', () => openSale());
  $('#empty-new-sale').addEventListener('click', () => openSale());
  $('#month-filter').addEventListener('change', () => {
    if (!/^[0-9]{4}-[0-9]{2}$/.test($('#month-filter').value) || !validDate(`${$('#month-filter').value}-01`)) $('#month-filter').value = localDate().slice(0, 7);
    render();
  });
  function moveMonth(offset) {
    const date = new Date(`${$('#month-filter').value}-15T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    $('#month-filter').value = `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    render();
  }
  $('#previous-month').addEventListener('click', () => moveMonth(-1));
  $('#next-month').addEventListener('click', () => moveMonth(1));
  $('#view-latest-month').addEventListener('click', () => {
    const month = latestRecordMonth();
    if (month) { $('#month-filter').value = month; render(); }
  });

  $('#export-backup').addEventListener('click', () => {
    try {
      // Read again to avoid exporting stale data from a second tab.
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!storageHealthy && raw === null) throw new Error('Não há dados acessíveis para exportar neste navegador.');
      let content;
      let recovery = false;
      try {
        const records = raw === null ? { sales: [], purchases: [] } : validateBackup(JSON.parse(raw));
        content = JSON.stringify(envelope(records.sales, records.purchases), null, 2);
      }
      catch { content = raw; recovery = true; }
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `placa-${recovery ? 'recuperacao' : 'backup'}-${localDate()}.json`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(recovery ? 'Cópia dos dados originais exportada para recuperação.' : 'Backup exportado com vendas e compras de todos os meses.');
    } catch (error) { toast(`Não foi possível exportar. ${error.message}`); }
  });
  $('#import-backup').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Escolha um arquivo JSON de até 20 MB.');
      let data;
      try { data = JSON.parse(await file.text()); }
      catch { throw new Error('Não foi possível ler o JSON. Escolha um backup exportado pelo Placa.'); }
      const imported = validateBackup(data);
      confirmAction('Importar este backup?', `O arquivo contém ${integer(imported.sales.length)} vendas e ${integer(imported.purchases.length)} compras. A importação substituirá todas as vendas e compras deste navegador, de todos os meses${storageHealthy ? ` (${integer(sales.length)} vendas e ${integer(purchases.length)} compras atualmente)` : ''}.${data.version === 1 ? ' Este backup antigo não contém compras; as compras atuais serão removidas.' : ''} Exporte um backup antes de continuar se quiser manter uma cópia.`, 'Substituir e importar', () => {
        persist(imported.sales, true, imported.purchases);
        const importedRecords = [...imported.sales, ...imported.purchases];
        if (importedRecords.length && !importedRecords.some(record => record.date.startsWith($('#month-filter').value))) {
          $('#month-filter').value = importedRecords.reduce((latest, record) => record.date > latest ? record.date : latest, '').slice(0, 7);
          render();
        }
        toast('Backup importado. Todos os registros foram atualizados.');
      });
    } catch (error) { toast(error.message); }
  });

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const hadDialog = $('#sale-dialog').open || $('#purchase-dialog').open || $('#confirm-dialog').open;
    $('#sale-dialog').close(); $('#purchase-dialog').close(); $('#confirm-dialog').close(); load(); render();
    toast(hadDialog ? 'Dados alterados em outra aba. O formulário foi fechado; confira a lista antes de editar.' : 'Dados atualizados a partir de outra aba.');
  });
  load();
  $('#month-filter').value = initialMonth();
  render();
})();
