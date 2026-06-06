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
  var selectedProduct = null;
  var autoSaleTimer = null;
  var autoTicketTimer = null;
  var lastSaleAt = 0;
  var editorProducts = [];
  var editImageData = "";
  var pendingUndoSale = null;
  var quickButtons = [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 8000, 10000];
  var monthlyCategories = ["Proveedores", "Sueldos", "Alquiler", "Servicios", "Arreglos", "Equipamiento", "Insumos", "Otro"];
  var defaultProducts = [
    ["Pan", 2000, "kg", "Panaderia"],
    ["Facturas", 500, "unidad", "Dulce"],
    ["Bizcochos", 2600, "kg", "Panaderia"],
    ["Empanadas", 900, "unidad", "Salado"],
    ["Sanguches de Miga", 1800, "unidad", "Salado"],
    ["Masas Secas", 4200, "kg", "Pasteleria"],
    ["Pizzas", 2200, "unidad", "Salado"],
    ["Sodas/Drinks", 1500, "unidad", "Bebidas"]
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
  function escapeHtml(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
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
        var existing = {};
        products.forEach(function (p) { existing[p.name.toLowerCase()] = true; });
        return Promise.all(defaultProducts.filter(function (p) {
          return !existing[p[0].toLowerCase()];
        }).map(function (p) {
          return add("products", { id: uid(), name: p[0], price: p[1], unitType: p[2], priceUnit: p[2], category: p[3], active: true, sortOrder: products.length + defaultProducts.indexOf(p), createdAt: nowIso() });
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
    $("sessionInfo").innerHTML = "Usuario: <b>" + currentUser.displayName + "</b> | Fecha: <b>" + currentSession.businessDate + "</b> | Turno: <b>" + currentSession.shiftType + "</b>";
    $("workDateInput").value = currentSession.businessDate;
    $("workShiftInput").value = currentSession.shiftType;
    $("workShiftBar").style.display = "none";
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
    if ($("saveSaleBtn")) $("saveSaleBtn").disabled = on;
    if ($("chargeBasketBtn")) $("chargeBasketBtn").disabled = on;
    if ($("saleAmount")) $("saleAmount").disabled = on;
    if ($("submitState")) $("submitState").textContent = on ? "Registrando..." : "Listo";
    if ($("submitState")) $("submitState").classList.toggle("busy", on);
  }
  function saveSale(amount, mode, details) {
    if (isSubmittingSale) return Promise.resolve();
    if (Date.now() - lastSaleAt < 900) return Promise.resolve();
    amount = Number(amount || 0);
    if (amount <= 0) { toast("Ingrese un monto valido"); return Promise.resolve(); }
    setSubmitting(true);
    lastSaleAt = Date.now();
    clearTimeout(autoSaleTimer);
    clearTimeout(autoTicketTimer);
    playSound();
    var tr = {
      id: uid(), type: "SALE", amount: amount, paymentMethod: PAYMENT, businessDate: currentSession.businessDate,
      shiftType: currentSession.shiftType, userId: currentUser.id, sessionId: currentSession.id,
      createdAt: nowIso(), deleted: false, saleMode: mode || "FAST"
    };
    return add("transactions", tr).then(function () {
      if (details && details.length) {
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
      if ($("saleAmount")) $("saleAmount").value = "";
      basket = [];
      if ($("ticketPaid")) $("ticketPaid").value = "";
      renderAll();
      toast("Venta registrada");
    }).finally(function () {
      setTimeout(function () {
        setSubmitting(false);
        if ($("saleAmount")) $("saleAmount").focus();
      }, 220);
    });
  }
  function saveQuickSale(e) {
    e.preventDefault();
    clearTimeout(autoSaleTimer);
    saveSale(parseMoney($("saleAmount").value), "FAST");
  }
  function undoLastSale() {
    all("transactions").then(function (trs) {
      var sales = trs.filter(function (t) {
        return t.type === "SALE" && !t.deleted && t.sessionId === currentSession.id;
      }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      if (!sales[0]) { toast("No hay venta para deshacer"); return; }
      openUndoModal(sales[0]);
    });
  }
  function openUndoModal(sale) {
    pendingUndoSale = sale;
    $("undoSaleSummary").textContent = new Date(sale.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + " | " + sale.paymentMethod + " | " + money(sale.amount);
    $("undoReason").value = "";
    $("undoModal").classList.remove("hidden");
    $("undoReason").focus();
  }
  function closeUndoModal() {
    $("undoModal").classList.add("hidden");
    pendingUndoSale = null;
  }
  function confirmUndoSale(e) {
    e.preventDefault();
    if (!pendingUndoSale) { closeUndoModal(); return; }
    var reason = $("undoReason").value.trim();
    if (!reason) { toast("Ingrese el motivo"); $("undoReason").focus(); return; }
    undoSaleById(pendingUndoSale.id, reason);
  }
  function undoSaleById(id, reason) {
    all("transactions").then(function (trs) {
      var sale = trs.filter(function (t) {
        return t.id === id && t.type === "SALE" && !t.deleted && t.sessionId === currentSession.id;
      })[0];
      if (!sale) { toast("Venta no encontrada"); return; }
      sale.deleted = true;
      sale.deleteReason = reason;
      sale.reviewRequired = true;
      add("transactions", sale).then(function () {
        return audit("SALE_UNDONE_REVIEW_REQUIRED", money(sale.amount) + " | Motivo: " + reason, "critical");
      }).then(function () {
        closeUndoModal();
        renderAll();
        toast("Venta deshecha y marcada para revision");
      });
    });
  }
  function saveWithdrawal(e) {
    e.preventDefault();
    var amount = parseMoney($("withdrawAmount").value);
    if (amount <= 0) { toast("Ingrese monto de retiro"); return; }
    var who = $("withdrawBy") ? $("withdrawBy").value.trim() : "";
    if (!who) { toast("Indique quien retiro el dinero"); $("withdrawBy").focus(); return; }
    var note = $("withdrawDescription").value.trim();
    add("transactions", {
      id: uid(), type: "WITHDRAWAL", amount: amount, paymentMethod: "Efectivo",
      description: (who ? "Retiro: " + who : "Retiro") + (note ? " - " + note : ""), businessDate: currentSession.businessDate,
      shiftType: currentSession.shiftType, userId: currentUser.id, sessionId: currentSession.id,
      createdAt: nowIso(), deleted: false
    }).then(function () {
      $("withdrawAmount").value = "";
      if ($("withdrawBy")) $("withdrawBy").value = "";
      $("withdrawDescription").value = "";
      return audit("WITHDRAWAL_CREATED", money(amount));
    }).then(function () {
      closeWithdrawModal();
      renderAll();
      toast("Retiro registrado");
    });
  }

  function renderCaja() {
    if ($("quickButtons")) $("quickButtons").innerHTML = quickButtons.map(function (v) {
      return "<button type='button' data-sale='" + v + "'>" + money(v) + "</button>";
    }).join("");
    all("transactions").then(function (trs) {
      var sales = trs.filter(function (t) { return t.type === "SALE" && !t.deleted; })
        .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).slice(0, 10);
      $("lastSales").innerHTML = sales.length ? sales.map(function (s) {
        return card("<div class='last-sale-row'><b>" + new Date(s.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + "</b><span>" + s.paymentMethod + "</span><strong>" + money(s.amount) + "</strong></div>");
      }).join("") : empty("Sin ventas todavia");
    });
    renderBasket();
    renderProducts();
  }
  function renderBasket() {
    var total = basket.reduce(function (a, b) { return a + b.subtotal; }, 0);
    if ($("basketTotal")) $("basketTotal").textContent = money(total);
    if ($("ticketChange")) $("ticketChange").textContent = money(parseMoney($("ticketPaid") && $("ticketPaid").value) - total);
    $("basketItems").innerHTML = basket.length ? basket.map(function (it, i) {
      return "<div class='compact-row ticket-line'><span><b>" + escapeHtml(it.productName) + "</b><small>" + it.quantity + " " + escapeHtml(it.unitType || "") + " x " + money(it.unitPrice) + "</small></span><strong>" + money(it.subtotal) + "</strong><button class='small danger' data-remove-basket='" + i + "'>x</button></div>";
    }).join("") : empty("Ticket vacio");
    document.querySelectorAll("[data-remove-basket]").forEach(function (b) {
      b.onclick = function () { basket.splice(Number(b.dataset.removeBasket), 1); renderBasket(); scheduleTicketAutoSave(); };
    });
    scheduleTicketAutoSave();
  }
  function chargeBasket() {
    var total = basket.reduce(function (a, b) { return a + b.subtotal; }, 0);
    if (total <= 0) { toast("Ticket vacio"); return; }
    saveSale(total, "PRODUCT_BASKET", basket.slice());
  }
  function setSaleMode(mode) {
    saleMode = mode;
    if ($("quickModeBtn")) $("quickModeBtn").classList.toggle("active", mode === "quick");
    if ($("basketModeBtn")) $("basketModeBtn").classList.toggle("active", mode === "basket");
    if ($("saleForm")) $("saleForm").classList.toggle("hidden", false);
    if ($("basketPanel")) $("basketPanel").classList.toggle("hidden", true);
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

  function productIcon(name) {
    var n = String(name || "").toLowerCase();
    if (n.indexOf("pan") >= 0) return "PAN";
    if (n.indexOf("fact") >= 0) return "DOC";
    if (n.indexOf("biz") >= 0) return "KG";
    if (n.indexOf("emp") >= 0) return "EMP";
    if (n.indexOf("miga") >= 0 || n.indexOf("sand") >= 0) return "SM";
    if (n.indexOf("masa") >= 0) return "MS";
    if (n.indexOf("pizza") >= 0) return "PZ";
    if (n.indexOf("drink") >= 0 || n.indexOf("soda") >= 0) return "DR";
    return "PR";
  }
  function productImage(product) {
    if (product && product.imageData) {
      return "<span class='product-img has-photo'><img src='" + escapeHtml(product.imageData) + "' alt=''></span>";
    }
    return "<span class='product-img'>" + productIcon(product && product.name) + "</span>";
  }
  function renderProducts() {
    all("products").then(function (products) {
      products = products.filter(function (p) { return p.active; }).sort(function (a, b) {
        return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name).localeCompare(String(b.name));
      });
      $("productGrid").innerHTML = products.map(function (p) {
        return "<button class='product-card' type='button' draggable='true' data-product='" + p.id + "'>" + productImage(p) + "<b>" + escapeHtml(p.name) + "</b><small>" + money(p.price) + " / " + escapeHtml(p.priceUnit || p.unitType) + "</small></button>";
      }).join("") + "<button class='product-card product-edit-card' id='openProductEditorBtn' type='button'><span class='product-img'>EDIT</span><b>Editar</b><small>Agregar, modificar o borrar</small></button>";
      document.querySelectorAll("[data-product]").forEach(function (btn) {
        btn.onclick = function () {
          if (btn.dataset.dragging === "1") { btn.dataset.dragging = "0"; return; }
          var p = products.filter(function (x) { return x.id === btn.dataset.product; })[0];
          openProductModal(p);
        };
      });
      bindProductDrag(products);
      $("openProductEditorBtn").onclick = openProductEditor;
    });
  }
  function bindProductDrag(products) {
    var draggedId = "";
    document.querySelectorAll("[data-product]").forEach(function (btn) {
      btn.ondragstart = function (e) {
        draggedId = btn.dataset.product;
        btn.classList.add("dragging");
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      };
      btn.ondragend = function () {
        btn.classList.remove("dragging");
        btn.dataset.dragging = "1";
        setTimeout(function () { btn.dataset.dragging = "0"; }, 80);
      };
      btn.ondragover = function (e) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        btn.classList.add("drop-target");
      };
      btn.ondragleave = function () { btn.classList.remove("drop-target"); };
      btn.ondrop = function (e) {
        e.preventDefault();
        btn.classList.remove("drop-target");
        if (!draggedId || draggedId === btn.dataset.product) return;
        reorderProducts(products, draggedId, btn.dataset.product);
      };
    });
  }
  function reorderProducts(products, draggedId, targetId) {
    var list = products.slice();
    var from = list.findIndex(function (p) { return p.id === draggedId; });
    var to = list.findIndex(function (p) { return p.id === targetId; });
    if (from < 0 || to < 0) return;
    var moved = list.splice(from, 1)[0];
    list.splice(to, 0, moved);
    Promise.all(list.map(function (p, i) {
      p.sortOrder = i;
      return add("products", p);
    })).then(function () {
      renderProducts();
      toast("Orden actualizado");
    });
  }
  function openProductModal(product) {
    selectedProduct = product;
    $("productModalTitle").textContent = product.name;
    $("productModalIcon").innerHTML = product.imageData ? "<img src='" + escapeHtml(product.imageData) + "' alt=''>" : productIcon(product.name);
    $("productPriceInput").value = String(product.price || "");
    $("productQuantityInput").value = "1";
    $("productQuantityLabel").firstChild.nodeValue = product.unitType === "kg" ? "Cuantos kg " : "Cantidad ";
    $("productModal").classList.remove("hidden");
    updateProductModalTotal();
    $("productQuantityInput").focus();
  }
  function closeProductModal() {
    $("productModal").classList.add("hidden");
    selectedProduct = null;
  }
  function updateProductModalTotal() {
    var total = parseMoney($("productPriceInput").value) * parseMoney($("productQuantityInput").value);
    $("productModalTotal").textContent = money(total);
  }
  function productLineFromModal() {
    if (!selectedProduct) return null;
    var price = parseMoney($("productPriceInput").value);
    var q = parseMoney($("productQuantityInput").value);
    if (price <= 0 || q <= 0) {
      toast("Cargue precio y cantidad");
      return null;
    }
    selectedProduct.price = price;
    selectedProduct.priceUnit = selectedProduct.priceUnit || selectedProduct.unitType;
    add("products", selectedProduct);
    return {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: q,
      unitType: selectedProduct.unitType,
      unitPrice: price,
      subtotal: Math.round(q * price * 100) / 100
    };
  }
  function registerProductSale(e) {
    e.preventDefault();
    var item = productLineFromModal();
    if (!item) return;
    closeProductModal();
    saveSale(item.subtotal, "PRODUCT_QUICK", [item]);
  }
  function addProductToTicket() {
    var item = productLineFromModal();
    if (!item) return;
    basket.push(item);
    closeProductModal();
    renderBasket();
    renderProducts();
    toast("Agregado al ticket");
  }
  function openWithdrawModal() {
    $("withdrawModal").classList.remove("hidden");
    $("withdrawAmount").focus();
  }
  function closeWithdrawModal() {
    $("withdrawModal").classList.add("hidden");
  }
  function scheduleSaleAutoSave() {
    clearTimeout(autoSaleTimer);
    if (!$("saleAmount") || parseMoney($("saleAmount").value) <= 0) return;
    autoSaleTimer = setTimeout(function () {
      if (!isSubmittingSale && parseMoney($("saleAmount").value) > 0) {
        saveSale(parseMoney($("saleAmount").value), "FAST_AUTO");
        toast("Venta pendiente registrada automaticamente");
      }
    }, 60000);
  }
  function scheduleTicketAutoSave() {
    clearTimeout(autoTicketTimer);
    if (!basket.length) return;
    autoTicketTimer = setTimeout(function () {
      if (!isSubmittingSale && basket.length) {
        chargeBasket();
        toast("Ticket pendiente registrado automaticamente");
      }
    }, 60000);
  }
  function openProductEditor() {
    $("productEditorModal").classList.remove("hidden");
    resetProductEditorForm();
    renderProductEditor();
  }
  function closeProductEditor() {
    $("productEditorModal").classList.add("hidden");
  }
  function resetProductEditorForm() {
    $("editProductId").value = "";
    $("editProductName").value = "";
    $("editProductUnit").value = "unidad";
    $("editProductPrice").value = "";
    $("editProductPriceUnit").value = "unidad";
    $("editProductCategory").value = "";
    $("editProductImage").value = "";
    editImageData = "";
  }
  function renderProductEditor() {
    all("products").then(function (products) {
      editorProducts = products.filter(function (p) { return p.active; });
      $("productEditorList").innerHTML = editorProducts.length ? editorProducts.map(function (p) {
        return "<div class='editor-product-row'><div>" + productImage(p) + "</div><span><b>" + escapeHtml(p.name) + "</b><small>" + money(p.price) + " / " + escapeHtml(p.priceUnit || p.unitType) + " | vendido por " + escapeHtml(p.unitType) + "</small></span><button type='button' data-edit-product='" + p.id + "'>Editar</button><button class='danger' type='button' data-delete-product='" + p.id + "'>Borrar</button></div>";
      }).join("") : empty("Sin productos");
      document.querySelectorAll("[data-edit-product]").forEach(function (btn) {
        btn.onclick = function () {
          var p = editorProducts.filter(function (x) { return x.id === btn.dataset.editProduct; })[0];
          if (!p) return;
          $("editProductId").value = p.id;
          $("editProductName").value = p.name || "";
          $("editProductUnit").value = p.unitType || "unidad";
          $("editProductPrice").value = String(p.price || "");
          $("editProductPriceUnit").value = p.priceUnit || p.unitType || "unidad";
          $("editProductCategory").value = p.category || "";
          $("editProductImage").value = "";
          editImageData = p.imageData || "";
        };
      });
      document.querySelectorAll("[data-delete-product]").forEach(function (btn) {
        btn.onclick = function () {
          var p = editorProducts.filter(function (x) { return x.id === btn.dataset.deleteProduct; })[0];
          if (!p || !confirm("Borrar " + p.name + "?")) return;
          p.active = false;
          add("products", p).then(function () {
            renderProducts();
            renderProductEditor();
            toast("Producto borrado");
          });
        };
      });
    });
  }
  function saveProductEditor(e) {
    e.preventDefault();
    var name = $("editProductName").value.trim();
    var price = parseMoney($("editProductPrice").value);
    if (!name || price <= 0) { toast("Complete nombre y precio"); return; }
    var id = $("editProductId").value || uid();
    var existing = editorProducts.filter(function (p) { return p.id === id; })[0] || {};
    var product = {
      id: id,
      name: name,
      price: price,
      unitType: $("editProductUnit").value,
      priceUnit: $("editProductPriceUnit").value,
      category: $("editProductCategory").value.trim() || "General",
      imageData: editImageData || existing.imageData || "",
      active: true,
      sortOrder: existing.sortOrder == null ? editorProducts.length : existing.sortOrder,
      createdAt: existing.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    add("products", product).then(function () {
      resetProductEditorForm();
      renderProducts();
      renderProductEditor();
      toast("Producto guardado");
    });
  }
  function openCustomItemModal() {
    $("customItemModal").classList.remove("hidden");
    $("customItemName").focus();
    updateCustomItemTotal();
  }
  function closeCustomItemModal() {
    $("customItemModal").classList.add("hidden");
    $("customItemForm").reset();
    updateCustomItemTotal();
  }
  function updateCustomItemTotal() {
    $("customItemTotal").textContent = money(parseMoney($("customItemQty").value) * parseMoney($("customItemPrice").value));
  }
  function saveCustomItem(e) {
    e.preventDefault();
    var name = $("customItemName").value.trim();
    var q = parseMoney($("customItemQty").value);
    var price = parseMoney($("customItemPrice").value);
    if (!name || q <= 0 || price <= 0) { toast("Complete producto, cantidad y precio"); return; }
    basket.push({
      productId: "custom",
      productName: name,
      quantity: q,
      unitType: $("customItemUnit").value,
      unitPrice: price,
      subtotal: Math.round(q * price * 100) / 100
    });
    closeCustomItemModal();
    renderBasket();
    toast("Producto custom agregado");
  }
  function handleProductImage(file) {
    if (!file) { editImageData = ""; return; }
    var reader = new FileReader();
    reader.onload = function () { editImageData = String(reader.result || ""); };
    reader.readAsDataURL(file);
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
    $("openWithdrawBtn").onclick = openWithdrawModal;
    $("closeWithdrawModal").onclick = closeWithdrawModal;
    $("closeUndoModal").onclick = closeUndoModal;
    $("undoForm").onsubmit = confirmUndoSale;
    $("closeProductModal").onclick = closeProductModal;
    $("closeProductEditorModal").onclick = closeProductEditor;
    $("newProductBtn").onclick = resetProductEditorForm;
    $("productSaleForm").onsubmit = registerProductSale;
    $("productEditorForm").onsubmit = saveProductEditor;
    $("addProductToTicket").onclick = addProductToTicket;
    $("openCustomItemBtn").onclick = openCustomItemModal;
    $("closeCustomItemModal").onclick = closeCustomItemModal;
    $("customItemForm").onsubmit = saveCustomItem;
    $("customItemQty").oninput = updateCustomItemTotal;
    $("customItemPrice").oninput = updateCustomItemTotal;
    $("editProductImage").onchange = function () { handleProductImage($("editProductImage").files[0]); };
    $("productPriceInput").oninput = updateProductModalTotal;
    $("productQuantityInput").oninput = updateProductModalTotal;
    $("saleAmount").oninput = scheduleSaleAutoSave;
    $("ticketPaid").oninput = renderBasket;
    $("productModal").onclick = function (e) { if (e.target === $("productModal")) closeProductModal(); };
    $("withdrawModal").onclick = function (e) { if (e.target === $("withdrawModal")) closeWithdrawModal(); };
    $("undoModal").onclick = function (e) { if (e.target === $("undoModal")) closeUndoModal(); };
    $("productEditorModal").onclick = function (e) { if (e.target === $("productEditorModal")) closeProductEditor(); };
    $("customItemModal").onclick = function (e) { if (e.target === $("customItemModal")) closeCustomItemModal(); };
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
        clearTimeout(autoSaleTimer);
        saveSale(parseMoney($("saleAmount").value), "FAST");
      }
      if ((e.key === "e" || e.key === "E") && saleMode === "quick" && $("saleAmount").value.trim()) {
        e.preventDefault();
        setPayment("Efectivo");
        clearTimeout(autoSaleTimer);
        saveSale(parseMoney($("saleAmount").value), "FAST");
      }
      if ((e.key === "t" || e.key === "T") && saleMode === "quick" && $("saleAmount").value.trim()) {
        e.preventDefault();
        setPayment("Transferencia");
        clearTimeout(autoSaleTimer);
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
