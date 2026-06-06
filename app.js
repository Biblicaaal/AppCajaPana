(function () {
  "use strict";

  var DB_NAME = "bakery_caja_static_v1";
  var DB_VERSION = 1;
  var STORES = ["users", "sessions", "transactions", "closures", "monthlyEntries", "productionItems", "products", "baskets", "basketItems", "settings", "auditLog"];
  var PAYMENT = "Efectivo";
  var currentUser = null;
  var currentSession = null;
  var currentTab = "Caja";
  var isSubmittingSale = false;
  var saleMode = "quick";
  var basket = [];
  var calcItems = [];
  var quickButtons = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 8000, 10000];
  var monthlyCategories = ["Proveedores", "Sueldos", "Alquiler", "Servicios", "Arreglos", "Equipamiento", "Insumos", "Otro"];
  var defaultProducts = [
    ["Facturas", 500, "unidad", "Dulce"],
    ["Pan", 2000, "kg", "Panaderia"],
    ["Bizcochos", 2600, "kg", "Panaderia"],
    ["Tortas", 8500, "unidad", "Pasteleria"],
    ["Sandwiches", 1800, "unidad", "Salado"],
    ["Prepizzas", 2200, "unidad", "Salado"]
  ];

  function $(id) { return document.getElementById(id); }
  function nowIso() { return new Date().toISOString(); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function monthKey(d) { return (d || today()).slice(0, 7); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function money(n) {
    return "$ " + Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function parseMoney(v) {
    v = String(v || "").replace("$", "").replace(/\s/g, "");
    if (v.indexOf(",") >= 0 && v.indexOf(".") >= 0) v = v.replace(/\./g, "").replace(",", ".");
    else v = v.replace(",", ".");
    var n = Number(v);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  function toast(msg) {
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    $("toastHost").appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2800);
  }
  function playSound() {
    var snd = $("cashSound");
    if (!snd) return;
    try {
      snd.pause();
      snd.currentTime = 0;
      var p = snd.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        STORES.forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  var dbPromise = openDb();
  function tx(store, mode, fn) {
    return dbPromise.then(function (db) {
      return new Promise(function (resolve, reject) {
        var tr = db.transaction(store, mode);
        var os = tr.objectStore(store);
        var out = fn(os);
        tr.oncomplete = function () { resolve(out); };
        tr.onerror = function () { reject(tr.error); };
      });
    });
  }
  function add(store, record) { return tx(store, "readwrite", function (os) { os.put(record); return record; }); }
  function del(store, id) { return tx(store, "readwrite", function (os) { os.delete(id); return id; }); }
  function all(store) {
    return dbPromise.then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function audit(action, detail, severity) {
    return add("auditLog", {
      id: uid(), createdAt: nowIso(), userId: currentUser && currentUser.id,
      username: currentUser && currentUser.username, action: action, detail: detail || "",
      severity: severity || "normal"
    });
  }
  function seed() {
    return all("users").then(function (users) {
      var tasks = [];
      if (!users.length) {
        [
          ["admin", "Administrador", "admin", "2711"],
          ["dev", "Desarrollo", "dev", "2711"],
          ["turno_manana", "Turno Manana", "employee", "1234"],
          ["turno_tarde", "Turno Tarde", "employee", "1234"]
        ].forEach(function (u) {
          tasks.push(add("users", { id: uid(), username: u[0], displayName: u[1], role: u[2], password: u[3], active: true, createdAt: nowIso() }));
        });
      }
      return Promise.all(tasks);
    }).then(function () {
      return all("products").then(function (products) {
        if (products.length) return;
        return Promise.all(defaultProducts.map(function (p) {
          return add("products", { id: uid(), name: p[0], price: p[1], unitType: p[2], category: p[3], active: true, createdAt: nowIso() });
        }));
      });
    });
  }

  function login(e) {
    e.preventDefault();
    var username = $("loginUser").value.trim();
    var pass = $("loginPass").value;
    all("users").then(function (users) {
      var user = users.filter(function (u) { return u.username === username && u.password === pass && u.active; })[0];
      if (!user) { toast("Usuario o clave incorrectos"); return; }
      currentUser = user;
      currentSession = {
        id: uid(), userId: user.id, username: user.username, displayName: user.displayName,
        role: user.role, loginTime: nowIso(), openingCash: parseMoney($("openingCash").value),
        businessDate: $("loginDate").value || today(), shiftType: $("loginShift").value
      };
      add("sessions", currentSession).then(function () {
        sessionStorage.setItem("bakerySession", JSON.stringify({ user: currentUser, session: currentSession }));
        return audit("LOGIN", currentSession.shiftType + " caja inicial " + money(currentSession.openingCash));
      }).then(showApp);
    });
  }

  function showApp() {
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    $("sessionInfo").innerHTML = "Usuario: <b>" + currentUser.displayName + "</b> · Fecha: <b>" + currentSession.businessDate + "</b> · Turno: <b>" + currentSession.shiftType + "</b>";
    $("workDateInput").value = currentSession.businessDate;
    $("workShiftInput").value = currentSession.shiftType;
    $("workShiftBar").style.display = isAdmin() ? "block" : "none";
    buildTabs();
    setDates();
    renderAll();
  }
  function logout() {
    if (currentSession) {
      currentSession.logoutTime = nowIso();
      add("sessions", currentSession);
      audit("LOGOUT", currentUser.username);
    }
    sessionStorage.removeItem("bakerySession");
    location.reload();
  }
  function isAdmin() { return currentUser && (currentUser.role === "admin" || currentUser.role === "dev"); }
  function buildTabs() {
    var tabs = ["Caja", "Cierres", "Metricas", "Movimientos", "Mensual", "Produccion"];
    if (isAdmin()) tabs = tabs.concat(["Actividad", "Usuarios", "Dev"]);
    var labels = {Metricas: "Metricas", Produccion: "Produccion"};
    $("tabs").innerHTML = "";
    tabs.forEach(function (name) {
      var btn = document.createElement("button");
      btn.textContent = labels[name] || name;
      btn.className = name === currentTab ? "active" : "";
      btn.onclick = function () {
        currentTab = name;
        document.querySelectorAll(".tab-page").forEach(function (p) { p.classList.add("hidden"); });
        $("tab" + name).classList.remove("hidden");
        buildTabs();
        renderAll();
      };
      $("tabs").appendChild(btn);
    });
  }
  function setDates() {
    if ($("loginDate")) $("loginDate").value = today();
    ["monthlyDate", "productionDate", "productionFilterDate"].forEach(function (id) { if ($(id)) $(id).value = today(); });
    $("monthPicker").value = monthKey(today());
  }

  function setPayment(method) {
    PAYMENT = method;
    if ($("salePaymentSelect")) $("salePaymentSelect").value = method;
    document.querySelectorAll(".pay-btn").forEach(function (b) { b.classList.toggle("active", b.dataset.payment === PAYMENT); });
  }
  function setSubmitting(on) {
    isSubmittingSale = on;
    $("saveSaleBtn").disabled = on;
    $("chargeBasketBtn").disabled = on;
    $("saleAmount").disabled = on;
    $("submitState").textContent = on ? "Registrando..." : "Listo";
    $("submitState").classList.toggle("busy", on);
  }
  function saveSale(amount, mode, details) {
    if (isSubmittingSale) return Promise.resolve();
    amount = Number(amount || 0);
    if (amount <= 0) { toast("Ingrese un monto valido"); return Promise.resolve(); }
    setSubmitting(true);
    playSound();
    var tr = {
      id: uid(), type: "SALE", amount: amount, paymentMethod: PAYMENT, businessDate: currentSession.businessDate,
      shiftType: currentSession.shiftType, userId: currentUser.id, sessionId: currentSession.id,
      createdAt: nowIso(), deleted: false, saleMode: mode || "FAST"
    };
    return add("transactions", tr).then(function () {
      if (mode === "PRODUCT_BASKET" && details && details.length) {
        var basketId = uid();
        tr.basketId = basketId;
        return add("transactions", tr).then(function () {
          return add("baskets", { id: basketId, createdAt: nowIso(), userId: currentUser.id, total: amount, paymentMethod: PAYMENT, transactionId: tr.id });
        }).then(function () {
          return Promise.all(details.map(function (it) {
            return add("basketItems", {
              id: uid(), basketId: basketId, productId: it.productId, productName: it.productName,
              quantity: it.quantity, unitPrice: it.unitPrice, subtotal: it.subtotal
            });
          }));
        });
      }
    }).then(function () {
      return audit("SALE_CREATED", money(amount) + " " + PAYMENT + " " + (mode || "FAST"), amount > 60000 ? "warning" : "normal");
    }).then(function () {
      $("saleAmount").value = "";
      basket = [];
      renderAll();
      toast("Venta registrada");
    }).finally(function () {
      setTimeout(function () { setSubmitting(false); $("saleAmount").focus(); }, 220);
    });
  }
  function saveQuickSale(e) {
    e.preventDefault();
    saveSale(parseMoney($("saleAmount").value), "FAST");
  }
  function undoLastSale() {
    all("transactions").then(function (trs) {
      var sales = trs.filter(function (t) {
        return t.type === "SALE" && !t.deleted && t.sessionId === currentSession.id;
      }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      if (!sales[0]) { toast("No hay venta para deshacer"); return; }
      sales[0].deleted = true;
      sales[0].deleteReason = "Undo ultima venta";
      add("transactions", sales[0]).then(function () {
        return audit("SALE_UNDONE", money(sales[0].amount), "warning");
      }).then(renderAll);
    });
  }
  function saveWithdrawal(e) {
    e.preventDefault();
    var amount = parseMoney($("withdrawAmount").value);
    if (amount <= 0) { toast("Ingrese monto de retiro"); return; }
    add("transactions", {
      id: uid(), type: "WITHDRAWAL", amount: amount, paymentMethod: "Efectivo",
      description: $("withdrawDescription").value.trim(), businessDate: currentSession.businessDate,
      shiftType: currentSession.shiftType, userId: currentUser.id, sessionId: currentSession.id,
      createdAt: nowIso(), deleted: false
    }).then(function () {
      $("withdrawAmount").value = "";
      $("withdrawDescription").value = "";
      return audit("WITHDRAWAL_CREATED", money(amount));
    }).then(renderAll);
  }

  function renderCaja() {
    $("quickButtons").innerHTML = quickButtons.map(function (v) {
      return "<button type='button' data-sale='" + v + "'>" + money(v) + "</button>";
    }).join("");
    document.querySelectorAll("[data-sale]").forEach(function (b) {
      b.onclick = function () { $("saleAmount").value = b.dataset.sale; $("saleAmount").focus(); };
    });
    all("transactions").then(function (trs) {
      var sales = trs.filter(function (t) { return t.type === "SALE" && !t.deleted; })
        .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).slice(0, 15);
      $("lastSales").innerHTML = sales.length ? sales.map(function (s) {
        return card("<b>" + new Date(s.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + " | " + money(s.amount) + "</b><small>" + s.paymentMethod + " | " + s.saleMode + "</small>");
      }).join("") : empty("Sin ventas todavia");
      var todayRows = trs.filter(function (t) { return !t.deleted && t.businessDate === currentSession.businessDate; });
      if ($("todaySummary")) $("todaySummary").innerHTML = summary([
        ["Ventas efectivo", money(sum(todayRows, function (t) { return t.type === "SALE" && t.paymentMethod === "Efectivo"; }))],
        ["Transferencias", money(sum(todayRows, function (t) { return t.type === "SALE" && t.paymentMethod === "Transferencia"; }))],
        ["Retiros", money(sum(todayRows, function (t) { return t.type === "WITHDRAWAL"; }))],
        ["Clientes", todayRows.filter(function (t) { return t.type === "SALE"; }).length]
      ]);
    });
    renderBasket();
    renderCalc();
  }
  function renderBasket() {
    all("products").then(function (products) {
      products = products.filter(function (p) { return p.active; });
      $("productGrid").innerHTML = products.map(function (p) {
        return "<button class='product-card' type='button' data-product='" + p.id + "'><b>" + p.name + "</b><span>" + money(p.price) + " / " + p.unitType + "</span></button>";
      }).join("");
      document.querySelectorAll("[data-product]").forEach(function (btn) {
        btn.onclick = function () {
          var p = products.filter(function (x) { return x.id === btn.dataset.product; })[0];
          var q = parseMoney(prompt("Cantidad de " + p.name, "1"));
          if (q <= 0) return;
          basket.push({ productId: p.id, productName: p.name, quantity: q, unitPrice: p.price, subtotal: q * p.price });
          renderBasket();
        };
      });
    });
    var total = basket.reduce(function (a, b) { return a + b.subtotal; }, 0);
    $("basketTotal").textContent = money(total);
    $("basketItems").innerHTML = basket.length ? basket.map(function (it, i) {
      return "<div class='compact-row'><span>" + it.quantity + " x " + it.productName + "<small>" + money(it.subtotal) + "</small></span><button class='small danger' data-remove-basket='" + i + "'>x</button></div>";
    }).join("") : empty("Canasta vacia");
    document.querySelectorAll("[data-remove-basket]").forEach(function (b) {
      b.onclick = function () { basket.splice(Number(b.dataset.removeBasket), 1); renderBasket(); };
    });
  }
  function chargeBasket() {
    var total = basket.reduce(function (a, b) { return a + b.subtotal; }, 0);
    saveSale(total, "PRODUCT_BASKET", basket.slice());
  }
  function setSaleMode(mode) {
    saleMode = mode;
    $("quickModeBtn").classList.toggle("active", mode === "quick");
    $("basketModeBtn").classList.toggle("active", mode === "basket");
    $("saleForm").classList.toggle("hidden", mode === "basket");
    $("basketPanel").classList.toggle("hidden", mode !== "basket");
  }

  function renderCalc() {
    var total = calcItems.reduce(function (a, b) { return a + b; }, 0);
    $("calcTotal").textContent = money(total);
    $("calcChange").textContent = money(parseMoney($("calcPaid").value) - total);
    $("calcList").innerHTML = calcItems.length ? calcItems.map(function (v, i) {
      return "<div class='compact-row'><span>" + money(v) + "</span><button class='small danger' data-calc-remove='" + i + "'>x</button></div>";
    }).join("") : empty("Sin importes sumados");
    document.querySelectorAll("[data-calc-remove]").forEach(function (b) {
      b.onclick = function () { calcItems.splice(Number(b.dataset.calcRemove), 1); renderCalc(); };
    });
  }
  function addCalc(v) {
    v = Number(v || 0);
    if (v > 0) calcItems.push(v);
    $("calcAmount").value = "";
    renderCalc();
  }

  function activeTransactions() {
    return all("transactions").then(function (trs) { return trs.filter(function (t) { return !t.deleted; }); });
  }
  function renderClosures() {
    activeTransactions().then(function (trs) {
      var shift = trs.filter(function (t) { return t.businessDate === currentSession.businessDate && t.shiftType === currentSession.shiftType; });
      var cashSales = sum(shift, function (t) { return t.type === "SALE" && t.paymentMethod === "Efectivo"; });
      var transferSales = sum(shift, function (t) { return t.type === "SALE" && t.paymentMethod === "Transferencia"; });
      var withdrawals = sum(shift, function (t) { return t.type === "WITHDRAWAL"; });
      var expectedCash = currentSession.openingCash + cashSales - withdrawals;
      if ($("expectedCashCard")) $("expectedCashCard").textContent = money(expectedCash);
      if ($("expectedTransferCard")) $("expectedTransferCard").textContent = money(transferSales);
      $("closureExpected").innerHTML = summary([
        ["Efectivo esperado", money(expectedCash)],
        ["Transferencia", money(transferSales)],
        ["Ventas", money(cashSales + transferSales)],
        ["Retiros", money(withdrawals)]
      ]);
    });
    all("closures").then(function (rows) {
      rows.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      $("closuresList").innerHTML = rows.length ? rows.slice(0, 20).map(function (c) {
        return "<table><tr><td>" + c.createdAt.slice(0, 19).replace("T", " ") + "</td><td>" + c.businessDate + "</td><td>" + c.shiftType + "</td><td>" + money(c.expectedCash) + "</td><td>" + money(c.countedCash) + "</td><td>" + money(c.differenceCash) + "</td></tr></table>";
      }).join("") : empty("Sin cierres guardados");
    });
  }
  function saveClosure(e) {
    e.preventDefault();
    activeTransactions().then(function (trs) {
      var shift = trs.filter(function (t) { return t.businessDate === currentSession.businessDate && t.shiftType === currentSession.shiftType; });
      var cashSales = sum(shift, function (t) { return t.type === "SALE" && t.paymentMethod === "Efectivo"; });
      var transferSales = sum(shift, function (t) { return t.type === "SALE" && t.paymentMethod === "Transferencia"; });
      var withdrawals = sum(shift, function (t) { return t.type === "WITHDRAWAL"; });
      var expectedCash = currentSession.openingCash + cashSales - withdrawals;
      var countedCash = parseMoney($("countedCash").value);
      var countedTransfer = parseMoney($("countedTransfer").value);
      return add("closures", {
        id: uid(), businessDate: currentSession.businessDate, shiftType: currentSession.shiftType,
        expectedCash: expectedCash, countedCash: countedCash, differenceCash: countedCash - expectedCash,
        expectedTransfer: transferSales, countedTransfer: countedTransfer, differenceTransfer: countedTransfer - transferSales,
        totalSales: cashSales + transferSales, totalWithdrawals: withdrawals, notes: $("closureNotes").value.trim(),
        createdBy: currentUser.id, createdAt: nowIso()
      });
    }).then(function () {
      return audit("SHIFT_CLOSED", currentSession.businessDate + " " + currentSession.shiftType);
    }).then(function () {
      $("closureForm").reset();
      renderAll();
      toast("Cierre guardado");
    });
  }

  function renderMonthly() {
    var m = $("monthPicker").value || monthKey(today());
    Promise.all([activeTransactions(), all("closures"), all("monthlyEntries")]).then(function (data) {
      var trs = data[0].filter(function (t) { return monthKey(t.businessDate) === m && t.type === "SALE"; });
      var closures = data[1].filter(function (c) { return monthKey(c.businessDate) === m; });
      var entries = data[2].filter(function (e) { return monthKey(e.date) === m; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
      var sales = sum(trs, function () { return true; });
      var closureSales = sum(closures, function () { return true; }, "totalSales");
      var income = sum(entries, function (e) { return e.type === "INCOME"; });
      var expenses = sum(entries, function (e) { return e.type === "BIG_EXPENSE"; });
      $("monthlySummary").innerHTML = summary([
        ["Ventas del mes", money(sales)],
        ["Cierres guardados", money(closureSales)],
        ["Otros ingresos", money(income)],
        ["Gastos grandes", money(expenses)],
        ["Resultado estimado", money(sales + income - expenses)]
      ]);
      $("monthlyEntries").innerHTML = entries.length ? entries.map(function (e) {
        return card("<b>" + e.date + " | " + money(e.amount) + "</b><small>" + e.category + " | " + e.description + " | " + e.paymentMethod + "</small>", e.type === "BIG_EXPENSE" ? "warn" : "gold");
      }).join("") : empty("Sin movimientos mensuales");
    });
  }
  function saveMonthly(e) {
    e.preventDefault();
    var amount = parseMoney($("monthlyAmount").value);
    if (amount <= 0) { toast("Ingrese monto"); return; }
    add("monthlyEntries", {
      id: uid(), type: $("monthlyType").value, date: $("monthlyDate").value || today(), amount: amount,
      category: $("monthlyCategory").value, description: $("monthlyDescription").value.trim(),
      paymentMethod: $("monthlyPayment").value, createdBy: currentUser.id, createdAt: nowIso()
    }).then(function () {
      return audit("MONTHLY_ENTRY_CREATED", $("monthlyType").value + " " + money(amount));
    }).then(function () {
      $("monthlyForm").reset();
      setDates();
      renderMonthly();
    });
  }

  function renderProduction() {
    var d = $("productionFilterDate").value || today();
    all("productionItems").then(function (items) {
      items = items.filter(function (i) { return i.date === d; }).sort(function (a, b) { return a.productName.localeCompare(b.productName); });
      $("productionList").innerHTML = items.length ? items.map(function (i) {
        return card("<b>" + i.productName + " | vendido/movido " + i.estimatedSold + " " + i.unitType + "</b><small>Entrado " + i.enteredAmount + " | Sobro " + i.leftoverAmount + "</small>", "blue");
      }).join("") : empty("Sin renglones para esta fecha");
    });
  }
  function saveProduction(e) {
    e.preventDefault();
    var entered = parseMoney($("productionEntered").value);
    var left = parseMoney($("productionLeft").value);
    var name = $("productionName").value.trim();
    if (!name || entered < 0 || left < 0) { toast("Complete producto y cantidades"); return; }
    add("productionItems", {
      id: uid(), date: $("productionDate").value || today(), productName: name, unitType: $("productionUnit").value,
      enteredAmount: entered, leftoverAmount: left, estimatedSold: Math.max(0, entered - left),
      createdBy: currentUser.id, createdAt: nowIso()
    }).then(function () { return audit("PRODUCTION_ITEM_CREATED", name); }).then(function () {
      $("productionName").value = "";
      $("productionEntered").value = "";
      $("productionLeft").value = "";
      $("productionFilterDate").value = $("productionDate").value;
      renderProduction();
    });
  }

  function renderMetrics() {
    var days = Number($("metricsRange").value || 30);
    var start = new Date();
    start.setDate(start.getDate() - days + 1);
    activeTransactions().then(function (trs) {
      var sales = trs.filter(function (t) { return t.type === "SALE" && new Date(t.createdAt) >= start; });
      var cash = sum(sales, function (t) { return t.paymentMethod === "Efectivo"; });
      var transfer = sum(sales, function (t) { return t.paymentMethod === "Transferencia"; });
      var avg = sales.length ? sum(sales, function () { return true; }) / sales.length : 0;
      $("metricsCards").innerHTML = summary([
        ["Ventas", money(cash + transfer)],
        ["Clientes", sales.length],
        ["Ticket promedio", money(avg)],
        ["Efectivo", money(cash)],
        ["Transferencia", money(transfer)]
      ]);
      drawChart(sales, days);
    });
  }
  function renderMovements() {
    all("transactions").then(function (rows) {
      rows.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      $("movementsList").innerHTML = rows.length ? "<table class='sortable-table'><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Medio</th><th>Turno</th><th>Estado</th></tr>" + rows.map(function (r) {
        return "<tr class='" + (r.deleted ? "deleted" : "") + "'><td>" + r.createdAt.slice(0, 19).replace("T", " ") + "</td><td>" + r.type + "</td><td>" + money(r.amount) + "</td><td>" + (r.paymentMethod || "") + "</td><td>" + (r.shiftType || "") + "</td><td>" + (r.deleted ? "Borrado" : "Activo") + "</td></tr>";
      }).join("") + "</table>" : empty("Sin movimientos");
    });
  }
  function drawChart(sales, days) {
    var canvas = $("salesChart");
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var labels = [];
    var values = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      labels.push(key.slice(5));
      values.push(sum(sales.filter(function (s) { return s.businessDate === key; }), function () { return true; }));
    }
    var max = Math.max.apply(Math, values.concat([1]));
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#295f9d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    values.forEach(function (v, i) {
      var x = 40 + i * ((canvas.width - 70) / Math.max(1, values.length - 1));
      var y = 280 - (v / max) * 230;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#24211d";
    ctx.font = "14px Arial";
    ctx.fillText("Ventas por dia", 40, 24);
    ctx.fillText(money(max), 40, 48);
  }

  function renderAdmin() {
    if (!isAdmin()) return;
    all("users").then(function (users) {
      $("usersList").innerHTML = "<table><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th></tr>" + users.map(function (u) {
        return "<tr><td>" + u.username + "</td><td>" + u.displayName + "</td><td>" + u.role + "</td><td>" + (u.active ? "Activo" : "Inactivo") + "</td></tr>";
      }).join("") + "</table>";
    });
    all("auditLog").then(function (rows) {
      rows.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      $("auditList").innerHTML = "<table><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Detalle</th></tr>" + rows.slice(0, 120).map(function (a) {
        return "<tr class='" + (a.severity === "warning" || a.severity === "critical" ? "audit-warning" : "") + "'><td>" + a.createdAt.slice(0, 19).replace("T", " ") + "</td><td>" + (a.username || "sistema") + "</td><td>" + a.action + "</td><td>" + a.detail + "</td></tr>";
      }).join("") + "</table>";
    });
  }
  function saveUser(e) {
    e.preventDefault();
    if (!isAdmin()) return;
    var username = $("newUsername").value.trim();
    var password = $("newPassword").value.trim();
    if (!username || !password) { toast("Usuario y clave son obligatorios"); return; }
    add("users", {
      id: uid(), username: username, displayName: $("newDisplayName").value.trim() || username,
      role: $("newRole").value, password: password, active: true, createdAt: nowIso()
    }).then(function () { return audit("USER_CREATED", username); }).then(function () {
      $("userForm").reset();
      renderAdmin();
    });
  }
  function exportData() {
    Promise.all(STORES.map(all)).then(function (data) {
      var out = {};
      STORES.forEach(function (s, i) { out[s] = data[i]; });
      $("exportBox").textContent = JSON.stringify(out, null, 2);
      $("exportBox").classList.remove("hidden");
    });
  }

  function renderAll() {
    renderCaja();
    if (currentTab === "Cierres") renderClosures();
    if (currentTab === "Mensual") renderMonthly();
    if (currentTab === "Produccion") renderProduction();
    if (currentTab === "Metricas") renderMetrics();
    if (currentTab === "Movimientos") renderMovements();
    if (currentTab === "Actividad" || currentTab === "Usuarios" || currentTab === "Dev") renderAdmin();
  }
  function sum(rows, predicate, field) {
    field = field || "amount";
    return rows.reduce(function (acc, row) { return predicate(row) ? acc + Number(row[field] || 0) : acc; }, 0);
  }
  function card(html, tone) { return "<div class='entry-card " + (tone || "") + "'>" + html + "</div>"; }
  function empty(text) { return "<div class='empty'>" + text + "</div>"; }
  function summary(items) {
    return items.map(function (i) { return "<div class='summary-item'><span>" + i[0] + "</span><b>" + i[1] + "</b></div>"; }).join("");
  }
  function bind() {
    $("loginForm").onsubmit = login;
    $("logoutBtn").onclick = logout;
    $("saleForm").onsubmit = saveQuickSale;
    $("withdrawForm").onsubmit = saveWithdrawal;
    $("undoBtn").onclick = undoLastSale;
    $("closureForm").onsubmit = saveClosure;
    $("monthlyForm").onsubmit = saveMonthly;
    $("productionForm").onsubmit = saveProduction;
    $("userForm").onsubmit = saveUser;
    $("exportBtn").onclick = exportData;
    $("salePaymentSelect").onchange = function () { setPayment($("salePaymentSelect").value); };
    $("applyWorkShift").onclick = function () {
      currentSession.businessDate = $("workDateInput").value || currentSession.businessDate;
      currentSession.shiftType = $("workShiftInput").value;
      sessionStorage.setItem("bakerySession", JSON.stringify({ user: currentUser, session: currentSession }));
      add("sessions", currentSession).then(function () { return audit("WORK_SHIFT_CHANGED", currentSession.businessDate + " " + currentSession.shiftType); }).then(showApp);
    };
    $("monthPicker").onchange = renderMonthly;
    $("productionFilterDate").onchange = renderProduction;
    $("metricsRange").onchange = renderMetrics;
    $("quickModeBtn").onclick = function () { setSaleMode("quick"); };
    $("basketModeBtn").onclick = function () { setSaleMode("basket"); };
    $("clearBasketBtn").onclick = function () { basket = []; renderBasket(); };
    $("chargeBasketBtn").onclick = chargeBasket;
    document.querySelectorAll(".pay-btn").forEach(function (b) { b.onclick = function () { setPayment(b.dataset.payment); }; });
    $("calcAdd").onclick = function () { addCalc(parseMoney($("calcAmount").value)); };
    $("calcClear").onclick = function () { calcItems = []; $("calcPaid").value = ""; renderCalc(); };
    $("calcPaid").oninput = renderCalc;
    $("calcUse").onclick = function () { $("saleAmount").value = String(Math.round(calcItems.reduce(function (a, b) { return a + b; }, 0))); setSaleMode("quick"); $("saleAmount").focus(); };
    document.querySelectorAll("[data-calc]").forEach(function (b) { b.onclick = function () { addCalc(Number(b.dataset.calc)); }; });
    document.addEventListener("keydown", function (e) {
      if (!currentUser || e.ctrlKey || e.altKey || e.metaKey || isSubmittingSale) return;
      var tag = document.activeElement && document.activeElement.tagName.toLowerCase();
      if (tag === "textarea" || (tag === "input" && document.activeElement !== $("saleAmount"))) return;
      if (e.key === "Enter" && saleMode === "quick" && document.activeElement === $("saleAmount")) {
        e.preventDefault();
        saveSale(parseMoney($("saleAmount").value), "FAST");
      }
      if ((e.key === "e" || e.key === "E") && saleMode === "quick" && $("saleAmount").value.trim()) {
        e.preventDefault();
        setPayment("Efectivo");
        saveSale(parseMoney($("saleAmount").value), "FAST");
      }
      if ((e.key === "t" || e.key === "T") && saleMode === "quick" && $("saleAmount").value.trim()) {
        e.preventDefault();
        setPayment("Transferencia");
        saveSale(parseMoney($("saleAmount").value), "FAST");
      }
    });
  }
  function fillSelects() {
    $("monthlyCategory").innerHTML = monthlyCategories.map(function (c) { return "<option>" + c + "</option>"; }).join("");
  }
  function restoreSession() {
    var raw = sessionStorage.getItem("bakerySession");
    if (!raw) return false;
    try {
      var s = JSON.parse(raw);
      currentUser = s.user;
      currentSession = s.session;
      showApp();
      return true;
    } catch (e) { return false; }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!("indexedDB" in window)) {
      alert("Este navegador no soporta IndexedDB. Use Chrome, Edge o Firefox.");
      return;
    }
    bind();
    fillSelects();
    setPayment("Efectivo");
    setSaleMode("quick");
    seed().then(function () {
      restoreSession();
      // PWA registration is intentionally left off during local preview so UI changes are never hidden by cache.
    });
  });
})();
