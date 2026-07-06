(function () {
  "use strict";

  var DB_NAME = "bakery_caja_static_v1";
  var DB_VERSION = 1;
  var APP_VERSION = "2026.07.04.2";
  var APP_REPO = "Biblicaaal/AppCajaPana";
  var APP_BRANCH = "main";
  var UPDATE_MANIFEST_URL = "https://raw.githubusercontent.com/" + APP_REPO + "/" + APP_BRANCH + "/update.json";
  var UPDATE_ZIP_URL = "https://github.com/" + APP_REPO + "/archive/refs/heads/" + APP_BRANCH + ".zip";
  var UPDATE_REPO_URL = "https://github.com/" + APP_REPO;
  var STORES = ["users", "sessions", "transactions", "closures", "monthlyEntries", "productionItems", "products", "baskets", "basketItems", "settings", "auditLog"];
  var PAYMENT = "Efectivo";
  var currentUser = null;
  var currentSession = null;
  var currentTab = "Caja";
  var isSubmittingSale = false;
  var isLoggingIn = false;
  var isGeneratingTestData = false;
  var saleMode = "quick";
  var basket = [];
  var calcItems = [];
  var selectedProduct = null;
  var activeProductCategory = localStorage.getItem("bakeryActiveProductCategory") || "Todos";
  var autoSaleTimer = null;
  var autoTicketTimer = null;
  var lastSaleAt = 0;
  var editorProducts = [];
  var editImageData = "";
  var pendingUndoSale = null;
  var cropImage = null;
  var cropImageData = "";
  var cropDrag = null;
  var mpSyncTimer = null;
  var closureSnapshot = null;
  var closureDate = "";
  var closureShift = "";
  var splitDrag = null;
  var shelfDrag = null;
  var selectedMovements = {};
  var visibleMovementIds = [];
  var expandedMovements = {};
  var movementDragSelect = null;
  var lastMovementSelectIndex = -1;
  var movementFilteredRows = [];
  var movementItemsByBasket = {};
  var movementRenderCount = 0;
  var movementRenderTimer = null;
  var MOVEMENT_BATCH_SIZE = 80;
  var monthlyPhotoData = "";
  var dateSyncTimer = null;
  var selectedBalanceDay = "";
  var expandedMissingClosures = {};
  var draggedTab = "";
  var tabJustDragged = false;
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
    return "$ " + Math.round(Number(n || 0)).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }
  function updateAppHeight() {
    var h = window.visualViewport && window.visualViewport.height ? window.visualViewport.height : window.innerHeight;
    var w = window.visualViewport && window.visualViewport.width ? window.visualViewport.width : window.innerWidth;
    document.documentElement.style.setProperty("--app-height", Math.max(420, Math.floor(h || 720)) + "px");
    document.body.classList.toggle("small-laptop", Number(w || 0) <= 1400 && Number(h || 0) <= 820);
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
  function integrationSettings() {
    try {
      return JSON.parse(localStorage.getItem("bakeryIntegrationSettings") || "{}");
    } catch (e) {
      return {};
    }
  }
  function saveIntegrationSettings(e) {
    e.preventDefault();
    localStorage.setItem("bakeryIntegrationSettings", JSON.stringify({
      supabaseUrl: $("supabaseUrl").value.trim().replace(/\/$/, ""),
      supabaseAnonKey: $("supabaseAnonKey").value.trim()
    }));
    toast("Integracion guardada");
  }
  function loadIntegrationSettings() {
    var s = integrationSettings();
    if ($("supabaseUrl")) $("supabaseUrl").value = s.supabaseUrl || "";
    if ($("supabaseAnonKey")) $("supabaseAnonKey").value = s.supabaseAnonKey || "";
  }
  function updateSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem("bakeryUpdateSettings") || "{}");
      if (saved.autoCheck === undefined) saved.autoCheck = true;
      return saved;
    } catch (e) {
      return { autoCheck: true };
    }
  }
  function saveUpdateSettings() {
    localStorage.setItem("bakeryUpdateSettings", JSON.stringify({
      autoCheck: $("autoUpdateCheck") ? $("autoUpdateCheck").value === "true" : true
    }));
    toast("Preferencia de updates guardada");
  }
  function loadUpdateSettings() {
    var s = updateSettings();
    if ($("autoUpdateCheck")) $("autoUpdateCheck").value = String(s.autoCheck !== false);
    if ($("localVersionLabel")) $("localVersionLabel").textContent = APP_VERSION;
    renderUpdateStatus(JSON.parse(localStorage.getItem("bakeryLastUpdateCheck") || "null"));
  }
  function renderUpdateStatus(info) {
    if ($("localVersionLabel")) $("localVersionLabel").textContent = APP_VERSION;
    if (!info) {
      if ($("updateStatusLabel")) $("updateStatusLabel").textContent = "Sin revisar";
      if ($("updateDetailText")) $("updateDetailText").textContent = "Abrir con AppCajaPana.vbs o Abrir-AppCajaPana.bat para instalar updates automaticamente antes de entrar.";
      return;
    }
    if ($("updateStatusLabel")) $("updateStatusLabel").textContent = info.available ? "Update disponible" : (info.error ? "Error de conexion" : "Al dia");
    if ($("updateDetailText")) $("updateDetailText").textContent = info.message || "";
  }
  function compareVersions(a, b) {
    var aa = String(a || "0").split(".").map(Number);
    var bb = String(b || "0").split(".").map(Number);
    for (var i = 0; i < Math.max(aa.length, bb.length); i++) {
      var x = aa[i] || 0;
      var y = bb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }
  function checkForUpdates(silent) {
    var url = UPDATE_MANIFEST_URL + "?t=" + Date.now();
    if (!silent) toast("Buscando updates...");
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("No se encontro update.json en el repo");
      return res.json();
    }).then(function (remote) {
      var remoteVersion = remote.version || "0";
      var available = compareVersions(remoteVersion, APP_VERSION) > 0;
      var message = available
        ? "Version " + remoteVersion + " disponible. Local: " + APP_VERSION + ". " + (remote.notes || "")
        : "Version local " + APP_VERSION + " al dia. Ultima remota: " + remoteVersion + ".";
      var info = {
        checkedAt: nowIso(), available: available, version: remoteVersion, localVersion: APP_VERSION,
        downloadUrl: remote.downloadUrl || UPDATE_ZIP_URL, repoUrl: remote.repoUrl || UPDATE_REPO_URL,
        message: message
      };
      localStorage.setItem("bakeryLastUpdateCheck", JSON.stringify(info));
      renderUpdateStatus(info);
      if (available) openUpdateModal(info);
      else if (!silent) toast("App al dia");
      return info;
    }).catch(function (err) {
      var info = {
        checkedAt: nowIso(), available: false, error: true, localVersion: APP_VERSION,
        downloadUrl: UPDATE_ZIP_URL, repoUrl: UPDATE_REPO_URL,
        message: "No se pudo revisar GitHub: " + (err.message || "sin conexion")
      };
      localStorage.setItem("bakeryLastUpdateCheck", JSON.stringify(info));
      renderUpdateStatus(info);
      if (!silent) toast("No se pudo revisar updates");
      return info;
    });
  }
  function openUpdateModal(info) {
    info = info || JSON.parse(localStorage.getItem("bakeryLastUpdateCheck") || "null");
    if (!info || !info.available || !$("updateModal")) return;
    $("updateModalDetail").textContent = (info.message || "Hay una version nueva disponible.") + " Cerrar y volver a abrir con AppCajaPana.vbs para instalarla automaticamente.";
    $("updateModal").classList.remove("hidden");
  }
  function closeUpdateModal() {
    if ($("updateModal")) $("updateModal").classList.add("hidden");
  }
  function downloadUpdate() {
    var info = JSON.parse(localStorage.getItem("bakeryLastUpdateCheck") || "null") || {};
    window.open(info.downloadUrl || UPDATE_ZIP_URL, "_blank");
  }
  function openUpdateRepo() {
    var info = JSON.parse(localStorage.getItem("bakeryLastUpdateCheck") || "null") || {};
    window.open(info.repoUrl || UPDATE_REPO_URL, "_blank");
  }
  function updaterCommand() {
    return ".\\Update-AppCajaPana.bat";
  }
  function copyUpdaterCommand() {
    var text = updaterCommand();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast("Comando de updater copiado");
    }).catch(function () {
        toast("Abrir AppCajaPana.vbs para actualizar automaticamente");
      });
      return;
    }
    toast("Abrir AppCajaPana.vbs para actualizar automaticamente");
  }
  function defaultDevUiSettings() {
    return { density: "normal", theme: "green", motion: "on", performance: "normal", saleWidth: 520, shelfHeight: 180 };
  }
  function devUiSettings() {
    var defaults = defaultDevUiSettings();
    try {
      var saved = JSON.parse(localStorage.getItem("bakeryDevUiSettings") || "{}");
      Object.keys(defaults).forEach(function (k) { if (saved[k] === undefined || saved[k] === "") saved[k] = defaults[k]; });
      saved.saleWidth = Math.max(360, Math.min(760, Number(saved.saleWidth || defaults.saleWidth)));
      saved.shelfHeight = Math.max(120, Math.min(520, Number(saved.shelfHeight || defaults.shelfHeight)));
      return saved;
    } catch (e) {
      return defaults;
    }
  }
  function persistDevUiSettings(settings) {
    localStorage.setItem("bakeryDevUiSettings", JSON.stringify(settings));
  }
  function applyDevUiSettings(settings) {
    settings = settings || devUiSettings();
    document.body.classList.remove("ui-compact", "ui-roomy", "theme-green", "theme-warm", "theme-amber", "reduce-motion", "perf-legacy");
    document.body.classList.add("theme-" + (settings.theme || "green"));
    if (settings.density === "compact") document.body.classList.add("ui-compact");
    if (settings.density === "roomy") document.body.classList.add("ui-roomy");
    if (settings.motion === "reduced" || settings.performance === "legacy") document.body.classList.add("reduce-motion");
    if (settings.performance === "legacy") document.body.classList.add("perf-legacy");
    document.documentElement.style.setProperty("--sale-width", Number(settings.saleWidth || 520) + "px");
    document.documentElement.style.setProperty("--product-shelf-height", Number(settings.shelfHeight || 180) + "px");
    var layout = $("cashierLayout");
    if (layout) layout.style.setProperty("--sale-width", Number(settings.saleWidth || 520) + "px");
  }
  function isLegacyPerformance() {
    return devUiSettings().performance === "legacy";
  }
  function updateDevUiOutputs() {
    if ($("devSaleWidthValue")) $("devSaleWidthValue").textContent = ($("devSaleWidth").value || devUiSettings().saleWidth) + " px";
    if ($("devShelfHeightValue")) $("devShelfHeightValue").textContent = ($("devShelfHeight").value || devUiSettings().shelfHeight) + " px";
  }
  function loadDevUiSettings() {
    var s = devUiSettings();
    applyDevUiSettings(s);
    if ($("devDensity")) $("devDensity").value = s.density;
    if ($("devTheme")) $("devTheme").value = s.theme;
    if ($("devMotion")) $("devMotion").value = s.motion;
    if ($("devPerformance")) $("devPerformance").value = s.performance || "normal";
    if ($("devSaleWidth")) $("devSaleWidth").value = s.saleWidth;
    if ($("devShelfHeight")) $("devShelfHeight").value = s.shelfHeight;
    updateDevUiOutputs();
  }
  function collectDevUiSettings() {
    return {
      density: $("devDensity") ? $("devDensity").value : devUiSettings().density,
      theme: $("devTheme") ? $("devTheme").value : devUiSettings().theme,
      motion: $("devMotion") ? $("devMotion").value : devUiSettings().motion,
      performance: $("devPerformance") ? $("devPerformance").value : devUiSettings().performance,
      saleWidth: $("devSaleWidth") ? Number($("devSaleWidth").value) : devUiSettings().saleWidth,
      shelfHeight: $("devShelfHeight") ? Number($("devShelfHeight").value) : devUiSettings().shelfHeight
    };
  }
  function saveDevUiSettings(e) {
    if (e) e.preventDefault();
    var s = collectDevUiSettings();
    persistDevUiSettings(s);
    applyDevUiSettings(s);
    updateDevUiOutputs();
    toast("Configuracion UI guardada");
  }
  function previewDevUiSettings() {
    var s = collectDevUiSettings();
    applyDevUiSettings(s);
    updateDevUiOutputs();
  }
  function resetDevUiSettings() {
    var s = defaultDevUiSettings();
    persistDevUiSettings(s);
    loadDevUiSettings();
    toast("UI reseteada");
  }
  function resetTabOrder() {
    localStorage.removeItem("bakeryTabOrder");
    buildTabs();
    toast("Orden de tabs reseteado");
  }
  function callSupabaseFunction(name, body) {
    var s = integrationSettings();
    if (!s.supabaseUrl || !s.supabaseAnonKey) {
      toast("Configure Supabase en Dev");
      return Promise.reject(new Error("Supabase no configurado"));
    }
    return fetch(s.supabaseUrl + "/functions/v1/" + name, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + s.supabaseAnonKey
      },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Error de integracion");
        return data;
      });
    });
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
  function playTicketSound() {
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
      setTimeout(function () { ctx.close(); }, 180);
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
  function addMany(store, records) {
    records = records || [];
    if (!records.length) return Promise.resolve([]);
    return tx(store, "readwrite", function (os) {
      records.forEach(function (record) { os.put(record); });
      return records;
    });
  }
  function del(store, id) { return tx(store, "readwrite", function (os) { os.delete(id); return id; }); }
  function clearStore(store) { return tx(store, "readwrite", function (os) { os.clear(); return true; }); }
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
          ["admin", "Administrador", "admin"],
          ["dev", "Desarrollo", "dev"],
          ["turno_manana", "Turno Manana", "employee"],
          ["turno_tarde", "Turno Tarde", "employee"]
        ].forEach(function (u) {
          tasks.push(add("users", { id: uid(), username: u[0], displayName: u[1], role: u[2], password: "", active: true, createdAt: nowIso() }));
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
  function renderLoginUsers(preferredUsername) {
    var select = $("loginUser");
    if (!select) return Promise.resolve();
    var previous = preferredUsername || select.value || "turno_manana";
    return all("users").then(function (users) {
      users = users.filter(function (u) { return u.active !== false; });
      users.sort(function (a, b) {
        var order = { turno_manana: 0, turno_tarde: 1, admin: 2, dev: 3 };
        var ao = order[a.username] == null ? 10 : order[a.username];
        var bo = order[b.username] == null ? 10 : order[b.username];
        return ao - bo || String(a.displayName || a.username).localeCompare(String(b.displayName || b.username));
      });
      select.innerHTML = users.map(function (u) {
        return "<option value='" + escapeHtml(u.username) + "'>" + escapeHtml(u.displayName || u.username) + " (" + escapeHtml(u.username) + ")</option>";
      }).join("");
      var hasPrevious = users.some(function (u) { return u.username === previous; });
      var hasMorning = users.some(function (u) { return u.username === "turno_manana"; });
      select.value = hasPrevious ? previous : hasMorning ? "turno_manana" : (users[0] && users[0].username) || "";
    });
  }

  function login(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isLoggingIn) return;
    var username = $("loginUser").value.trim();
    var pass = $("loginPass").value.trim();
    setLoginStatus("");
    if (!username) { setLoginStatus("Seleccione usuario", "warn"); return; }
    if (!pass) { setLoginStatus("Ingrese una clave", "warn"); $("loginPass").focus(); return; }
    isLoggingIn = true;
    setLoginStatus("Ingresando...", "ok");
    var loginTimeout = setTimeout(function () {
      if (isLoggingIn) {
        isLoggingIn = false;
        setLoginStatus("El inicio tardo demasiado. Intente de nuevo.", "error");
      }
    }, 7000);
    all("users").then(function (users) {
      var user = users.filter(function (u) { return u.username === username && u.active; })[0];
      if (!user || (String(user.password || "") && String(user.password || "") !== pass)) {
        clearTimeout(loginTimeout);
        isLoggingIn = false;
        setLoginStatus("Usuario o clave incorrectos", "error");
        return;
      }
      var firstPasswordSetup = !String(user.password || "");
      if (firstPasswordSetup) {
        user.password = pass;
        user.updatedAt = nowIso();
      }
      currentUser = user;
      currentSession = {
        id: uid(), userId: user.id, username: user.username, displayName: user.displayName,
        role: user.role, loginTime: nowIso(), openingCash: parseMoney($("openingCash").value),
        businessDate: $("loginDate").value || today(), shiftType: $("loginShift").value
      };
      (firstPasswordSetup ? add("users", user) : Promise.resolve(user)).then(function () {
        return add("sessions", currentSession);
      }).then(function () {
        sessionStorage.setItem("bakerySession", JSON.stringify({ user: currentUser, session: currentSession }));
        return audit(firstPasswordSetup ? "PASSWORD_INITIALIZED" : "LOGIN", currentSession.shiftType + " caja inicial " + money(currentSession.openingCash));
      }).then(function () {
        clearTimeout(loginTimeout);
        showApp();
      });
    }).catch(function (err) {
      clearTimeout(loginTimeout);
      isLoggingIn = false;
      setLoginStatus("No se pudo iniciar sesion: " + (err && err.message ? err.message : "error local"), "error");
    });
  }
  function setLoginStatus(message, kind) {
    var node = $("loginStatus");
    if (!node) {
      if (message) toast(message);
      return;
    }
    node.textContent = message || "";
    node.className = "login-status " + (kind || "");
    if (message && kind !== "ok") toast(message);
  }
  function attachLoginHandlers() {
    var form = $("loginForm");
    var btn = $("loginSubmitBtn");
    if (form) form.onsubmit = login;
    if (btn) {
      btn.onclick = login;
      btn.addEventListener("click", login, false);
    }
  }
  window.forceLogin = function (e) {
    login(e || { preventDefault: function () {} });
  };

  function showApp() {
    isLoggingIn = false;
    setLoginStatus("");
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    $("sessionInfo").innerHTML = "Usuario: <b>" + currentUser.displayName + "</b> | Fecha: <b class='topbar-date'>" + currentSession.businessDate + "</b> | Turno: <b>" + currentSession.shiftType + "</b>";
    $("workDateInput").value = currentSession.businessDate;
    $("workShiftInput").value = currentSession.shiftType;
    setClosureContext(today(), currentSession.shiftType || "AM", true);
    $("workShiftBar").style.display = "none";
    buildTabs();
    setDates();
    loadIntegrationSettings();
    loadDevUiSettings();
    loadUpdateSettings();
    startMpSync();
    startDateSync();
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
  function isDev() { return currentUser && currentUser.role === "dev"; }
  function visibleTabs() {
    var tabs = isAdmin() ? ["Caja", "Cierres", "Metricas", "Produccion", "Movimientos", "Balance", "Usuarios"] : ["Caja", "Produccion"];
    if (isDev()) tabs = tabs.concat(["Actividad", "Dev"]);
    return orderedTabs(tabs);
  }
  function tabOrder() {
    try {
      var saved = JSON.parse(localStorage.getItem("bakeryTabOrder") || "[]");
      if (!Array.isArray(saved)) return [];
      saved = saved.filter(function (name) { return String(name).indexOf("__divider_") !== 0; });
      return saved;
    } catch (e) {
      return [];
    }
  }
  function insertOrderAfter(order, item, anchor) {
    var i = order.indexOf(anchor);
    if (i >= 0) order.splice(i + 1, 0, item);
    else order.push(item);
  }
  function orderedTabs(tabs) {
    var saved = tabOrder();
    return tabs.slice().sort(function (a, b) {
      var ia = saved.indexOf(a);
      var ib = saved.indexOf(b);
      if (ia < 0) ia = 999 + tabs.indexOf(a);
      if (ib < 0) ib = 999 + tabs.indexOf(b);
      return ia - ib;
    });
  }
  function saveTabOrder(names) {
    localStorage.setItem("bakeryTabOrder", JSON.stringify(names));
  }
  function buildTabs() {
    var tabs = visibleTabs();
    if (tabs.indexOf(currentTab) < 0) currentTab = "Caja";
    var labels = {Metricas: "Metricas", Produccion: "Produccion"};
    $("tabs").innerHTML = "";
    tabs.forEach(function (name) {
      var btn = document.createElement("button");
      btn.textContent = labels[name] || name;
      btn.className = name === currentTab ? "active" : "";
      btn.dataset.tab = name;
      btn.draggable = isAdmin();
      btn.onclick = function () {
        if (tabJustDragged) {
          tabJustDragged = false;
          return;
        }
        switchTab(name);
      };
      if (isAdmin()) {
        btn.ondragstart = function (e) {
          draggedTab = name;
          btn.classList.add("dragging");
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        };
        btn.ondragend = function () {
          draggedTab = "";
          btn.classList.remove("dragging");
          tabJustDragged = true;
          setTimeout(function () { tabJustDragged = false; }, 120);
          document.querySelectorAll("#tabs [data-tab]").forEach(function (b) { b.classList.remove("drop-target"); });
        };
        btn.ondragover = function (e) {
          e.preventDefault();
          if (draggedTab && draggedTab !== name) btn.classList.add("drop-target");
        };
        btn.ondragleave = function () { btn.classList.remove("drop-target"); };
        btn.ondrop = function (e) {
          e.preventDefault();
          btn.classList.remove("drop-target");
          if (!draggedTab || draggedTab === name) return;
          reorderTabs(draggedTab, name);
        };
      }
      $("tabs").appendChild(btn);
    });
  }
  function reorderTabs(from, to) {
    var visible = Array.prototype.slice.call(document.querySelectorAll("#tabs [data-tab]")).map(function (b) { return b.dataset.tab; });
    var allKnown = ["Caja", "Cierres", "Metricas", "Produccion", "Movimientos", "Balance", "Actividad", "Usuarios", "Dev"];
    var order = tabOrder().length ? tabOrder().filter(function (x) { return allKnown.indexOf(x) >= 0; }) : allKnown.slice();
    allKnown.forEach(function (x) { if (order.indexOf(x) < 0) order.push(x); });
    var scoped = visible.slice();
    var fromIndex = scoped.indexOf(from);
    var toIndex = scoped.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return;
    scoped.splice(fromIndex, 1);
    scoped.splice(toIndex, 0, from);
    order = scoped.concat(order.filter(function (x) { return scoped.indexOf(x) < 0; }));
    saveTabOrder(order);
    buildTabs();
    toast("Orden de tabs actualizado");
  }
  function switchTab(name) {
    if (visibleTabs().indexOf(name) < 0) name = "Caja";
    currentTab = name;
    document.querySelectorAll(".tab-page").forEach(function (p) { p.classList.add("hidden"); });
    $("tab" + name).classList.remove("hidden");
    buildTabs();
    renderAll();
  }
  function setDates() {
    if ($("loginDate")) $("loginDate").value = today();
    ["monthlyDate", "productionDate", "productionFilterDate"].forEach(function (id) { if ($(id)) $(id).value = today(); });
    $("monthPicker").value = monthKey(today());
  }
  function startDateSync() {
    clearInterval(dateSyncTimer);
    dateSyncTimer = setInterval(function () {
      syncSessionDateIfChanged();
      var mk = monthKey(today());
      if ($("monthPicker") && currentTab === "Balance" && !$("monthPicker").value) $("monthPicker").value = mk;
      if ($("monthlyDate") && !$("monthlyDate").value) $("monthlyDate").value = today();
      if (currentTab === "Balance" && $("monthPicker") && $("monthPicker").value !== mk && new Date().getHours() === 0) {
        $("monthPicker").value = mk;
        renderMonthly();
      }
    }, 3600000);
  }
  function syncSessionDateIfChanged() {
    if (!currentSession || !currentUser) return false;
    var currentDate = today();
    if (currentSession.businessDate === currentDate) return false;
    currentSession.businessDate = currentDate;
    sessionStorage.setItem("bakerySession", JSON.stringify({ user: currentUser, session: currentSession }));
    if ($("sessionInfo")) $("sessionInfo").innerHTML = "Usuario: <b>" + currentUser.displayName + "</b> | Fecha: <b class='topbar-date'>" + currentSession.businessDate + "</b> | Turno: <b>" + currentSession.shiftType + "</b>";
    if ($("workDateInput")) $("workDateInput").value = currentSession.businessDate;
    setClosureContext(currentDate, currentSession.shiftType || "AM", true);
    add("sessions", currentSession).then(function () { return audit("BUSINESS_DATE_AUTO_CHANGED", currentDate); });
    return true;
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
  function saveSale(amount, mode, details, extra) {
    if (isSubmittingSale) return Promise.resolve();
    if (Date.now() - lastSaleAt < 900) return Promise.resolve();
    extra = extra || {};
    var method = extra.paymentMethodOverride || PAYMENT;
    amount = Number(amount || 0);
    if (amount <= 0) { toast("Ingrese un monto valido"); return Promise.resolve(); }
    setSubmitting(true);
    lastSaleAt = Date.now();
    clearTimeout(autoSaleTimer);
    clearTimeout(autoTicketTimer);
    playSound();
    var tr = {
      id: uid(), type: "SALE", amount: amount, paymentMethod: method, businessDate: currentSession.businessDate,
      shiftType: currentSession.shiftType, userId: currentUser.id, sessionId: currentSession.id,
      createdAt: nowIso(), deleted: false, saleMode: mode || "FAST",
      transferStatus: method === "Transferencia" ? "PENDING" : ""
    };
    Object.keys(extra).forEach(function (k) {
      if (k !== "paymentMethodOverride") tr[k] = extra[k];
    });
    return add("transactions", tr).then(function () {
      if (details && details.length) {
        var basketId = uid();
        tr.basketId = basketId;
        return add("transactions", tr).then(function () {
          return add("baskets", { id: basketId, createdAt: nowIso(), userId: currentUser.id, total: amount, paymentMethod: method, transactionId: tr.id });
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
      return audit("SALE_CREATED", money(amount) + " " + method + " " + (mode || "FAST"), amount > 60000 ? "warning" : "normal");
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
  function saveExternalSale(amount, method, mode, details, extra) {
    amount = Number(amount || 0);
    if (amount <= 0) { toast("Ticket vacio"); return Promise.reject(new Error("Ticket vacio")); }
    var tr = {
      id: uid(), type: "SALE", amount: amount, paymentMethod: method, businessDate: currentSession.businessDate,
      shiftType: currentSession.shiftType, userId: currentUser.id, sessionId: currentSession.id,
      createdAt: nowIso(), deleted: false, saleMode: mode || "EXTERNAL"
    };
    Object.keys(extra || {}).forEach(function (k) { tr[k] = extra[k]; });
    return add("transactions", tr).then(function () {
      if (details && details.length) {
        var basketId = uid();
        tr.basketId = basketId;
        return add("transactions", tr).then(function () {
          return add("baskets", { id: basketId, createdAt: nowIso(), userId: currentUser.id, total: amount, paymentMethod: method, transactionId: tr.id });
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
      return audit("SALE_CREATED", money(amount) + " " + method + " " + (mode || "EXTERNAL"), "normal");
    }).then(function () {
      basket = [];
      if ($("ticketPaid")) $("ticketPaid").value = "";
      renderAll();
      return tr;
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
        return t.type === "SALE" && t.sessionId === currentSession.id;
      }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      if (!sales[0]) { toast("No hay venta para deshacer"); return; }
      if (sales[0].deleted) { toast("La ultima venta ya fue deshecha"); return; }
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
    syncSessionDateIfChanged();
    if ($("quickButtons")) $("quickButtons").innerHTML = quickButtons.map(function (v) {
      return "<button type='button' data-sale='" + v + "'>" + money(v) + "</button>";
    }).join("");
    all("transactions").then(function (trs) {
      var activeDate = currentSession && currentSession.businessDate || today();
      var sales = trs.filter(function (t) { return t.type === "SALE" && !t.deleted && t.businessDate === activeDate; })
        .sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).slice(0, 10);
      $("lastSales").innerHTML = sales.length ? sales.map(function (s) {
        var status = transferStatusHtml(s);
        return card("<div class='last-sale-row'><b>" + new Date(s.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + "</b><span>" + s.paymentMethod + "</span>" + status + "<strong>" + money(s.amount) + "</strong></div>");
      }).join("") : empty("Sin ventas todavia");
      document.querySelectorAll("[data-transfer-received]").forEach(function (btn) {
        btn.onclick = function () { markTransferReceived(btn.dataset.transferReceived); };
      });
    });
    renderBasket();
    renderProducts();
  }
  function transferStatusHtml(sale) {
    if (sale.paymentMethod !== "Transferencia") return "<i class='transfer-status empty-status'></i>";
    var status = sale.transferStatus || "PENDING";
    if (status === "RECEIVED") return "<i class='transfer-status received'>Recibida</i>";
    if (status === "REVIEW") return "<i class='transfer-status review'>Revisar</i>";
    return "<button type='button' class='transfer-status pending' data-transfer-received='" + sale.id + "'>Pendiente</button>";
  }
  function markTransferReceived(id) {
    all("transactions").then(function (trs) {
      var sale = trs.filter(function (t) {
        return t.id === id && t.type === "SALE" && !t.deleted && t.paymentMethod === "Transferencia";
      })[0];
      if (!sale) { toast("Transferencia no encontrada"); return; }
      sale.transferStatus = "RECEIVED";
      sale.transferReceivedAt = nowIso();
      sale.transferReceivedBy = currentUser && currentUser.username;
      add("transactions", sale).then(function () {
        return audit("TRANSFER_RECEIVED", money(sale.amount) + " confirmada por " + (currentUser && currentUser.username), "normal");
      }).then(function () {
        renderAll();
        if (!$("reviewTransfersModal").classList.contains("hidden")) renderReviewTransfersList();
        toast("Transferencia marcada como recibida");
      });
    });
  }
  function openReviewTransfersModal() {
    $("reviewTransfersModal").classList.remove("hidden");
    renderReviewTransfersList();
  }
  function closeReviewTransfersModal() {
    $("reviewTransfersModal").classList.add("hidden");
  }
  function renderReviewTransfersList() {
    activeTransactions().then(function (trs) {
      var rows = trs.filter(function (t) {
        return t.type === "SALE"
          && t.paymentMethod === "Transferencia"
          && t.businessDate === activeClosureDate()
          && (activeClosureShift() === "AMBOS" ? (inferredShift(t) === "AM" || inferredShift(t) === "PM") : inferredShift(t) === activeClosureShift())
          && (t.transferStatus || "PENDING") !== "RECEIVED";
      }).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      $("reviewTransfersList").innerHTML = rows.length ? rows.map(function (t) {
        var status = t.transferStatus === "REVIEW" ? "Revisar" : "Pendiente";
        return "<div class='review-transfer-row'>"
          + "<div><b>" + new Date(t.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) + "</b><span>" + escapeHtml(t.saleMode || "Venta") + "</span></div>"
          + "<strong>" + money(t.amount) + "</strong>"
          + "<button type='button' class='transfer-status pending' data-transfer-received='" + t.id + "'>" + status + "</button>"
          + "</div>";
      }).join("") : empty("No hay transferencias pendientes");
      document.querySelectorAll("#reviewTransfersList [data-transfer-received]").forEach(function (btn) {
        btn.onclick = function () { markTransferReceived(btn.dataset.transferReceived); };
      });
    });
  }
  function startMpSync() {
    clearInterval(mpSyncTimer);
    syncMercadoPagoStatuses();
    mpSyncTimer = setInterval(syncMercadoPagoStatuses, isLegacyPerformance() ? 30000 : 8000);
  }
  function syncMercadoPagoStatuses() {
    var s = integrationSettings();
    if (!s.supabaseUrl || !s.supabaseAnonKey || !currentUser) return;
    all("transactions").then(function (trs) {
      var refs = trs.filter(function (t) {
        return t.type === "SALE" && !t.deleted && t.mpExternalReference && t.transferStatus === "PENDING";
      }).map(function (t) { return t.mpExternalReference; });
      if (!refs.length) return;
      return callSupabaseFunction("mp-status", { externalReferences: refs }).then(function (data) {
        var byRef = {};
        (data.sales || []).forEach(function (row) { byRef[row.external_reference] = row; });
        return Promise.all(trs.map(function (t) {
          var row = byRef[t.mpExternalReference];
          if (!row || t.transferStatus !== "PENDING") return Promise.resolve();
          if (row.status === "approved") t.transferStatus = "RECEIVED";
          else if (row.status === "rejected" || row.status === "cancelled") t.transferStatus = "REVIEW";
          else return Promise.resolve();
          t.mpPaymentId = row.payment_id || t.mpPaymentId;
          t.transferReceivedAt = row.approved_at || t.transferReceivedAt;
          return add("transactions", t).then(function () {
            return audit("MP_STATUS_SYNCED", money(t.amount) + " " + t.transferStatus, t.transferStatus === "REVIEW" ? "warning" : "normal");
          });
        })).then(renderAll);
      }).catch(function () {});
    });
  }
  function checkoutMercadoPago() {
    var total = basket.reduce(function (a, b) { return a + b.subtotal; }, 0);
    if (total <= 0) { toast("Ticket vacio"); return; }
    var externalReference = uid();
    var details = basket.slice();
    callSupabaseFunction("create-mp-preference", {
      externalReference: externalReference,
      amount: total,
      businessDate: currentSession.businessDate,
      shiftType: currentSession.shiftType,
      items: details.map(function (it) {
        return { title: it.productName, quantity: Number(it.quantity || 1), unit_price: Number(it.unitPrice || it.subtotal || 0) };
      })
    }).then(function (pref) {
      return saveExternalSale(total, "Transferencia", "MERCADO_PAGO", details, {
        transferStatus: "PENDING",
        mpExternalReference: externalReference,
        mpPreferenceId: pref.preferenceId || ""
      }).then(function () {
        toast("Pago Mercado Pago pendiente");
        startMpSync();
        var url = pref.initPoint || pref.sandboxInitPoint;
        if (url) window.open(url, "_blank", "noopener");
      });
    }).catch(function (err) {
      toast(err.message || "No se pudo crear pago Mercado Pago");
    });
  }
  function renderBasket() {
    var total = basket.reduce(function (a, b) { return a + b.subtotal; }, 0);
    if ($("basketTotal")) $("basketTotal").textContent = money(total);
    if ($("ticketChange")) $("ticketChange").textContent = money(parseMoney($("ticketPaid") && $("ticketPaid").value) - total);
    $("basketItems").innerHTML = basket.length ? basket.map(function (it, i) {
      return "<div class='compact-row ticket-line'><span><b>" + escapeHtml(it.productName) + "</b><small>" + it.quantity + " " + escapeHtml(it.unitType || "") + " x " + money(it.unitPrice) + "</small></span><strong>" + money(it.subtotal) + "</strong><button class='small danger' data-remove-basket='" + i + "'>x</button></div>";
    }).join("") : empty("Ticket vacio");
    document.querySelectorAll("[data-remove-basket]").forEach(function (b) {
      b.onclick = function () { basket.splice(Number(b.dataset.removeBasket), 1); renderBasket(); };
    });
    clearTimeout(autoTicketTimer);
  }
  function chargeBasket() {
    var total = basket.reduce(function (a, b) { return a + b.subtotal; }, 0);
    if (total <= 0) { toast("Ticket vacio"); return; }
    var paid = parseMoney($("ticketPaid") && $("ticketPaid").value);
    var ticketMethod = $("ticketPaymentSelect") ? $("ticketPaymentSelect").value : PAYMENT;
    saveSale(total, "PRODUCT_BASKET", basket.slice(), {
      paymentMethodOverride: ticketMethod,
      paidAmount: paid || 0,
      changeAmount: paid ? paid - total : 0,
      itemCount: basket.length
    });
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
  function unitSize(unit) {
    unit = String(unit || "unidad").toLowerCase();
    if (unit === "kg") return { group: "weight", size: 1000 };
    if (unit === "gr") return { group: "weight", size: 1 };
    if (unit === "docena") return { group: "count", size: 12 };
    if (unit === "unidad" || unit === "cantidad") return { group: "count", size: 1 };
    if (unit === "litro") return { group: "volume", size: 1000 };
    return { group: unit, size: 1 };
  }
  function priceForSaleUnit(price, priceUnit, saleUnit) {
    var from = unitSize(priceUnit);
    var to = unitSize(saleUnit);
    if (from.group !== to.group) return Number(price || 0);
    return Number(price || 0) * to.size / from.size;
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
  function productCategory(product) {
    return String(product && product.category || "General").trim() || "General";
  }
  function productCategories(products) {
    var seen = {};
    products.forEach(function (p) { seen[productCategory(p)] = true; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
  }
  function setProductCategory(category) {
    activeProductCategory = category || "Todos";
    localStorage.setItem("bakeryActiveProductCategory", activeProductCategory);
    renderProducts();
  }
  function renderProductCategories(products) {
    if (!$("productCategoryBar")) return;
    var categories = productCategories(products);
    if (activeProductCategory !== "Todos" && categories.indexOf(activeProductCategory) < 0) activeProductCategory = "Todos";
    var items = ["Todos"].concat(categories);
    $("productCategoryBar").innerHTML = items.map(function (cat) {
      var count = cat === "Todos" ? products.length : products.filter(function (p) { return productCategory(p) === cat; }).length;
      return "<button type='button' class='" + (activeProductCategory === cat ? "active" : "") + "' data-product-category='" + escapeHtml(cat) + "'><b>" + escapeHtml(cat) + "</b><small>" + count + "</small></button>";
    }).join("");
    document.querySelectorAll("[data-product-category]").forEach(function (btn) {
      btn.onclick = function () { setProductCategory(btn.dataset.productCategory || "Todos"); };
    });
  }
  function renderProducts() {
    all("products").then(function (products) {
      products = products.filter(function (p) { return p.active; }).sort(function (a, b) {
        return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name).localeCompare(String(b.name));
      });
      renderProductCategories(products);
      var visibleProducts = activeProductCategory === "Todos" ? products : products.filter(function (p) {
        return productCategory(p) === activeProductCategory;
      });
      $("productGrid").innerHTML = visibleProducts.map(function (p) {
        return "<button class='product-card' type='button' draggable='true' data-product='" + p.id + "'>" + productImage(p) + "<b>" + escapeHtml(p.name) + "</b><small>" + money(p.price) + " / " + escapeHtml(p.priceUnit || p.unitType) + "</small></button>";
      }).join("") + (isAdmin() ? "<button class='product-card product-edit-card' id='openProductEditorBtn' type='button'><span class='product-img'>EDIT</span><b>Editar</b><small>Categorias y productos</small></button>" : "");
      document.querySelectorAll("[data-product]").forEach(function (btn) {
        btn.onclick = function () {
          if (btn.dataset.dragging === "1") { btn.dataset.dragging = "0"; return; }
          var p = visibleProducts.filter(function (x) { return x.id === btn.dataset.product; })[0];
          openProductModal(p);
        };
        btn.oncontextmenu = function (e) {
          if (!isAdmin()) return;
          e.preventDefault();
          var p = visibleProducts.filter(function (x) { return x.id === btn.dataset.product; })[0];
          if (p) openProductContextMenu(e, p);
        };
      });
      bindProductDrag(visibleProducts);
      if ($("openProductEditorBtn")) $("openProductEditorBtn").onclick = openProductEditor;
    });
  }
  function openProductContextMenu(e, product) {
    closeProductContextMenu();
    var menu = document.createElement("div");
    menu.id = "productContextMenu";
    menu.className = "product-context-menu";
    menu.innerHTML = "<button type='button' data-action='edit'>Editar</button><button type='button' class='danger' data-action='delete'>Borrar</button>";
    document.body.appendChild(menu);
    var x = Math.min(e.clientX || 0, window.innerWidth - 150);
    var y = Math.min(e.clientY || 0, window.innerHeight - 92);
    menu.style.left = Math.max(6, x) + "px";
    menu.style.top = Math.max(6, y) + "px";
    menu.querySelector("[data-action='edit']").onclick = function () {
      closeProductContextMenu();
      openProductForm(product);
    };
    menu.querySelector("[data-action='delete']").onclick = function () {
      closeProductContextMenu();
      deleteProduct(product);
    };
  }
  function closeProductContextMenu() {
    var menu = $("productContextMenu");
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
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
    $("productQuantityInput").value = "";
    $("productQuantityLabel").firstChild.nodeValue = "Cantidad en " + (product.unitType || "unidad") + " ";
    $("productModal").classList.remove("hidden");
    updateProductModalTotal();
    setTimeout(function () {
      $("productQuantityInput").focus();
      $("productQuantityInput").select();
    }, 0);
  }
  function closeProductModal() {
    $("productModal").classList.add("hidden");
    selectedProduct = null;
  }
  function updateProductModalTotal() {
    if (!selectedProduct) return;
    var price = parseMoney($("productPriceInput").value);
    var unitPrice = priceForSaleUnit(price, selectedProduct.priceUnit || selectedProduct.unitType, selectedProduct.unitType);
    var total = unitPrice * parseMoney($("productQuantityInput").value);
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
    var unitPrice = priceForSaleUnit(price, selectedProduct.priceUnit, selectedProduct.unitType);
    add("products", selectedProduct);
    return {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: q,
      unitType: selectedProduct.unitType,
      unitPrice: unitPrice,
      subtotal: Math.round(q * unitPrice * 100) / 100,
      priceUnit: selectedProduct.priceUnit,
      baseUnitPrice: price
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
    playTicketSound();
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
  }
  function openProductEditor() {
    $("productEditorModal").classList.remove("hidden");
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
    cropImage = null;
    cropImageData = "";
    $("cropEditor").classList.add("hidden");
    $("cropPreview").innerHTML = "";
    $("cropZoom").value = "1";
    $("cropX").value = "50";
    $("cropY").value = "50";
    $("productFormTitle").textContent = "Nuevo producto";
  }
  function openProductForm(product) {
    resetProductEditorForm();
    if (product) {
      $("editProductId").value = product.id;
      $("editProductName").value = product.name || "";
      $("editProductUnit").value = product.unitType || product.priceUnit || "unidad";
      $("editProductPrice").value = String(product.price || "");
      $("editProductPriceUnit").value = product.priceUnit || product.unitType || "unidad";
      $("editProductCategory").value = product.category || "";
      editImageData = product.imageData || "";
      $("productFormTitle").textContent = "Editar producto";
      if (editImageData) showCropImage(editImageData);
    }
    $("productFormModal").classList.remove("hidden");
    $("editProductName").focus();
  }
  function closeProductForm() {
    $("productFormModal").classList.add("hidden");
  }
  function renderProductEditor() {
    all("products").then(function (products) {
      editorProducts = products.filter(function (p) { return p.active; });
      $("productEditorList").innerHTML = editorProducts.length ? editorProducts.map(function (p) {
        return "<div class='editor-product-row'><div>" + productImage(p) + "</div><span><b>" + escapeHtml(p.name) + "</b><small><i>" + escapeHtml(productCategory(p)) + "</i> | " + money(p.price) + " / " + escapeHtml(p.priceUnit || p.unitType) + " | vendido por " + escapeHtml(p.unitType) + "</small></span><button type='button' data-edit-product='" + p.id + "'>Editar</button><button class='danger' type='button' data-delete-product='" + p.id + "'>Borrar</button></div>";
      }).join("") : empty("Sin productos");
      document.querySelectorAll("[data-edit-product]").forEach(function (btn) {
        btn.onclick = function () {
          var p = editorProducts.filter(function (x) { return x.id === btn.dataset.editProduct; })[0];
          if (!p) return;
          openProductForm(p);
        };
      });
      document.querySelectorAll("[data-delete-product]").forEach(function (btn) {
        btn.onclick = function () {
          var p = editorProducts.filter(function (x) { return x.id === btn.dataset.deleteProduct; })[0];
          deleteProduct(p);
        };
      });
    });
  }
  function deleteProduct(product) {
    if (!product || !confirm("Borrar " + product.name + "?")) return;
    product.active = false;
    product.updatedAt = nowIso();
    add("products", product).then(function () {
      renderProducts();
      renderProductEditor();
      toast("Producto borrado");
    });
  }
  function saveProductEditor(e) {
    e.preventDefault();
    var name = $("editProductName").value.trim();
    var price = parseMoney($("editProductPrice").value);
    if (!name || price <= 0) { toast("Complete nombre y precio"); return; }
    if (cropImage) editImageData = buildCroppedImage();
    var id = $("editProductId").value || uid();
    var existing = editorProducts.filter(function (p) { return p.id === id; })[0] || {};
    var priceUnit = $("editProductPriceUnit").value;
    var unitType = $("editProductUnit").value;
    var product = {
      id: id,
      name: name,
      price: price,
      unitType: unitType,
      priceUnit: priceUnit,
      category: $("editProductCategory").value.trim() || "General",
      imageData: editImageData || existing.imageData || "",
      active: true,
      sortOrder: existing.sortOrder == null ? editorProducts.length : existing.sortOrder,
      createdAt: existing.createdAt || nowIso(),
      updatedAt: nowIso()
    };
    add("products", product).then(function () {
      resetProductEditorForm();
      closeProductForm();
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
    reader.onload = function () { showCropImage(String(reader.result || "")); };
    reader.readAsDataURL(file);
  }
  function showCropImage(dataUrl) {
    cropImageData = dataUrl;
    cropImage = new Image();
    cropImage.onload = function () {
      $("cropZoom").value = "1";
      $("cropX").value = "50";
      $("cropY").value = "50";
      $("cropEditor").classList.remove("hidden");
      updateCropPreview();
    };
    cropImage.src = dataUrl;
  }
  function updateCropPreview() {
    if (!cropImage) return;
    $("cropPreview").innerHTML = "<img src='" + escapeHtml(buildCroppedImage(360)) + "' alt=''><span>Arrastre para elegir el corte</span>";
  }
  function buildCroppedImage(outputSize) {
    if (!cropImage) return editImageData;
    var canvas = document.createElement("canvas");
    var size = outputSize || 480;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    var zoom = Number($("cropZoom").value || 1);
    var shiftX = Number($("cropX").value || 50) / 100;
    var shiftY = Number($("cropY").value || 50) / 100;
    var base = Math.min(cropImage.naturalWidth, cropImage.naturalHeight) / zoom;
    var sx = (cropImage.naturalWidth - base) * shiftX;
    var sy = (cropImage.naturalHeight - base) * shiftY;
    sx = Math.max(0, Math.min(cropImage.naturalWidth - base, sx));
    sy = Math.max(0, Math.min(cropImage.naturalHeight - base, sy));
    ctx.drawImage(cropImage, sx, sy, base, base, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.86);
  }
  function startCropDrag(e) {
    if (!cropImage || !$("cropPreview")) return;
    if (e && e.preventDefault) e.preventDefault();
    var p = eventPoint(e);
    cropDrag = {
      startX: p.x,
      startY: p.y,
      valueX: Number($("cropX").value || 50),
      valueY: Number($("cropY").value || 50),
      width: Math.max(1, $("cropPreview").clientWidth || 240),
      height: Math.max(1, $("cropPreview").clientHeight || 240)
    };
    document.body.classList.add("cropping-image");
  }
  function moveCropDrag(e) {
    if (!cropDrag) return;
    if (e && e.preventDefault) e.preventDefault();
    var p = eventPoint(e);
    var nextX = cropDrag.valueX - ((p.x - cropDrag.startX) / cropDrag.width) * 100;
    var nextY = cropDrag.valueY - ((p.y - cropDrag.startY) / cropDrag.height) * 100;
    $("cropX").value = String(Math.max(0, Math.min(100, Math.round(nextX))));
    $("cropY").value = String(Math.max(0, Math.min(100, Math.round(nextY))));
    updateCropPreview();
  }
  function stopCropDrag() {
    cropDrag = null;
    document.body.classList.remove("cropping-image");
  }

  function activeTransactions() {
    return all("transactions").then(function (trs) { return trs.filter(function (t) { return !t.deleted; }); });
  }
  function inferredBusinessDate(t) {
    return t.businessDate || String(t.createdAt || nowIso()).slice(0, 10);
  }
  function inferredShift(t) {
    if (t.shiftType === "AM" || t.shiftType === "PM") return t.shiftType;
    var u = String(t.username || t.userName || "").toLowerCase();
    if (u.indexOf("tarde") >= 0 || u.indexOf("pm") >= 0) return "PM";
    if (u.indexOf("manana") >= 0 || u.indexOf("mañana") >= 0 || u.indexOf("am") >= 0) return "AM";
    var d = new Date(t.createdAt || nowIso());
    var minutes = d.getHours() * 60 + d.getMinutes();
    if (minutes >= 390 && minutes < 840) return "AM";
    if (minutes >= 840 && minutes <= 1260) return "PM";
    return "AM";
  }
  function shiftTimeLabel(shift) {
    if (shift === "AMBOS") return "06:30 - 21:00";
    return shift === "PM" ? "14:00 - 21:00" : "06:30 - 14:00";
  }
  function activeClosureDate() {
    return closureDate || today();
  }
  function activeClosureShift() {
    return closureShift || (currentSession && currentSession.shiftType) || "AM";
  }
  function zeroClosureTotals() {
    return {
      shift: [], sales: [], cashSales: 0, receivedTransfers: 0, expectedTransfer: 0,
      pendingTransfers: 0, reviewTransfers: 0, reviewTotal: 0, withdrawals: 0,
      expectedCash: 0, totalSales: 0
    };
  }
  function closureIsComplete(closures, date, shift) {
    return closures.some(function (c) {
      if ((c.closureKind || "COMPLETE") !== "COMPLETE" || c.businessDate !== date) return false;
      if (c.shiftType === "AMBOS") return shift === "AM" || shift === "PM" || shift === "AMBOS";
      if (shift === "AMBOS") return false;
      return c.shiftType === shift;
    });
  }
  function closureOpeningCash(sessions, date, selectedShift) {
    sessions = sessions || [];
    var byShift = {};
    sessions.forEach(function (s) {
      if (s.businessDate !== date) return;
      var sShift = s.shiftType || inferredShift(s);
      if (selectedShift !== "AMBOS" && sShift !== selectedShift) return;
      if (selectedShift === "AMBOS" && sShift !== "AM" && sShift !== "PM") return;
      if (!byShift[sShift] || String(s.loginTime || s.createdAt || "").localeCompare(String(byShift[sShift].loginTime || byShift[sShift].createdAt || "")) > 0) {
        byShift[sShift] = s;
      }
    });
    var amount = Object.keys(byShift).reduce(function (total, shift) {
      return total + Number(byShift[shift].openingCash || 0);
    }, 0);
    if (amount || !currentSession) return amount;
    if (currentSession.businessDate === date && (selectedShift === currentSession.shiftType || selectedShift === "AMBOS")) return Number(currentSession.openingCash || 0);
    return 0;
  }
  function pendingClosureMap(trs, closures) {
    var map = {};
    missingClosureRows(trs, closures).forEach(function (r) {
      if (!map[r.date]) map[r.date] = [];
      if (map[r.date].indexOf(r.shift) < 0) map[r.date].push(r.shift);
    });
    Object.keys(map).forEach(function (date) {
      map[date].sort();
    });
    return map;
  }
  function setClosureContext(date, shift, resetForm) {
    closureDate = date || today();
    closureShift = shift || activeClosureShift();
    if ($("closureDateSelect")) $("closureDateSelect").value = closureDate;
    if ($("closureShiftSelect")) $("closureShiftSelect").value = closureShift;
    if (resetForm && $("closureForm")) {
      $("closureForm").reset();
      $("countedCash").value = "0";
      $("countedTransfer").value = "0";
    }
  }
  function renderClosureSelectors(trs, closures) {
    var dateSelect = $("closureDateSelect");
    var shiftSelect = $("closureShiftSelect");
    if (!dateSelect || !shiftSelect) return;
    var pending = pendingClosureMap(trs, closures);
    if (!closureDate) closureDate = today();
    if (!closureShift) closureShift = (currentSession && currentSession.shiftType) || "AM";
    var dates = Object.keys(pending);
    if (dates.indexOf(today()) < 0) dates.unshift(today());
    dates = dates.filter(function (date, index) { return dates.indexOf(date) === index; }).sort(function (a, b) {
      if (a === today()) return -1;
      if (b === today()) return 1;
      return b.localeCompare(a);
    });
    if (dates.indexOf(closureDate) < 0) closureDate = today();
    dateSelect.innerHTML = dates.map(function (date) {
      var label = date === today() ? date + " (hoy)" : date;
      var shifts = pending[date] && pending[date].length ? " - pendiente " + pending[date].join("/") : " - sin pendiente";
      return "<option value='" + escapeHtml(date) + "'>" + escapeHtml(label + shifts) + "</option>";
    }).join("");
    dateSelect.value = closureDate;
    var shiftsForDate = pending[closureDate] && pending[closureDate].length ? pending[closureDate].slice() : [closureShift || "AM"];
    if (shiftsForDate.length > 1 && shiftsForDate.indexOf("AMBOS") < 0) shiftsForDate.push("AMBOS");
    if (shiftsForDate.indexOf(closureShift) < 0) closureShift = shiftsForDate[0] || "AM";
    shiftSelect.innerHTML = shiftsForDate.map(function (shift) {
      return "<option value='" + shift + "'>" + (shift === "AMBOS" ? "AM + PM" : shift + " - " + (shift === "PM" ? "Tarde" : "Manana")) + "</option>";
    }).join("");
    shiftSelect.value = closureShift;
  }
  function closureTotals(trs, date, selectedShift, closures, sessions) {
    date = date || activeClosureDate();
    selectedShift = selectedShift || activeClosureShift();
    if (closures && closureIsComplete(closures, date, selectedShift)) return zeroClosureTotals();
    var rows = trs.filter(function (t) {
      if (t.businessDate !== date) return false;
      var tShift = inferredShift(t);
      return selectedShift === "AMBOS" ? (tShift === "AM" || tShift === "PM") : tShift === selectedShift;
    });
    var sales = rows.filter(function (t) { return t.type === "SALE"; });
    var cashSales = sum(rows, function (t) { return t.type === "SALE" && t.paymentMethod === "Efectivo"; });
    var receivedTransfers = sum(rows, function (t) {
      return t.type === "SALE" && t.paymentMethod === "Transferencia" && t.transferStatus === "RECEIVED";
    });
    var pendingTransfers = sum(rows, function (t) {
      return t.type === "SALE" && t.paymentMethod === "Transferencia" && (t.transferStatus || "PENDING") === "PENDING";
    });
    var reviewTransfers = sum(rows, function (t) {
      return t.type === "SALE" && t.paymentMethod === "Transferencia" && t.transferStatus === "REVIEW";
    });
    var withdrawals = sum(rows, function (t) { return t.type === "WITHDRAWAL"; });
    var expectedCash = closureOpeningCash(sessions, date, selectedShift) + cashSales - withdrawals;
    return {
      shift: rows,
      sales: sales,
      cashSales: cashSales,
      receivedTransfers: receivedTransfers,
      expectedTransfer: receivedTransfers,
      pendingTransfers: pendingTransfers,
      reviewTransfers: reviewTransfers,
      reviewTotal: pendingTransfers + reviewTransfers,
      withdrawals: withdrawals,
      expectedCash: expectedCash,
      totalSales: sum(sales, function () { return true; })
    };
  }
  function updateClosureDiffs() {
    if (!closureSnapshot || !$("cashDiff")) return;
    var cashDiff = parseMoney($("countedCash").value) - closureSnapshot.expectedCash;
    var transferDiff = parseMoney($("countedTransfer").value) - closureSnapshot.expectedTransfer;
    $("cashDiff").textContent = money(cashDiff);
    $("transferDiff").textContent = money(transferDiff);
    $("cashDiff").parentNode.classList.toggle("negative", cashDiff < 0);
    $("cashDiff").parentNode.classList.toggle("positive", cashDiff > 0);
    $("transferDiff").parentNode.classList.toggle("negative", transferDiff < 0);
    $("transferDiff").parentNode.classList.toggle("positive", transferDiff > 0);
  }
  function renderClosures() {
    Promise.all([activeTransactions(), all("closures"), all("sessions")]).then(function (data) {
      var trs = data[0];
      var allClosures = data[1];
      var sessions = data[2];
      renderClosureSelectors(trs, allClosures);
      var selectedDate = activeClosureDate();
      var selectedShift = activeClosureShift();
      var alreadyComplete = closureIsComplete(allClosures, selectedDate, selectedShift);
      var totals = closureTotals(trs, selectedDate, selectedShift, allClosures, sessions);
      closureSnapshot = totals;
      if ($("closureShiftPill")) $("closureShiftPill").textContent = selectedDate + " | " + selectedShift;
      if ($("expectedCashCard")) $("expectedCashCard").textContent = money(totals.expectedCash);
      if ($("expectedTransferCard")) $("expectedTransferCard").textContent = money(totals.expectedTransfer);
      if ($("reviewTransferCard")) $("reviewTransferCard").textContent = money(totals.reviewTotal);
      $("closureExpected").innerHTML = summary([
        ["Ventas del turno", money(totals.totalSales)],
        ["Efectivo vendido", money(totals.cashSales)],
        ["Transferencias recibidas", money(totals.receivedTransfers)],
        ["Retiros", money(totals.withdrawals)]
      ]);
      $("closureWarnings").innerHTML = alreadyComplete
        ? "<div class='closure-ok'>Este cierre completo ya fue guardado. Seleccione otra fecha o turno pendiente.</div>"
        : totals.reviewTotal > 0
        ? "<div class='closure-warning'>Hay " + money(totals.reviewTotal) + " en transferencias pendientes o para revisar antes de cerrar.</div>"
        : "<div class='closure-ok'>No hay pagos pendientes de revision en este turno.</div>";
      renderMissedClosures(trs, allClosures);
      updateClosureDiffs();
    });
    all("closures").then(function (rows) {
      rows.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      $("closuresList").innerHTML = rows.length ? rows.slice(0, 10).map(function (c) {
        var cashTone = Number(c.differenceCash || 0) === 0 ? "ok" : "warn";
        var transferTone = Number(c.differenceTransfer || 0) === 0 ? "ok" : "warn";
        return "<article class='closure-row'>"
          + "<div class='closure-main'><b>" + c.businessDate + " " + c.shiftType + "</b><span>" + (c.closureKind === "PARTIAL" ? "Parcial" : "Completo") + " | " + c.createdAt.slice(11, 16) + " | Ventas " + money(c.totalSales) + "</span></div>"
          + "<div><span>Efectivo</span><b>" + money(c.countedCash) + "</b></div>"
          + "<div class='" + cashTone + "'><span>Dif. efec.</span><b>" + money(c.differenceCash) + "</b></div>"
          + "<div><span>Transf.</span><b>" + money(c.countedTransfer) + "</b></div>"
          + "<div class='" + transferTone + "'><span>Dif. transf.</span><b>" + money(c.differenceTransfer) + "</b></div>"
          + (c.notes ? "<p>" + escapeHtml(c.notes) + "</p>" : "")
          + "</article>";
      }).join("") : empty("Sin cierres guardados");
    });
  }
  function missingClosureRows(trs, closures, month) {
    var activity = {};
    trs.forEach(function (t) {
      var date = inferredBusinessDate(t);
      var shift = inferredShift(t);
      if (month && monthKey(date) !== month) return;
      if (t.type !== "SALE" && t.type !== "WITHDRAWAL") return;
      var key = date + "|" + shift;
      if (!activity[key]) activity[key] = { date: date, shift: shift, total: 0, count: 0 };
      activity[key].total += Number(t.amount || 0);
      activity[key].count += 1;
    });
    closures.forEach(function (c) {
      if ((c.closureKind || "COMPLETE") !== "COMPLETE") return;
      if (c.shiftType === "AMBOS") {
        delete activity[c.businessDate + "|AM"];
        delete activity[c.businessDate + "|PM"];
      } else {
        delete activity[c.businessDate + "|" + (c.shiftType || "")];
      }
    });
    return Object.keys(activity).map(function (k) { return activity[k]; }).sort(function (a, b) {
      return b.date.localeCompare(a.date) || String(b.shift).localeCompare(String(a.shift));
    });
  }
  function groupMissingClosures(rows) {
    var grouped = {};
    rows.forEach(function (r) {
      if (!grouped[r.date]) grouped[r.date] = { date: r.date, total: 0, count: 0, shifts: [] };
      grouped[r.date].total += r.total;
      grouped[r.date].count += r.count;
      grouped[r.date].shifts.push(r);
    });
    return Object.keys(grouped).sort(function (a, b) { return b.localeCompare(a); }).map(function (date) {
      grouped[date].shifts.sort(function (a, b) { return a.shift.localeCompare(b.shift); });
      return grouped[date];
    });
  }
  function renderMissedClosures(trs, closures) {
    var groups = groupMissingClosures(missingClosureRows(trs, closures, monthKey(today()))).slice(0, 20);
    $("missedClosuresList").innerHTML = groups.length ? groups.map(function (g) {
      return "<article class='missed-closure-row grouped'>"
        + "<button type='button' class='missed-toggle' data-toggle-missed-closure='" + g.date + "'><b>" + g.date + "</b><span>" + g.shifts.length + " turno(s) pendiente(s) | " + money(g.total) + "</span></button>"
        + (expandedMissingClosures[g.date] ? "<div class='missed-shifts'>" + g.shifts.map(function (r) {
          return "<div class='missed-shift-row'><div><b>" + r.shift + "</b><span>" + shiftTimeLabel(r.shift) + " | " + r.count + " movimiento(s) | " + money(r.total) + "</span></div><button type='button' data-open-missed-closure='" + r.date + "|" + r.shift + "'>Abrir cierre</button></div>";
        }).join("") + "<div class='missed-shift-row combined'><div><b>AM + PM</b><span>Cierre combinado | " + shiftTimeLabel("AMBOS") + " | " + g.count + " movimiento(s) detectado(s) | " + money(g.total) + "</span></div><button type='button' data-open-missed-closure='" + g.date + "|AMBOS'>Cierre combinado</button></div></div>" : "")
        + "</article>";
    }).join("") : empty("No hay cierres completos pendientes este mes");
    document.querySelectorAll("[data-toggle-missed-closure]").forEach(function (btn) {
      btn.onclick = function () {
        expandedMissingClosures[btn.dataset.toggleMissedClosure] = !expandedMissingClosures[btn.dataset.toggleMissedClosure];
        renderMissedClosures(trs, closures);
      };
    });
    document.querySelectorAll("[data-open-missed-closure]").forEach(function (btn) {
      btn.onclick = function () {
        var parts = btn.dataset.openMissedClosure.split("|");
        openClosureFor(parts[0], parts[1] || currentSession.shiftType);
      };
    });
  }
  function openClosureFor(date, shift) {
    setClosureContext(date || today(), shift || activeClosureShift(), true);
    audit("CLOSURE_CONTEXT_OPENED", activeClosureDate() + " " + activeClosureShift()).then(function () {
      switchTab("Cierres");
      setTimeout(function () { $("closureForm").scrollIntoView({ behavior: isLegacyPerformance() ? "auto" : "smooth", block: "center" }); }, 80);
    });
  }
  function openMissingClosureDay(date) {
    expandedMissingClosures[date] = true;
    switchTab("Cierres");
    setTimeout(function () { $("missedClosuresList").scrollIntoView({ behavior: isLegacyPerformance() ? "auto" : "smooth", block: "center" }); }, 80);
  }
  function saveClosure(e) {
    e.preventDefault();
    var closureKind = e.submitter && e.submitter.value === "PARTIAL" ? "PARTIAL" : "COMPLETE";
    var selectedDate = activeClosureDate();
    var selectedShift = activeClosureShift();
    Promise.all([activeTransactions(), all("closures"), all("sessions")]).then(function (data) {
      var trs = data[0];
      var closures = data[1];
      var sessions = data[2];
      if (closureKind === "COMPLETE" && closureIsComplete(closures, selectedDate, selectedShift)) {
        toast("Ese cierre completo ya fue guardado");
        return Promise.reject(new Error("Cierre duplicado"));
      }
      var totals = closureTotals(trs, selectedDate, selectedShift, closures, sessions);
      var countedCash = parseMoney($("countedCash").value);
      var countedTransfer = parseMoney($("countedTransfer").value);
      var differenceCash = countedCash - totals.expectedCash;
      var differenceTransfer = countedTransfer - totals.expectedTransfer;
      var notes = $("closureNotes").value.trim();
      if ((Math.abs(differenceCash) > 0.009 || Math.abs(differenceTransfer) > 0.009 || totals.reviewTotal > 0) && !notes) {
        toast("Agregue observaciones para cerrar con diferencia o pagos pendientes");
        $("closureNotes").focus();
        return Promise.reject(new Error("Observaciones requeridas"));
      }
      return add("closures", {
        id: uid(), businessDate: selectedDate, shiftType: selectedShift,
        expectedCash: totals.expectedCash, countedCash: countedCash, differenceCash: differenceCash,
        expectedTransfer: totals.expectedTransfer, countedTransfer: countedTransfer, differenceTransfer: differenceTransfer,
        pendingTransfers: totals.pendingTransfers, reviewTransfers: totals.reviewTransfers,
        totalSales: totals.totalSales, totalWithdrawals: totals.withdrawals, notes: notes, closureKind: closureKind,
        createdBy: currentUser.id, createdAt: nowIso()
      });
    }).then(function (saved) {
      if (!saved) return;
      return audit(closureKind === "PARTIAL" ? "SHIFT_PARTIAL_CLOSED" : "SHIFT_CLOSED", selectedDate + " " + selectedShift);
    }).then(function () {
      setClosureContext(today(), (currentSession && currentSession.shiftType) || "AM", true);
      renderAll();
      toast(closureKind === "PARTIAL" ? "Cierre parcial guardado" : "Cierre completo guardado");
    }).catch(function (err) {
      if (err && err.message !== "Observaciones requeridas" && err.message !== "Cierre duplicado") toast("No se pudo guardar el cierre");
    });
  }

  function renderMonthly() {
    var m = $("monthPicker").value || monthKey(today());
    Promise.all([activeTransactions(), all("closures"), all("monthlyEntries")]).then(function (data) {
      var trs = data[0].filter(function (t) { return monthKey(t.businessDate) === m; });
      var closures = data[1].filter(function (c) { return monthKey(c.businessDate) === m; });
      var entriesRaw = data[2];
      var entries = monthlyEntriesForMonth(entriesRaw, m).sort(function (a, b) { return b.date.localeCompare(a.date); });
      var completedClosures = closures.filter(function (c) { return (c.closureKind || "COMPLETE") === "COMPLETE"; });
      var missingClosures = missingClosureRows(trs, closures, m);
      var cash = sum(trs, function (t) { return t.type === "SALE" && t.paymentMethod === "Efectivo"; });
      var transfers = sum(trs, function (t) { return t.type === "SALE" && t.paymentMethod === "Transferencia" && t.transferStatus === "RECEIVED"; });
      var withdrawals = sum(trs, function (t) { return t.type === "WITHDRAWAL"; });
      var expenses = sum(entries, function (e) { return e.type !== "RECURRING_RULE"; });
      var balance = cash + transfers - expenses - withdrawals;
      $("monthlySummary").innerHTML = "<div class='equation-item income'><span>Efectivo</span><b>" + money(cash) + "</b></div>"
        + "<div class='equation-symbol'>+</div>"
        + "<div class='equation-item income'><span>Transferencias confirmadas</span><b>" + money(transfers) + "</b></div>"
        + "<div class='equation-symbol'>-</div>"
        + "<div class='equation-item expense'><span>Gastos</span><b>" + money(expenses) + "</b></div>"
        + "<div class='equation-symbol'>-</div>"
        + "<div class='equation-item expense'><span>Retiros</span><b>" + money(withdrawals) + "</b></div>"
        + "<div class='equation-symbol'>=</div>"
        + "<div class='equation-item result " + (balance >= 0 ? "positive" : "negative") + "'><span>Balance mensual</span><b>" + money(balance) + "</b></div>";
      $("monthlyReport").innerHTML = summary([
        ["Cierres completos", completedClosures.length],
        ["Dias con gastos", uniqueDays(entries).length],
        ["Gasto promedio", money(entries.length ? expenses / entries.length : 0)],
        ["Entradas de gasto", entries.length]
      ]);
      renderBalanceCalendar(m, trs, entries, completedClosures, missingClosures);
      renderMonthlyEntryList(entries, completedClosures);
    });
  }
  function uniqueDays(entries) {
    var seen = {};
    entries.forEach(function (e) { seen[e.date] = true; });
    return Object.keys(seen);
  }
  function monthlyEntriesForMonth(entries, m) {
    var out = entries.filter(function (e) { return e.type !== "RECURRING_RULE" && monthKey(e.date) === m; }).slice();
    entries.filter(function (e) { return e.type === "RECURRING_RULE"; }).forEach(function (rule) {
      var start = rule.date || m + "-01";
      var days = daysInMonth(m);
      for (var d = 1; d <= days; d++) {
        var date = m + "-" + String(d).padStart(2, "0");
        if (date < start) continue;
        if (new Date(date + "T12:00:00").getDay() !== Number(rule.weekday)) continue;
        out.push({
          id: rule.id + "-" + date, sourceId: rule.id, generated: true, type: "EXPENSE", date: date,
          amount: rule.amount, category: rule.category, description: rule.description || "Gasto fijo",
          paymentMethod: rule.paymentMethod, photoData: rule.photoData
        });
      }
    });
    return out;
  }
  function daysInMonth(m) {
    var parts = m.split("-").map(Number);
    return new Date(parts[0], parts[1], 0).getDate();
  }
  function renderBalanceCalendar(m, trs, entries, closures, missingClosures) {
    var days = daysInMonth(m);
    var html = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"].map(function (d) {
      return "<div class='balance-weekday'>" + d + "</div>";
    }).join("");
    var currentDate = today();
    var firstDay = new Date(m + "-01T12:00:00").getDay();
    var blanks = firstDay === 0 ? 6 : firstDay - 1;
    for (var blank = 0; blank < blanks; blank++) html += "<div class='balance-day blank'></div>";
    for (var d = 1; d <= days; d++) {
      var date = m + "-" + String(d).padStart(2, "0");
      var dayTrs = trs.filter(function (t) { return t.businessDate === date; });
      var dayEntries = entries.filter(function (e) { return e.date === date; });
      var dayClosures = closures.filter(function (c) { return c.businessDate === date; });
      var dayMissing = (missingClosures || []).filter(function (r) { return r.date === date; });
      var cash = sum(dayTrs, function (t) { return t.type === "SALE" && t.paymentMethod === "Efectivo"; });
      var transfer = sum(dayTrs, function (t) { return t.type === "SALE" && t.paymentMethod === "Transferencia" && t.transferStatus === "RECEIVED"; });
      var withdrawals = sum(dayTrs, function (t) { return t.type === "WITHDRAWAL"; });
      var expenses = sum(dayEntries, function () { return true; });
      var balance = cash + transfer - expenses - withdrawals;
      var hasInput = cash || transfer || expenses || withdrawals || dayClosures.length;
      html += "<article class='balance-day " + (hasInput ? (balance >= 0 ? "positive" : "negative") : "empty-day") + (date === currentDate ? " today" : "") + (selectedBalanceDay === date ? " selected" : "") + (dayMissing.length ? " missing-closure" : "") + "' data-balance-day='" + date + "'><b>" + d + (date === currentDate ? " <em>Hoy</em>" : "") + (dayClosures.length ? " <i>✓</i>" : "") + "</b><span>Efectivo " + money(cash) + "</span><span>Transf. " + money(transfer) + "</span><span>Gastos " + money(expenses) + "</span><strong>" + (hasInput ? money(balance) : "Sin datos") + "</strong>" + (dayMissing.length ? "<button type='button' class='missing-closure-link' data-balance-open-closure='" + date + "|" + dayMissing.map(function (r) { return r.shift; }).join(",") + "'>" + (dayMissing.length > 1 ? dayMissing.length + " cierres pendientes" : "Cierre " + dayMissing[0].shift + " pendiente") + "</button>" : "") + "</article>";
    }
    $("balanceCalendar").innerHTML = html;
    document.querySelectorAll("[data-balance-day]").forEach(function (day) {
      day.onclick = function () {
        selectedBalanceDay = selectedBalanceDay === day.dataset.balanceDay ? "" : day.dataset.balanceDay;
        renderMonthly();
        setTimeout(function () { $("monthlyEntries").scrollIntoView({ behavior: isLegacyPerformance() ? "auto" : "smooth", block: "center" }); }, 80);
      };
      day.oncontextmenu = function (e) {
        e.preventDefault();
        selectedBalanceDay = "";
        renderMonthly();
        setTimeout(function () { $("monthlyEntries").scrollIntoView({ behavior: isLegacyPerformance() ? "auto" : "smooth", block: "center" }); }, 80);
      };
    });
    document.querySelectorAll("[data-balance-open-closure]").forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var parts = btn.dataset.balanceOpenClosure.split("|");
        var shifts = (parts[1] || "").split(",");
        if (shifts.length > 1) openMissingClosureDay(parts[0]);
        else openClosureFor(parts[0], shifts[0] || "AM");
      };
    });
  }
  function renderMonthlyEntryList(entries, closures) {
    var expenseItems = (selectedBalanceDay ? entries.filter(function (e) { return e.date === selectedBalanceDay; }) : entries).map(function (e) {
      return { kind: "expense", date: e.date, html: "<article class='balance-entry " + (e.generated ? "generated" : "") + "'>"
        + "<div><b>" + e.date + " | " + money(e.amount) + "</b><span>" + escapeHtml(e.category || "General") + " | " + escapeHtml(e.paymentMethod || "") + (e.generated ? " | fijo automatico" : "") + "</span></div>"
        + (e.photoData ? "<img src='" + escapeHtml(e.photoData) + "' alt=''>" : "<i>Sin foto</i>")
        + "<small>" + escapeHtml(e.description || "") + "</small>"
        + "</article>" };
    });
    var closureItems = (selectedBalanceDay ? closures.filter(function (c) { return c.businessDate === selectedBalanceDay; }) : closures).map(function (c) {
      return { kind: "closure", date: c.businessDate, html: "<article class='balance-entry closure-complete'><div><b>" + c.businessDate + " " + c.shiftType + " | Cierre completo</b><span>Ventas " + money(c.totalSales) + " | Retiros " + money(c.totalWithdrawals) + "</span></div><i>✓</i><small>Efectivo contado " + money(c.countedCash) + " | Transferencia contada " + money(c.countedTransfer) + "</small></article>" };
    });
    var items = expenseItems.concat(closureItems).sort(function (a, b) { return b.date.localeCompare(a.date); });
    $("monthlyEntries").innerHTML = items.length ? items.map(function (x) { return x.html; }).join("") : empty(selectedBalanceDay ? "Sin cambios para este dia" : "Sin gastos ni cierres completos");
  }
  function saveMonthly(e) {
    e.preventDefault();
    var amount = parseMoney($("monthlyAmount").value);
    if (amount <= 0) { toast("Ingrese monto"); return; }
    var recurring = $("monthlyRecurring").checked;
    add("monthlyEntries", {
      id: uid(), type: recurring ? "RECURRING_RULE" : "EXPENSE", date: $("monthlyDate").value || today(), amount: amount,
      category: $("monthlyCategory").value.trim() || "General", description: $("monthlyDescription").value.trim(),
      paymentMethod: $("monthlyPayment").value, recurring: recurring, weekday: Number($("monthlyWeekday").value),
      photoData: monthlyPhotoData, productionItemId: $("monthlyProductionId").value || "", productionGroupKey: $("monthlyProductionId").dataset.groupKey || "", createdBy: currentUser.id, createdAt: nowIso()
    }).then(function () {
      return audit("BALANCE_EXPENSE_CREATED", (recurring ? "Fijo " : "") + money(amount) + " " + $("monthlyCategory").value);
    }).then(function () {
      $("monthlyForm").reset();
      $("monthlyProductionId").value = "";
      $("monthlyProductionId").dataset.groupKey = "";
      monthlyPhotoData = "";
      setDates();
      renderMonthly();
    });
  }

  function renderProduction() {
    var d = $("productionFilterDate").value || today();
    Promise.all([all("products"), all("productionItems"), all("transactions"), all("baskets"), all("basketItems"), all("monthlyEntries")]).then(function (data) {
      var products = data[0].filter(function (p) { return p.active; }).sort(function (a, b) {
        return Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.name).localeCompare(String(b.name));
      });
      var productById = {};
      products.forEach(function (p) { productById[p.id] = p; });
      renderProductionProductOptions(products);
      var items = data[1].filter(function (i) { return i.date === d && !i.deleted; }).sort(function (a, b) { return a.productName.localeCompare(b.productName); });
      var transactions = data[2];
      var baskets = data[3];
      var basketItems = data[4];
      var expenses = data[5];
      var basketById = {};
      baskets.forEach(function (b) { basketById[b.id] = b; });
      var txById = {};
      transactions.forEach(function (t) { txById[t.id] = t; });
      var soldByProduct = {};
      basketItems.forEach(function (it) {
        var basketRow = basketById[it.basketId];
        var txRow = basketRow && txById[basketRow.transactionId];
        if (!txRow || txRow.deleted || txRow.businessDate !== d) return;
        soldByProduct[it.productId || it.productName] = (soldByProduct[it.productId || it.productName] || 0) + Number(it.quantity || 0);
      });
      var rendered = productionDisplayRows(items, productById, soldByProduct, expenses);
      $("productionList").innerHTML = rendered.length ? rendered.join("") : empty("Sin stock cargado para esta fecha");
      document.querySelectorAll("[data-production-expense]").forEach(function (btn) {
        btn.onclick = function () { openBalanceExpenseForProduction(btn.dataset.productionExpense); };
      });
    });
  }
  function productionDisplayRows(items, productById, soldByProduct, expenses) {
    var juanjoItems = [];
    var normalGroups = {};
    var rows = [];
    items.forEach(function (i) {
      var product = productById[i.productId] || {};
      var payGroup = productionPayGroup(i, product);
      if (payGroup.grouped) juanjoItems.push(i);
      else {
        var key = i.productId || i.productName;
        if (!normalGroups[key]) normalGroups[key] = {
          id: i.id, productId: i.productId, productName: i.productName, unitType: i.unitType,
          date: i.date, enteredAmount: 0, entries: []
        };
        normalGroups[key].enteredAmount += Number(i.enteredAmount || 0);
        normalGroups[key].entries.push(i);
      }
    });
    Object.keys(normalGroups).sort(function (a, b) {
      return normalGroups[a].productName.localeCompare(normalGroups[b].productName);
    }).forEach(function (key) {
      rows.push(renderStockEntry(normalGroups[key], productById[normalGroups[key].productId] || {}, soldByProduct, expenses));
    });
    if (juanjoItems.length) rows.unshift(renderJuanjoStockGroup(juanjoItems, productById, soldByProduct, expenses));
    return rows;
  }
  function renderStockEntry(i, product, soldByProduct, expenses) {
    var sold = soldByProduct[i.productId] || soldByProduct[i.productName] || 0;
    var remaining = Math.max(0, Number(i.enteredAmount || 0) - sold);
    var movements = (i.entries || [i]).map(function (entry) {
      var amount = Number(entry.enteredAmount || 0);
      return "<small class='" + (amount < 0 ? "stock-subtract" : "stock-add") + "'>" + (amount < 0 ? "Quita " : "Suma ") + Math.abs(amount) + " " + escapeHtml(entry.unitType || i.unitType || "") + (entry.reason ? " | " + escapeHtml(entry.reason) : "") + "</small>";
    }).join("");
    return "<details class='stock-entry' open><summary><span><b>" + escapeHtml(i.productName) + "</b><small>" + i.date + " | " + escapeHtml(i.unitType || "") + "</small></span><strong>" + remaining + " " + escapeHtml(i.unitType || "") + "</strong></summary>"
      + "<div class='stock-detail'><div><span>Neto cargado</span><b>" + i.enteredAmount + "</b></div><div><span>Vendido ticket</span><b>" + sold + "</b></div><div><span>Restante</span><b>" + remaining + "</b></div><div class='stock-movements'><span>Movimientos</span>" + movements + "</div>"
      + "</div></details>";
  }
  function renderJuanjoStockGroup(items, productById, soldByProduct, expenses) {
    var date = items[0].date;
    var groupKey = date + "|Juanjo";
    var paid = expenses.some(function (e) { return e.productionGroupKey === groupKey; });
    var byProduct = {};
    items.forEach(function (i) {
      var key = i.productId || i.productName;
      if (!byProduct[key]) byProduct[key] = {
        id: i.id, productId: i.productId, productName: i.productName, unitType: i.unitType,
        entered: 0, sold: 0, entries: []
      };
      byProduct[key].entered += Number(i.enteredAmount || 0);
      byProduct[key].entries.push(i);
    });
    Object.keys(byProduct).forEach(function (key) {
      byProduct[key].sold = soldByProduct[byProduct[key].productId] || soldByProduct[byProduct[key].productName] || 0;
    });
    var details = Object.keys(byProduct).sort(function (a, b) {
      return byProduct[a].productName.localeCompare(byProduct[b].productName);
    }).map(function (key) {
      var row = byProduct[key];
      var remaining = Math.max(0, row.entered - row.sold);
      return "<div class='stock-group-item'><span>" + escapeHtml(row.productName) + "</span><b>Neto " + row.entered + " " + escapeHtml(row.unitType || "") + "</b><b>Vend. " + row.sold + "</b><strong>Resta " + remaining + "</strong></div>";
    }).join("");
    return "<details class='stock-entry stock-grouped stock-juanjo-group' open><summary><span><b>Juanjo</b><small>" + date + " | " + items.length + " ingreso(s) agrupado(s)</small></span><strong>" + Object.keys(byProduct).length + " productos</strong></summary>"
      + "<div class='stock-detail stock-group-detail'>" + details
      + "<button type='button' class='" + (paid ? "stock-paid" : "stock-unpaid") + "' data-production-expense='" + items[0].id + "'>" + (paid ? "Pagado" : "Impago") + "</button></div></details>";
  }
  function renderProductionProductOptions(products) {
    var current = $("productionProduct").value;
    $("productionProduct").innerHTML = products.map(function (p) {
      return "<option value='" + p.id + "' data-unit='" + escapeHtml(p.unitType || "unidad") + "' data-name='" + escapeHtml(p.name) + "' data-category='" + escapeHtml(p.category || "") + "'>" + escapeHtml(p.name) + " (" + escapeHtml(p.unitType || "unidad") + ")</option>";
    }).join("");
    if (current) $("productionProduct").value = current;
    updateProductionProductFields();
  }
  function updateProductionProductFields() {
    var opt = $("productionProduct").selectedOptions[0];
    if (!opt) return;
    $("productionName").value = opt.dataset.name || opt.textContent;
    $("productionUnit").value = opt.dataset.unit || "unidad";
  }
  function updateProductionActionUi() {
    var removing = $("productionAction") && $("productionAction").value === "remove";
    if ($("productionReasonWrap")) $("productionReasonWrap").classList.toggle("hidden", !removing);
    if ($("productionSubmitBtn")) {
      $("productionSubmitBtn").textContent = removing ? "Quitar stock" : "Agregar stock";
      $("productionSubmitBtn").className = removing ? "big danger" : "big success";
    }
  }
  function saveProduction(e) {
    e.preventDefault();
    var entered = parseMoney($("productionEntered").value);
    var productId = $("productionProduct").value;
    var name = $("productionName").value.trim();
    if (!productId || !name || entered <= 0) { toast("Complete producto y cantidad"); return; }
    var removing = $("productionAction") && $("productionAction").value === "remove";
    var reason = $("productionReason") ? $("productionReason").value.trim() : "";
    if (removing && !reason) { toast("Motivo requerido para quitar stock"); return; }
    add("productionItems", {
      id: uid(), date: $("productionDate").value || today(), productId: productId, productName: name, unitType: $("productionUnit").value,
      enteredAmount: removing ? -entered : entered, category: $("productionProduct").selectedOptions[0] && $("productionProduct").selectedOptions[0].dataset.category || "",
      movementType: removing ? "REMOVE" : "ADD", reason: reason,
      createdBy: currentUser.id, createdAt: nowIso()
    }).then(function () {
      return removing
        ? audit("PRODUCTION_STOCK_REMOVED_REVIEW_REQUIRED", name + " -" + entered + " " + $("productionUnit").value + " | Motivo: " + reason, "warning")
        : audit("PRODUCTION_ITEM_CREATED", name);
    }).then(function () {
    $("productionEntered").value = "";
      if ($("productionReason")) $("productionReason").value = "";
      if ($("productionAction")) $("productionAction").value = "add";
      updateProductionActionUi();
      $("productionFilterDate").value = $("productionDate").value;
      renderProduction();
    });
  }
  function openBalanceExpenseForProduction(id) {
    if (!isAdmin()) { toast("Solo admin/dev puede cargar gasto en Balance"); return; }
    Promise.all([all("productionItems"), all("products")]).then(function (data) {
      var items = data[0];
      var products = data[1];
      var productById = {};
      products.forEach(function (p) { productById[p.id] = p; });
      var item = items.filter(function (i) { return i.id === id; })[0];
      if (!item) { toast("Stock no encontrado"); return; }
      var group = productionPayGroup(item, productById[item.productId] || {});
      switchTab("Balance");
      $("monthlyProductionId").value = item.id;
      $("monthlyProductionId").dataset.groupKey = group.key;
      $("monthlyDate").value = item.date;
      $("monthlyCategory").value = group.grouped ? "Juanjo" : "Produccion";
      $("monthlyDescription").value = group.grouped ? "Pago grupo Juanjo del " + item.date : "Pago stock: " + item.productName + " (" + item.enteredAmount + " " + item.unitType + ")";
      $("monthlyAmount").focus();
      setTimeout(function () { $("monthlyForm").scrollIntoView({ behavior: isLegacyPerformance() ? "auto" : "smooth", block: "center" }); }, 80);
    });
  }
  function productionPayGroup(item, product) {
    var category = String(item.category || product.category || "").trim().toLowerCase();
    if (category === "juanjo") return { grouped: true, key: item.date + "|Juanjo" };
    return { grouped: false, key: item.id };
  }

  function renderMetrics() {
    var days = Number($("metricsRange").value || 30);
    var start = new Date();
    start.setDate(start.getDate() - days + 1);
    Promise.all([all("transactions"), all("baskets"), all("basketItems"), all("monthlyEntries"), all("productionItems"), all("closures")]).then(function (data) {
      var allTrs = data[0];
      var baskets = data[1];
      var basketItems = data[2];
      var monthly = data[3];
      var production = data[4];
      var closures = data[5];
      var trs = allTrs.filter(function (t) { return !t.deleted; });
      var scoped = trs.filter(function (t) { return new Date(t.createdAt) >= start; });
      var deletedScoped = allTrs.filter(function (t) { return t.deleted && new Date(t.createdAt || t.deletedAt || nowIso()) >= start; });
      var sales = scoped.filter(function (t) { return t.type === "SALE"; });
      var cash = sum(sales, function (t) { return t.paymentMethod === "Efectivo"; });
      var transferReceived = sum(sales, function (t) { return t.paymentMethod === "Transferencia" && t.transferStatus === "RECEIVED"; });
      var transferPending = sum(sales, function (t) { return t.paymentMethod === "Transferencia" && (t.transferStatus || "PENDING") === "PENDING"; });
      var transferReview = sum(sales, function (t) { return t.paymentMethod === "Transferencia" && t.transferStatus === "REVIEW"; });
      var withdrawals = sum(scoped, function (t) { return t.type === "WITHDRAWAL"; });
      var expenses = monthly.filter(function (e) { return e.type !== "RECURRING_RULE" && new Date(e.date || e.createdAt) >= start; });
      var expenseTotal = sum(expenses, function () { return true; });
      var completeClosures = closures.filter(function (c) { return (c.closureKind || "COMPLETE") === "COMPLETE" && new Date(c.createdAt || c.businessDate) >= start; });
      var partialClosures = closures.filter(function (c) { return c.closureKind === "PARTIAL" && new Date(c.createdAt || c.businessDate) >= start; });
      var productionScoped = production.filter(function (p) { return !p.deleted && new Date(p.date || p.createdAt) >= start; });
      var ticketSales = sales.filter(function (t) { return t.saleMode === "PRODUCT_BASKET" || t.basketId; });
      var manualSales = sales.length - ticketSales.length;
      var avg = sales.length ? sum(sales, function () { return true; }) / sales.length : 0;
      var confirmedResult = cash + transferReceived - withdrawals - expenseTotal;
      var bestDay = bestMetricDay(sales, days);
      var basketById = {};
      baskets.forEach(function (b) { basketById[b.id] = b; });
      var txById = {};
      sales.forEach(function (t) { txById[t.id] = t; });
      var productStats = productMetricStats(basketItems, basketById, txById, start);
      $("metricsCards").innerHTML = summary([
        ["Ventas totales", money(sum(sales, function () { return true; }))],
        ["Ventas registradas", sales.length],
        ["Ticket promedio", money(avg)],
        ["Efectivo", money(cash)],
        ["Transferencias recibidas", money(transferReceived)],
        ["Pagos por revisar", money(transferPending + transferReview)],
        ["Gastos cargados", money(expenseTotal)],
        ["Resultado confirmado", money(confirmedResult)],
        ["Ventas ticket", ticketSales.length],
        ["Productos vendidos", productStats.totalItems],
        ["Cierres completos", completeClosures.length],
        ["Dia mas fuerte", bestDay.label + " " + money(bestDay.total)]
      ]);
      if ($("metricsBreakdown")) $("metricsBreakdown").innerHTML = [
        ["Retiros", money(withdrawals)],
        ["Ventas manuales", manualSales],
        ["Ventas por ticket", ticketSales.length],
        ["Mayor venta", money(maxAmount(sales))],
        ["Ventas bajas (< $1000)", sales.filter(function (t) { return Number(t.amount || 0) > 0 && Number(t.amount || 0) < 1000; }).length],
        ["Ventas grandes (> $99.999)", sales.filter(function (t) { return Number(t.amount || 0) > 99999; }).length],
        ["Transferencias pendientes", money(transferPending)],
        ["Transferencias en revision", money(transferReview)],
        ["Resultado confirmado", money(confirmedResult)]
      ].map(metricLine).join("");
      if ($("metricsProducts")) $("metricsProducts").innerHTML = productStats.rows.length ? productStats.rows.slice(0, 8).map(function (p, i) {
        return "<div><span>" + (i + 1) + ". " + escapeHtml(p.name) + "<small>" + p.qty + " vendido(s)</small></span><b>" + money(p.subtotal) + "</b></div>";
      }).join("") : empty("Sin productos vendidos por ticket en este rango.");
      if ($("metricsOps")) $("metricsOps").innerHTML = [
        ["Cierres completos", completeClosures.length],
        ["Cierres parciales", partialClosures.length],
        ["Movimientos borrados", deletedScoped.length],
        ["Stock cargado", productionScoped.length + " entrada(s)"],
        ["Categorias de gasto", uniqueCount(expenses.map(function (e) { return e.category || "General"; }))],
        ["Transferencias sin confirmar", sales.filter(function (t) { return t.paymentMethod === "Transferencia" && (t.transferStatus || "PENDING") !== "RECEIVED"; }).length]
      ].map(metricLine).join("");
      if ($("metricsCash")) $("metricsCash").innerHTML = [
        ["Ingresos confirmados", money(cash + transferReceived)],
        ["Efectivo vs transf.", percent(cash, cash + transferReceived) + " / " + percent(transferReceived, cash + transferReceived)],
        ["Gastos", money(expenseTotal)],
        ["Retiros", money(withdrawals)],
        ["Balance operativo", money(confirmedResult)],
        ["Promedio por dia", money((cash + transferReceived) / Math.max(1, days))]
      ].map(metricLine).join("");
      drawChart(sales, days);
      drawSalesCountChart(sales, days);
      drawPaymentMixChart(cash, transferReceived, transferPending + transferReview);
      drawProductRevenueChart(productStats.rows);
    });
  }
  function clearMetricCanvases() {
    ["salesChart", "salesCountChart", "paymentMixChart", "productRevenueChart"].forEach(function (id) {
      var canvas = $(id);
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width || 1, canvas.height || 1);
    });
  }
  function metricLine(row) {
    return "<div><span>" + row[0] + "</span><b>" + row[1] + "</b></div>";
  }
  function maxAmount(rows) {
    return rows.reduce(function (m, r) { return Math.max(m, Number(r.amount || 0)); }, 0);
  }
  function uniqueCount(rows) {
    var seen = {};
    rows.forEach(function (r) { seen[r] = true; });
    return Object.keys(seen).length;
  }
  function percent(value, total) {
    total = Number(total || 0);
    if (!total) return "0%";
    return Math.round((Number(value || 0) / total) * 100) + "%";
  }
  function bestMetricDay(sales, days) {
    var best = { label: "-", total: 0 };
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      var total = sum(sales.filter(function (s) { return (s.businessDate || "").slice(0, 10) === key; }), function () { return true; });
      if (total > best.total) best = { label: key.slice(5), total: total };
    }
    return best;
  }
  function productMetricStats(items, basketById, txById, start) {
    var byProduct = {};
    var totalItems = 0;
    items.forEach(function (it) {
      var basket = basketById[it.basketId];
      var tx = basket && txById[basket.transactionId];
      if (!tx || new Date(tx.createdAt) < start) return;
      var key = it.productId || it.productName;
      if (!byProduct[key]) byProduct[key] = { name: it.productName || "Producto", qty: 0, subtotal: 0 };
      byProduct[key].qty += Number(it.quantity || 0);
      byProduct[key].subtotal += Number(it.subtotal || 0);
      totalItems += Number(it.quantity || 0);
    });
    var rows = Object.keys(byProduct).map(function (k) { return byProduct[k]; }).sort(function (a, b) {
      return b.subtotal - a.subtotal || b.qty - a.qty;
    });
    return { rows: rows, totalItems: Math.round(totalItems * 100) / 100 };
  }
  function renderMovements() {
    clearTimeout(movementRenderTimer);
    Promise.all([all("transactions"), all("basketItems")]).then(function (data) {
      var rows = data[0];
      var basketItems = data[1];
      movementItemsByBasket = {};
      basketItems.forEach(function (it) {
        if (!movementItemsByBasket[it.basketId]) movementItemsByBasket[it.basketId] = [];
        movementItemsByBasket[it.basketId].push(it);
      });
      rows.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      var filtered = filterMovements(rows);
      movementFilteredRows = filtered;
      movementRenderCount = Math.min(MOVEMENT_BATCH_SIZE, filtered.length);
      visibleMovementIds = filtered.map(function (r) { return r.id; });
      Object.keys(selectedMovements).forEach(function (id) {
        if (visibleMovementIds.indexOf(id) < 0) delete selectedMovements[id];
      });
      renderMovementSummary(filtered);
      $("movementSelectionPill").textContent = Object.keys(selectedMovements).length + " seleccionados";
      renderMovementRows();
    });
  }
  function scheduleRenderMovements() {
    clearTimeout(movementRenderTimer);
    movementRenderTimer = setTimeout(renderMovements, 160);
  }
  function renderMovementRows() {
    var list = $("movementsList");
    if (!list) return;
    var scrollTop = list.scrollTop || 0;
    if (!movementFilteredRows.length) {
      list.innerHTML = empty("Sin movimientos para estos filtros");
      return;
    }
    var visible = movementFilteredRows.slice(0, movementRenderCount);
    list.innerHTML = visible.map(function (r, i) {
      return movementRowHtml(r, i, movementItemsByBasket[r.basketId] || []);
    }).join("") + movementLoadMoreHtml();
    list.scrollTop = scrollTop;
    bindMovementRowEvents();
  }
  function movementLoadMoreHtml() {
    if (movementRenderCount >= movementFilteredRows.length) return "";
    return "<button id='movementLoadMore' class='movement-load-more' type='button'>Cargar mas (" + movementRenderCount + " / " + movementFilteredRows.length + ")</button>";
  }
  function loadMoreMovements() {
    if (movementRenderCount >= movementFilteredRows.length) return;
    movementRenderCount = Math.min(movementRenderCount + MOVEMENT_BATCH_SIZE, movementFilteredRows.length);
    renderMovementRows();
  }
  function bindMovementRowEvents() {
    document.querySelectorAll("[data-movement-select]").forEach(function (box) {
      var handledDragStart = false;
      box.onclick = function (e) {
        if (handledDragStart) {
          handledDragStart = false;
          e.preventDefault();
          return;
        }
        e.preventDefault();
        var idx = Number(box.dataset.movementIndex);
        if (e.shiftKey && lastMovementSelectIndex >= 0) {
          selectMovementRange(lastMovementSelectIndex, idx, true);
          return;
        }
        setMovementSelected(box.dataset.movementSelect, !selectedMovements[box.dataset.movementSelect]);
        lastMovementSelectIndex = idx;
        renderMovementRows();
      };
      box.onchange = function () {
        if (movementDragSelect) return;
        setMovementSelected(box.dataset.movementSelect, box.checked);
        renderMovementRows();
      };
      box.onpointerdown = function (e) {
        if (e.shiftKey && lastMovementSelectIndex >= 0) return;
        if (e.button !== 0) return;
        handledDragStart = true;
        e.preventDefault();
        movementDragSelect = { checked: !selectedMovements[box.dataset.movementSelect] };
        setMovementSelected(box.dataset.movementSelect, movementDragSelect.checked);
        box.checked = movementDragSelect.checked;
        lastMovementSelectIndex = Number(box.dataset.movementIndex);
        $("movementSelectionPill").textContent = Object.keys(selectedMovements).length + " seleccionados";
      };
      box.onpointerenter = function () {
        if (!movementDragSelect) return;
        setMovementSelected(box.dataset.movementSelect, movementDragSelect.checked);
        box.checked = movementDragSelect.checked;
        $("movementSelectionPill").textContent = Object.keys(selectedMovements).length + " seleccionados";
      };
    });
    document.querySelectorAll("[data-movement-expand]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.dataset.movementExpand;
        expandedMovements[id] = !expandedMovements[id];
        renderMovementRows();
      };
    });
    if ($("movementLoadMore")) $("movementLoadMore").onclick = loadMoreMovements;
  }
  function setMovementSelected(id, checked) {
    if (checked) selectedMovements[id] = true;
    else delete selectedMovements[id];
  }
  function selectMovementRange(from, to, checked) {
    var a = Math.min(from, to);
    var b = Math.max(from, to);
    for (var i = a; i <= b; i++) {
      if (visibleMovementIds[i]) setMovementSelected(visibleMovementIds[i], checked);
    }
    lastMovementSelectIndex = to;
    renderMovementRows();
  }
  function filterMovements(rows) {
    var from = $("movementDateFrom").value;
    var to = $("movementDateTo").value;
    var min = $("movementAmountMin").value.trim() ? parseMoney($("movementAmountMin").value) : null;
    var max = $("movementAmountMax").value.trim() ? parseMoney($("movementAmountMax").value) : null;
    var payment = $("movementTypeFilter").value;
    var shift = $("movementShiftFilter").value;
    var state = $("movementStateFilter").value;
    return rows.filter(function (r) {
      var d = r.businessDate || (r.createdAt || "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (min != null && Number(r.amount || 0) < min) return false;
      if (max != null && Number(r.amount || 0) > max) return false;
      if (payment && r.paymentMethod !== payment) return false;
      if (shift && r.shiftType !== shift) return false;
      if (state === "ACTIVE" && r.deleted) return false;
      if (state === "DELETED" && !r.deleted) return false;
      return true;
    });
  }
  function movementFlags(r) {
    var flags = [];
    var amount = Number(r.amount || 0);
    if (r.deleted) flags.push(["deleted", "Borrado"]);
    if (r.type === "SALE" && r.basketId) flags.push(["ticket", "Ticket"]);
    if (amount > 99999) flags.push(["huge", "Monto alto"]);
    if (amount > 0 && amount < 1000) flags.push(["low", "Monto bajo"]);
    if (r.type === "SALE" && r.paymentMethod === "Transferencia" && (r.transferStatus || "PENDING") !== "RECEIVED") flags.push(["pending", "Transferencia pendiente"]);
    return flags;
  }
  function movementRowHtml(r, index, items) {
    var flags = movementFlags(r);
    var tone = r.deleted ? "deleted" : (r.type === "SALE" && r.basketId ? "ticket" : flags.length ? flags[0][0] : "normal");
    var checked = selectedMovements[r.id] ? " checked" : "";
    var expandable = r.basketId ? "<button type='button' class='movement-expand' data-movement-expand='" + r.id + "'>" + (expandedMovements[r.id] ? "Ocultar" : "Detalle") + "</button>" : "";
    var flagHtml = flags.length ? flags.map(function (f) {
      return "<i class='movement-flag " + f[0] + "'>" + f[1] + "</i>";
    }).join("") : "<i class='movement-flag ok'>Normal</i>";
    return "<article class='movement-row " + tone + "'>"
      + "<label class='movement-check'><input type='checkbox' data-movement-select='" + r.id + "' data-movement-index='" + index + "'" + checked + "></label>"
      + "<div class='movement-date'><b>" + (r.businessDate || (r.createdAt || "").slice(0, 10)) + "</b><span>" + (r.createdAt || "").slice(11, 16) + " | " + escapeHtml(r.shiftType || "") + "</span></div>"
      + "<div><span>Tipo</span><b>" + escapeHtml(r.type || "") + "</b></div>"
      + "<div><span>Medio</span><b>" + escapeHtml(r.paymentMethod || "") + "</b></div>"
      + "<strong>" + money(r.amount) + "</strong>"
      + "<div class='movement-flags'>" + flagHtml + expandable + "</div>"
      + movementTicketDetailHtml(r, items)
      + "</article>";
  }
  function movementTicketDetailHtml(r, items) {
    if (!expandedMovements[r.id] || !r.basketId) return "";
    var paid = Number(r.paidAmount || 0);
    var change = paid ? paid - Number(r.amount || 0) : 0;
    return "<div class='movement-ticket-detail'>"
      + "<div class='movement-ticket-stats'><span>Total items <b>" + items.length + "</b></span><span>Pago cliente <b>" + (paid ? money(paid) : "Sin dato") + "</b></span><span>Vuelto <b>" + (paid ? money(change) : "Sin dato") + "</b></span></div>"
      + (items.length ? items.map(function (it) {
        return "<div class='movement-ticket-item'><span>" + escapeHtml(it.productName) + "</span><b>" + it.quantity + " x " + money(it.unitPrice) + "</b><strong>" + money(it.subtotal) + "</strong></div>";
      }).join("") : empty("Sin detalle de items guardado"))
      + "</div>";
  }
  function renderMovementSummary(rows) {
    var active = rows.filter(function (r) { return !r.deleted; });
    var sales = sum(active, function (r) { return r.type === "SALE"; });
    var withdrawals = sum(active, function (r) { return r.type === "WITHDRAWAL"; });
    var flagged = rows.filter(function (r) { return movementFlags(r).length; }).length;
    $("movementSummary").innerHTML = summary([
      ["Movimientos", rows.length],
      ["Ventas activas", money(sales)],
      ["Retiros activos", money(withdrawals)],
      ["Alertas", flagged]
    ]);
  }
  function selectVisibleMovements() {
    visibleMovementIds.slice(0, movementRenderCount).forEach(function (id) { selectedMovements[id] = true; });
    renderMovementRows();
  }
  function clearMovementSelection() {
    selectedMovements = {};
    renderMovementRows();
  }
  function openMovementEdit() {
    var ids = Object.keys(selectedMovements);
    if (ids.length !== 1) { toast("Seleccione un solo movimiento para editar"); return; }
    all("transactions").then(function (rows) {
      var r = rows.filter(function (x) { return x.id === ids[0]; })[0];
      if (!r) { toast("Movimiento no encontrado"); return; }
      $("movementEditId").value = r.id;
      $("movementEditAmount").value = String(Math.round(Number(r.amount || 0)));
      $("movementEditType").value = r.type || "SALE";
      $("movementEditPayment").value = r.paymentMethod || "Efectivo";
      $("movementEditBusinessDate").value = r.businessDate || today();
      $("movementEditShift").value = r.shiftType || "AM";
      $("movementEditDeleted").value = r.deleted ? "true" : "false";
      $("movementEditReason").value = "";
      $("movementEditModal").classList.remove("hidden");
      $("movementEditAmount").focus();
    });
  }
  function closeMovementEdit() {
    $("movementEditModal").classList.add("hidden");
  }
  function saveMovementEdit(e) {
    e.preventDefault();
    var id = $("movementEditId").value;
    var reason = $("movementEditReason").value.trim();
    if (!reason) { toast("Ingrese motivo o nota"); $("movementEditReason").focus(); return; }
    all("transactions").then(function (rows) {
      var r = rows.filter(function (x) { return x.id === id; })[0];
      if (!r) { toast("Movimiento no encontrado"); return; }
      r.amount = parseMoney($("movementEditAmount").value);
      r.type = $("movementEditType").value;
      r.paymentMethod = $("movementEditPayment").value;
      r.businessDate = $("movementEditBusinessDate").value || r.businessDate;
      r.shiftType = $("movementEditShift").value;
      r.deleted = $("movementEditDeleted").value === "true";
      r.adminNote = reason;
      r.editedAt = nowIso();
      r.editedBy = currentUser && currentUser.username;
      add("transactions", r).then(function () {
        return audit("MOVEMENT_EDITED", r.id + " | " + money(r.amount) + " | " + reason, "warning");
      }).then(function () {
        closeMovementEdit();
        renderMovements();
        toast("Movimiento actualizado");
      });
    });
  }
  function openMovementDelete() {
    var ids = Object.keys(selectedMovements);
    if (!ids.length) { toast("Seleccione movimientos"); return; }
    $("movementDeleteSummary").textContent = "Se borraran " + ids.length + " movimiento(s). La accion queda marcada para revision admin.";
    $("movementDeleteReason").value = "";
    $("movementDeleteModal").classList.remove("hidden");
    $("movementDeleteReason").focus();
  }
  function closeMovementDelete() {
    $("movementDeleteModal").classList.add("hidden");
  }
  function deleteSelectedMovements(e) {
    if (e) e.preventDefault();
    var ids = Object.keys(selectedMovements);
    if (!ids.length) { closeMovementDelete(); toast("Seleccione movimientos"); return; }
    var reason = $("movementDeleteReason").value.trim();
    if (!reason) { toast("Motivo obligatorio"); $("movementDeleteReason").focus(); return; }
    all("transactions").then(function (rows) {
      var byId = {};
      rows.forEach(function (r) { byId[r.id] = r; });
      return Promise.all(ids.map(function (id) {
        var r = byId[id];
        if (!r) return Promise.resolve();
        r.deleted = true;
        r.deleteReason = reason;
        r.reviewRequired = true;
        r.deletedAt = nowIso();
        r.deletedBy = currentUser && currentUser.username;
        return add("transactions", r);
      }));
    }).then(function () {
      return audit("MOVEMENTS_DELETED_REVIEW_REQUIRED", ids.length + " movimiento(s) | Motivo: " + reason, "critical");
    }).then(function () {
      selectedMovements = {};
      closeMovementDelete();
      renderAll();
      toast("Movimientos borrados y marcados para revision");
    });
  }
  function metricTooltip() {
    var tip = $("metricChartTooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "metricChartTooltip";
      tip.className = "metric-chart-tooltip hidden";
      document.body.appendChild(tip);
    }
    return tip;
  }
  function bindMetricCanvasHover(canvas) {
    if (!canvas || canvas.dataset.metricHoverBound === "1") return;
    canvas.dataset.metricHoverBound = "1";
    canvas.onmousemove = function (e) {
      var hit = metricCanvasHit(canvas, e);
      if (!hit) { hideMetricTooltip(); return; }
      showMetricTooltip(hit.label, e.clientX, e.clientY);
    };
    canvas.onmouseleave = hideMetricTooltip;
  }
  function showMetricTooltip(label, x, y) {
    var tip = metricTooltip();
    tip.innerHTML = label;
    tip.classList.remove("hidden");
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, x + 14) + "px";
    tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 8, y + 14) + "px";
  }
  function hideMetricTooltip() {
    var tip = $("metricChartTooltip");
    if (tip) tip.classList.add("hidden");
  }
  function metricCanvasPoint(canvas, e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      y: (e.clientY - rect.top) * (canvas.height / Math.max(1, rect.height))
    };
  }
  function metricCanvasHit(canvas, e) {
    var p = metricCanvasPoint(canvas, e);
    var targets = canvas._metricTargets || [];
    var best = null;
    targets.forEach(function (t) {
      var d = 999999;
      if (t.type === "point") {
        d = Math.sqrt(Math.pow(p.x - t.x, 2) + Math.pow(p.y - t.y, 2));
        if (d > (t.r || 12)) return;
      } else if (t.type === "rect") {
        if (p.x < t.x || p.x > t.x + t.w || p.y < t.y || p.y > t.y + t.h) return;
        d = Math.abs((t.x + t.w / 2) - p.x);
      } else if (t.type === "slice") {
        var angle = Math.atan2(p.y - t.cy, p.x - t.cx);
        if (angle < -Math.PI / 2) angle += Math.PI * 2;
        var dist = Math.sqrt(Math.pow(p.x - t.cx, 2) + Math.pow(p.y - t.cy, 2));
        if (dist > t.r || angle < t.start || angle > t.end) return;
        d = dist;
      }
      if (!best || d < best.d) best = { d: d, label: t.label };
    });
    return best;
  }
  function drawChart(sales, days) {
    var canvas = $("salesChart");
    var ctx = canvas.getContext("2d");
    bindMetricCanvasHover(canvas);
    canvas._metricTargets = [];
    canvas.width = Math.max(640, canvas.parentNode.clientWidth - 40);
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#dcebe2";
    ctx.lineWidth = 1;
    for (var g = 0; g < 5; g++) {
      var gy = 56 + g * ((canvas.height - 82) / 4);
      ctx.beginPath();
      ctx.moveTo(34, gy);
      ctx.lineTo(canvas.width - 18, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = "#24784c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    values.forEach(function (v, i) {
      var x = 42 + i * ((canvas.width - 74) / Math.max(1, values.length - 1));
      var y = canvas.height - 34 - (v / max) * (canvas.height - 90);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#24784c";
    values.forEach(function (v, i) {
      if (!v) return;
      var x = 42 + i * ((canvas.width - 74) / Math.max(1, values.length - 1));
      var y = canvas.height - 34 - (v / max) * (canvas.height - 90);
      canvas._metricTargets.push({ type: "point", x: x, y: y, r: 14, label: "<b>" + labels[i] + "</b><span>" + money(v) + "</span>" });
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#24211d";
    ctx.font = "700 14px Arial";
    ctx.fillText("Max " + money(max), 42, 30);
  }
  function dailyMetricValues(sales, days, mode) {
    var values = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      var rows = sales.filter(function (s) { return s.businessDate === key; });
      values.push(mode === "count" ? rows.length : sum(rows, function () { return true; }));
    }
    return values;
  }
  function prepareCanvas(id) {
    var canvas = $(id);
    if (!canvas) return null;
    bindMetricCanvasHover(canvas);
    canvas._metricTargets = [];
    canvas.width = Math.max(360, canvas.parentNode.clientWidth - 40);
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return { canvas: canvas, ctx: ctx };
  }
  function drawSalesCountChart(sales, days) {
    var c = prepareCanvas("salesCountChart");
    if (!c) return;
    var values = dailyMetricValues(sales, days, "count");
    var labels = [];
    for (var li = days - 1; li >= 0; li--) {
      var ld = new Date();
      ld.setDate(ld.getDate() - li);
      labels.push(ld.toISOString().slice(5, 10));
    }
    var max = Math.max.apply(Math, values.concat([1]));
    var barW = Math.max(3, (c.canvas.width - 70) / Math.max(1, values.length));
    c.ctx.fillStyle = "#eef6f1";
    c.ctx.fillRect(34, 28, c.canvas.width - 54, c.canvas.height - 58);
    c.ctx.fillStyle = "#295f9d";
    values.forEach(function (v, i) {
      var h = (v / max) * (c.canvas.height - 82);
      var x = 42 + i * barW;
      var y = c.canvas.height - 34 - h;
      var w = Math.max(2, barW - 2);
      c.ctx.fillRect(x, y, w, h);
      c.canvas._metricTargets.push({ type: "rect", x: x, y: Math.min(y, c.canvas.height - 34), w: w, h: Math.max(6, h), label: "<b>" + labels[i] + "</b><span>" + v + " venta(s)</span>" });
    });
    c.ctx.fillStyle = "#24211d";
    c.ctx.font = "700 14px Arial";
    c.ctx.fillText("Max " + max + " venta(s)", 42, 22);
  }
  function drawPaymentMixChart(cash, received, pending) {
    var c = prepareCanvas("paymentMixChart");
    if (!c) return;
    var values = [
      { label: "Efectivo", value: cash, color: "#24784c" },
      { label: "Transferencias", value: received, color: "#295f9d" },
      { label: "Por revisar", value: pending, color: "#d79b30" }
    ];
    var total = values.reduce(function (a, b) { return a + Number(b.value || 0); }, 0);
    var cx = 100, cy = c.canvas.height / 2, r = 58, start = -Math.PI / 2;
    values.forEach(function (v) {
      var slice = total ? (v.value / total) * Math.PI * 2 : 0;
      c.ctx.beginPath();
      c.ctx.moveTo(cx, cy);
      c.ctx.arc(cx, cy, r, start, start + slice);
      c.ctx.closePath();
      c.ctx.fillStyle = v.color;
      c.ctx.fill();
      if (slice > 0) c.canvas._metricTargets.push({
        type: "slice", cx: cx, cy: cy, r: r, start: start, end: start + slice,
        label: "<b>" + v.label + "</b><span>" + money(v.value) + " · " + percent(v.value, total) + "</span>"
      });
      start += slice;
    });
    if (!total) {
      c.ctx.beginPath();
      c.ctx.arc(cx, cy, r, 0, Math.PI * 2);
      c.ctx.fillStyle = "#eef0ee";
      c.ctx.fill();
    }
    values.forEach(function (v, i) {
      var y = 58 + i * 38;
      c.ctx.fillStyle = v.color;
      c.ctx.fillRect(190, y - 12, 18, 18);
      c.ctx.fillStyle = "#24211d";
      c.ctx.font = "700 13px Arial";
      c.ctx.fillText(v.label + " " + percent(v.value, total), 218, y + 2);
    });
  }
  function drawProductRevenueChart(rows) {
    var c = prepareCanvas("productRevenueChart");
    if (!c) return;
    rows = rows.slice(0, 6);
    var max = Math.max.apply(Math, rows.map(function (r) { return r.subtotal; }).concat([1]));
    c.ctx.font = "700 12px Arial";
    rows.forEach(function (r, i) {
      var y = 34 + i * 30;
      var w = (Number(r.subtotal || 0) / max) * (c.canvas.width - 190);
      c.ctx.fillStyle = "#eaf4ee";
      c.ctx.fillRect(132, y - 15, c.canvas.width - 162, 20);
      c.ctx.fillStyle = "#24784c";
      c.ctx.fillRect(132, y - 15, w, 20);
      c.canvas._metricTargets.push({
        type: "rect", x: 132, y: y - 15, w: Math.max(8, w), h: 20,
        label: "<b>" + escapeHtml(r.name || "Producto") + "</b><span>" + money(r.subtotal) + " · " + r.qty + " vendido(s)</span>"
      });
      c.ctx.fillStyle = "#24211d";
      c.ctx.fillText(String(r.name || "Producto").slice(0, 17), 12, y);
      c.ctx.fillText(money(r.subtotal), 140 + w, y);
    });
    if (!rows.length) {
      c.ctx.fillStyle = "#6f675d";
      c.ctx.font = "700 15px Arial";
      c.ctx.fillText("Sin ventas por producto", 28, 42);
    }
  }

  function activityTone(a) {
    var action = String(a.action || "");
    if (a.severity === "critical" || /DELETED|UNDONE|REVIEW_REQUIRED/.test(action)) return "critical";
    if (a.severity === "warning" || /EDITED|SYNCED|WITHDRAWAL|EXPENSE|CLOSED/.test(action)) return "warning";
    if (/LOGIN|LOGOUT|CREATED|RECEIVED/.test(action)) return "normal";
    return "info";
  }
  function activityLabel(action) {
    return String(action || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function renderActivity() {
    if (!isDev() || !$("auditList")) return;
    all("auditLog").then(function (rows) {
      var counts = { critical: 0, warning: 0, normal: 0, info: 0 };
      rows.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
      rows.forEach(function (a) { counts[activityTone(a)]++; });
      if ($("activitySummary")) {
        $("activitySummary").innerHTML = summary([
          ["Total", rows.length],
          ["Criticos", counts.critical],
          ["Advertencias", counts.warning],
          ["Normales", counts.normal]
        ]);
      }
      $("auditList").innerHTML = rows.slice(0, 180).map(function (a) {
        var tone = activityTone(a);
        var stamp = (a.createdAt || "").slice(0, 19).replace("T", " ");
        return "<article class='activity-row " + tone + "'>"
          + "<div class='activity-time'><b>" + escapeHtml(stamp || "sin fecha") + "</b><span>" + escapeHtml(a.username || "sistema") + "</span></div>"
          + "<div class='activity-main'><div><strong>" + escapeHtml(activityLabel(a.action)) + "</strong><small>" + escapeHtml(a.action || "") + "</small></div><p>" + escapeHtml(a.detail || "Sin detalle") + "</p></div>"
          + "<span class='activity-pill " + tone + "'>" + (tone === "critical" ? "Revisar" : tone === "warning" ? "Atencion" : tone === "info" ? "Info" : "OK") + "</span>"
          + "</article>";
      }).join("") || empty("Todavia no hay actividad registrada.");
    });
  }
  function renderAdmin() {
    if (!isAdmin()) return;
    all("users").then(function (users) {
      if ($("usersSummary")) {
        $("usersSummary").innerHTML = summary([
          ["Visibles", users.length],
          ["Empleados", users.filter(function (u) { return u.role === "employee"; }).length],
          ["Admins", users.filter(function (u) { return u.role === "admin"; }).length],
          ["Inactivos", users.filter(function (u) { return !u.active; }).length]
        ]);
      }
      $("usersList").innerHTML = users.length ? users.map(function (u) {
        var roleLabel = u.role === "admin" ? "Admin" : u.role === "dev" ? "Developer" : "Empleado";
        var initials = (u.displayName || u.username || "?").trim().slice(0, 2).toUpperCase();
        var locked = currentUser && currentUser.id === u.id;
        return "<article class='user-row " + (u.active ? "active" : "inactive") + "'>"
          + "<div class='user-avatar'>" + escapeHtml(initials) + "</div>"
          + "<div class='user-main'><strong>" + escapeHtml(u.displayName || u.username) + "</strong><span>@" + escapeHtml(u.username) + "</span></div>"
          + "<span class='user-role " + escapeHtml(u.role || "employee") + "'>" + roleLabel + "</span>"
          + "<span class='user-status " + (u.active ? "ok" : "off") + "'>" + (u.active ? "Activo" : "Inactivo") + "</span>"
          + "<small>" + escapeHtml((u.createdAt || "").slice(0, 10) || "Sin fecha") + "</small>"
          + "<div class='user-actions'><button type='button' data-user-edit='" + u.id + "'>Editar</button>"
          + "<button type='button' class='danger' data-user-delete='" + u.id + "'" + (locked ? " disabled" : "") + ">Borrar</button></div>"
          + "</article>";
      }).join("") : empty("No hay usuarios visibles.");
      document.querySelectorAll("[data-user-edit]").forEach(function (btn) {
        btn.onclick = function () { openUserEdit(btn.dataset.userEdit); };
      });
      document.querySelectorAll("[data-user-delete]").forEach(function (btn) {
        btn.onclick = function () { deleteUser(btn.dataset.userDelete); };
      });
    });
    renderActivity();
  }
  function openUserEdit(id) {
    if (!isAdmin()) return;
    all("users").then(function (users) {
      var user = users.filter(function (u) { return u.id === id; })[0];
      if (!user) { toast("Usuario no encontrado"); return; }
      $("editUserId").value = user.id;
      $("editUsername").value = user.username || "";
      $("editDisplayName").value = user.displayName || "";
      $("editRole").value = user.role || "employee";
      $("editPassword").value = "";
      $("editActive").value = String(user.active !== false);
      $("deleteUserBtn").disabled = currentUser && currentUser.id === user.id;
      $("userEditModal").classList.remove("hidden");
      $("editDisplayName").focus();
    });
  }
  function closeUserEdit() {
    if ($("userEditModal")) $("userEditModal").classList.add("hidden");
  }
  function saveUserEdit(e) {
    if (e) e.preventDefault();
    if (!isAdmin()) return;
    var id = $("editUserId").value;
    all("users").then(function (users) {
      var user = users.filter(function (u) { return u.id === id; })[0];
      if (!user) { toast("Usuario no encontrado"); return; }
      var username = $("editUsername").value.trim();
      if (!username) { toast("Usuario obligatorio"); $("editUsername").focus(); return; }
      var duplicate = users.filter(function (u) { return u.id !== id && u.username === username; })[0];
      if (duplicate) { toast("Ya existe ese usuario"); $("editUsername").focus(); return; }
      if (currentUser && currentUser.id === id && $("editActive").value !== "true") {
        toast("No puede desactivar el usuario actual");
        return;
      }
      user.username = username;
      user.displayName = $("editDisplayName").value.trim() || username;
      user.role = $("editRole").value;
      var editedPassword = $("editPassword").value.trim();
      if (editedPassword) user.password = editedPassword;
      user.active = $("editActive").value === "true";
      user.updatedAt = nowIso();
      add("users", user).then(function () {
        return audit("USER_EDITED", username, "warning");
      }).then(function () {
        if (currentUser && currentUser.id === id) {
          currentUser = user;
          currentSession.username = user.username;
          currentSession.displayName = user.displayName;
          currentSession.role = user.role;
          sessionStorage.setItem("bakerySession", JSON.stringify({ user: currentUser, session: currentSession }));
          $("sessionInfo").innerHTML = "Usuario: <b>" + currentUser.displayName + "</b> | Fecha: <b>" + currentSession.businessDate + "</b> | Turno: <b>" + currentSession.shiftType + "</b>";
          buildTabs();
        }
        closeUserEdit();
        renderAdmin();
        renderLoginUsers(username);
        toast("Usuario actualizado");
      });
    });
  }
  function deleteUser(id) {
    if (!isAdmin()) return;
    all("users").then(function (users) {
      var user = users.filter(function (u) { return u.id === id; })[0];
      if (!user) { toast("Usuario no encontrado"); return; }
      if (currentUser && currentUser.id === id) { toast("No puede borrar el usuario actual"); return; }
      if (!confirm("Borrar usuario " + (user.displayName || user.username) + "?")) return;
      del("users", id).then(function () {
        return audit("USER_DELETED", user.username, "critical");
      }).then(function () {
        renderAdmin();
        renderLoginUsers();
        toast("Usuario borrado");
      });
    });
  }
  function saveUser(e) {
    e.preventDefault();
    if (!isAdmin()) return;
    var username = $("newUsername").value.trim();
    var password = $("newPassword").value.trim();
    if (!username) { toast("Usuario obligatorio"); return; }
    if (!password) { toast("Clave obligatoria"); $("newPassword").focus(); return; }
    all("users").then(function (users) {
      var duplicate = users.filter(function (u) { return u.username === username; })[0];
      if (duplicate) { toast("Ya existe ese usuario"); return; }
      return add("users", {
        id: uid(), username: username, displayName: $("newDisplayName").value.trim() || username,
        role: $("newRole").value, password: password, active: true, createdAt: nowIso()
      }).then(function () { return audit("USER_CREATED", username); }).then(function () {
        $("userForm").reset();
        renderAdmin();
        renderLoginUsers(username);
      });
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
  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function isoAt(date, hour, minute) {
    var d = new Date(date + "T00:00:00");
    d.setHours(hour, minute || 0, rand(0, 59), 0);
    return d.toISOString();
  }
  function addDaysTo(date, offset) {
    var d = new Date(date);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  function sample(arr) {
    return arr[rand(0, arr.length - 1)];
  }
  function generateTestData() {
    if (!isDev()) return;
    if (isGeneratingTestData) { toast("Ya se estan generando datos"); return; }
    isGeneratingTestData = true;
    var started = Date.now();
    if ($("generateTestDataBtn")) $("generateTestDataBtn").disabled = true;
    var months = Math.max(1, Math.min(6, Number($("testDataMonths").value || 6)));
    var days = months * 30;
    toast("Generando datos de prueba...");
    Promise.all([all("users"), all("products")]).then(function (data) {
      var users = data[0];
      var products = data[1].filter(function (p) { return p.active !== false; });
      var turnoAM = users.filter(function (u) { return u.username === "turno_manana"; })[0] || currentUser;
      var turnoPM = users.filter(function (u) { return u.username === "turno_tarde"; })[0] || currentUser;
      if (!products.length) {
        isGeneratingTestData = false;
        if ($("generateTestDataBtn")) $("generateTestDataBtn").disabled = false;
        return seed().then(generateTestData);
      }
      var todayDate = today();
      var batches = {
        transactions: [],
        baskets: [],
        basketItems: [],
        closures: [],
        productionItems: [],
        monthlyEntries: [],
        auditLog: []
      };
      for (var offset = days - 1; offset >= 0; offset--) {
        var date = addDaysTo(todayDate, -offset);
        var weekday = new Date(date + "T00:00:00").getDay();
        var dailySales = weekday === 0 ? rand(14, 24) : rand(26, 58);
        ["AM", "PM"].forEach(function (shift) {
          var user = shift === "AM" ? turnoAM : turnoPM;
          var shiftSales = Math.max(4, Math.round(dailySales * (shift === "AM" ? .48 : .52)));
          var shiftCash = 0;
          var shiftTransfer = 0;
          var shiftWithdrawals = 0;
          for (var i = 0; i < shiftSales; i++) {
            var isTicket = Math.random() > .38;
            var method = Math.random() > .32 ? "Efectivo" : "Transferencia";
            var hour = shift === "AM" ? rand(7, 13) : rand(14, 20);
            var minute = rand(0, 59);
            var created = isoAt(date, hour, minute);
            var transactionId = uid();
            var basketId = isTicket ? uid() : "";
            var itemCount = isTicket ? rand(1, 4) : 0;
            var amount = 0;
            var items = [];
            if (isTicket) {
              for (var j = 0; j < itemCount; j++) {
                var p = sample(products);
                var qty = p.unitType === "kg" ? (rand(1, 12) / 10) : rand(1, 5);
                var subtotal = Math.max(300, Math.round(qty * Number(p.price || 1000)));
                amount += subtotal;
                items.push({ product: p, qty: qty, subtotal: subtotal });
              }
            } else {
              amount = [500, 800, 1000, 1500, 2000, 2500, 3000, 4500, 6000, 8500, 12000][rand(0, 10)];
              if (Math.random() > .97) amount = rand(100000, 180000);
            }
            if (method === "Efectivo") shiftCash += amount;
            else shiftTransfer += amount;
            var transferStatus = method === "Transferencia" ? (Math.random() > .12 ? "RECEIVED" : (Math.random() > .5 ? "PENDING" : "REVIEW")) : "";
            batches.transactions.push({
              id: transactionId, type: "SALE", amount: amount, paymentMethod: method, businessDate: date,
              shiftType: shift, userId: user && user.id, sessionId: "test-" + date + "-" + shift,
              createdAt: created, deleted: false, saleMode: isTicket ? "PRODUCT_BASKET" : "FAST",
              basketId: basketId, transferStatus: transferStatus, paidAmount: isTicket ? amount + [0, 500, 1000, 2000][rand(0, 3)] : 0,
              changeAmount: 0, itemCount: itemCount
            });
            if (isTicket) {
              batches.baskets.push({ id: basketId, createdAt: created, userId: user && user.id, total: amount, paymentMethod: method, transactionId: transactionId });
              items.forEach(function (it) {
                batches.basketItems.push({ id: uid(), basketId: basketId, productId: it.product.id, productName: it.product.name, quantity: it.qty, unitPrice: Number(it.product.price || 0), subtotal: it.subtotal });
              });
            }
          }
          if (Math.random() > .35) {
            var withdrawal = [2000, 5000, 10000, 15000, 20000][rand(0, 4)];
            shiftWithdrawals += withdrawal;
            batches.transactions.push({
              id: uid(), type: "WITHDRAWAL", amount: withdrawal, paymentMethod: "Efectivo", businessDate: date,
              shiftType: shift, userId: user && user.id, sessionId: "test-" + date + "-" + shift,
              createdAt: isoAt(date, shift === "AM" ? 12 : 18, rand(0, 59)), deleted: false, withdrawnBy: "Encargado test"
            });
          }
          batches.closures.push({
            id: uid(), businessDate: date, shiftType: shift, closureKind: "COMPLETE",
            totalSales: shiftCash + shiftTransfer, expectedCash: shiftCash - shiftWithdrawals, expectedTransfer: shiftTransfer,
            countedCash: shiftCash - shiftWithdrawals + [-500, 0, 0, 0, 500][rand(0, 4)],
            countedTransfer: shiftTransfer, differenceCash: 0, differenceTransfer: 0,
            notes: "Cierre test", createdBy: user && user.id, createdAt: isoAt(date, shift === "AM" ? 14 : 21, 0)
          });
        });
        if (weekday !== 0) {
          products.slice(0, Math.min(products.length, rand(4, 8))).forEach(function (p) {
            batches.productionItems.push({
              id: uid(), date: date, productId: p.id, productName: p.name, unitType: p.unitType || "unidad",
              enteredAmount: p.unitType === "kg" ? rand(8, 95) : rand(12, 160), category: p.category || "",
              createdBy: currentUser && currentUser.id, createdAt: isoAt(date, 6, rand(20, 50))
            });
          });
        }
        if (weekday === 1 || Math.random() > .88) {
          batches.monthlyEntries.push({
            id: uid(), type: "EXPENSE", date: date, amount: [8000, 15000, 28000, 45000, 70000][rand(0, 4)],
            category: sample(monthlyCategories), description: "Gasto test", paymentMethod: Math.random() > .5 ? "Efectivo" : "Transferencia",
            recurring: false, weekday: weekday, photoData: "", createdBy: currentUser && currentUser.id, createdAt: isoAt(date, 16, rand(0, 59))
          });
        }
      }
      batches.auditLog.push({
        id: uid(), createdAt: nowIso(), userId: currentUser && currentUser.id,
        username: currentUser && currentUser.username, action: "TEST_DATA_GENERATED",
        detail: months + " mes(es) de datos de prueba", severity: "warning"
      });
      return Promise.all(Object.keys(batches).map(function (store) {
        return addMany(store, batches[store]);
      }));
    }).then(function () {
      isGeneratingTestData = false;
      if ($("generateTestDataBtn")) $("generateTestDataBtn").disabled = false;
      renderAll();
      toast("Datos de prueba generados en " + ((Date.now() - started) / 1000).toFixed(1) + "s");
    }).catch(function (err) {
      isGeneratingTestData = false;
      if ($("generateTestDataBtn")) $("generateTestDataBtn").disabled = false;
      toast("No se pudieron generar datos: " + (err && err.message ? err.message : "error local"));
    });
  }
  function clearAllData() {
    if (!isDev()) return;
    $("clearDataConfirm").value = "";
    $("clearDataModal").classList.remove("hidden");
    $("clearDataConfirm").focus();
  }
  function closeClearDataModal() {
    $("clearDataModal").classList.add("hidden");
  }
  function confirmClearAllData(e) {
    if (e) e.preventDefault();
    if (!isDev()) return;
    var confirmation = $("clearDataConfirm").value.trim();
    if (confirmation !== "BORRAR") {
      toast("Escriba BORRAR para confirmar");
      $("clearDataConfirm").focus();
      return;
    }
    $("clearDataModal").classList.add("hidden");
    toast("Borrando datos...");
    Promise.all(STORES.map(clearStore)).then(function () {
      sessionStorage.removeItem("bakerySession");
      localStorage.removeItem("bakeryTabOrder");
      return seed();
    }).then(function () {
      toast("Datos borrados. Inicie sesion de nuevo.");
      setTimeout(function () { location.reload(); }, 600);
    });
  }

  function renderAll() {
    renderCaja();
    if (currentTab === "Cierres") renderClosures();
    if (currentTab === "Balance") renderMonthly();
    if (currentTab === "Produccion") renderProduction();
    if (currentTab === "Metricas") renderMetrics();
    if (currentTab === "Movimientos") renderMovements();
    if (currentTab === "Actividad") renderActivity();
    if (currentTab === "Usuarios" || currentTab === "Dev") renderAdmin();
    if (currentTab === "Dev") renderDev();
  }
  function renderDev() {
    if (!isDev()) return;
    Promise.all(STORES.map(all)).then(function (sets) {
      var totals = {};
      STORES.forEach(function (s, i) { totals[s] = sets[i].length; });
      if ($("devSummary")) {
        $("devSummary").innerHTML = summary([
          ["Ventas", totals.transactions],
          ["Productos", totals.products],
          ["Usuarios", totals.users],
          ["Auditoria", totals.auditLog]
        ]);
      }
      if ($("devStoreList")) {
        $("devStoreList").innerHTML = STORES.map(function (name) {
          return "<div><span>" + escapeHtml(name) + "</span><b>" + totals[name] + "</b></div>";
        }).join("");
      }
      loadDevUiSettings();
      loadUpdateSettings();
    });
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
  function handleMonthlyPhoto(file) {
    if (!file) { monthlyPhotoData = ""; return; }
    var reader = new FileReader();
    reader.onload = function () {
      monthlyPhotoData = reader.result;
      toast("Foto adjuntada");
    };
    reader.readAsDataURL(file);
  }
  function renderMonthlyReasonOptions() {
    all("monthlyEntries").then(function (entries) {
      var seen = {};
      monthlyCategories.forEach(function (c) { seen[c] = true; });
      entries.forEach(function (e) { if (e.category) seen[e.category] = true; });
      $("monthlyReasonOptions").innerHTML = Object.keys(seen).sort().map(function (c) {
        return "<option value='" + escapeHtml(c) + "'></option>";
      }).join("");
    });
  }
  function startSplitResize(e) {
    e.preventDefault();
    var layout = $("cashierLayout");
    if (!layout || window.innerWidth < 981) return;
    var rect = layout.getBoundingClientRect();
    splitDrag = { layout: layout, left: rect.left, width: rect.width };
    document.body.classList.add("resizing-split");
    moveSplitResize(e);
  }
  function eventPoint(e) {
    var point = e && e.touches && e.touches.length ? e.touches[0] : e && e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e;
    return { x: Number(point && point.clientX || 0), y: Number(point && point.clientY || 0) };
  }
  function moveSplitResize(e) {
    if (!splitDrag) return;
    if (e && e.preventDefault) e.preventDefault();
    var point = eventPoint(e);
    var minLeft = 360;
    var minRight = 390;
    var handle = 14;
    var leftWidth = Math.max(minLeft, Math.min(splitDrag.width - minRight - handle, point.x - splitDrag.left));
    splitDrag.layout.style.setProperty("--sale-width", leftWidth + "px");
    document.documentElement.style.setProperty("--sale-width", leftWidth + "px");
    if ($("devSaleWidth")) {
      $("devSaleWidth").value = Math.round(leftWidth / 10) * 10;
      updateDevUiOutputs();
    }
  }
  function stopSplitResize() {
    if (!splitDrag) return;
    var s = devUiSettings();
    var value = parseInt(document.documentElement.style.getPropertyValue("--sale-width"), 10);
    if (value) {
      s.saleWidth = value;
      persistDevUiSettings(s);
    }
    splitDrag = null;
    document.body.classList.remove("resizing-split");
  }
  function startShelfResize(e) {
    e.preventDefault();
    var strip = $("productGrid");
    if (!strip) return;
    var rect = strip.getBoundingClientRect();
    shelfDrag = { strip: strip, top: rect.top };
    document.body.classList.add("resizing-shelf");
    moveShelfResize(e);
  }
  function moveShelfResize(e) {
    if (!shelfDrag) return;
    if (e && e.preventDefault) e.preventDefault();
    var point = eventPoint(e);
    var height = Math.max(96, Math.min(520, point.y - shelfDrag.top));
    document.documentElement.style.setProperty("--product-shelf-height", height + "px");
    if ($("devShelfHeight")) {
      $("devShelfHeight").value = Math.round(height / 10) * 10;
      updateDevUiOutputs();
    }
  }
  function stopShelfResize() {
    if (!shelfDrag) return;
    var s = devUiSettings();
    var value = parseInt(document.documentElement.style.getPropertyValue("--product-shelf-height"), 10);
    if (value) {
      s.shelfHeight = value;
      persistDevUiSettings(s);
    }
    shelfDrag = null;
    document.body.classList.remove("resizing-shelf");
  }
  function bindResizeHandle(handle, startFn) {
    if (!handle) return;
    handle.onpointerdown = startFn;
    handle.onmousedown = startFn;
    handle.ontouchstart = startFn;
  }
  function bind() {
    attachLoginHandlers();
    $("logoutBtn").onclick = logout;
    $("saleForm").onsubmit = saveQuickSale;
    $("withdrawForm").onsubmit = saveWithdrawal;
    $("undoBtn").onclick = undoLastSale;
    $("closureForm").onsubmit = saveClosure;
    if ($("closureDateSelect")) $("closureDateSelect").onchange = function () { setClosureContext($("closureDateSelect").value, "", true); renderClosures(); };
    if ($("closureShiftSelect")) $("closureShiftSelect").onchange = function () { setClosureContext(activeClosureDate(), $("closureShiftSelect").value, true); renderClosures(); };
    $("countedCash").oninput = updateClosureDiffs;
    $("countedTransfer").oninput = updateClosureDiffs;
    $("monthlyForm").onsubmit = saveMonthly;
    $("productionForm").onsubmit = saveProduction;
    $("productionProduct").onchange = updateProductionProductFields;
    if ($("productionAction")) $("productionAction").onchange = updateProductionActionUi;
    updateProductionActionUi();
    $("userForm").onsubmit = saveUser;
    if ($("userEditForm")) $("userEditForm").onsubmit = saveUserEdit;
    if ($("closeUserEditModal")) $("closeUserEditModal").onclick = closeUserEdit;
    if ($("deleteUserBtn")) $("deleteUserBtn").onclick = function () { deleteUser($("editUserId").value); };
    $("exportBtn").onclick = exportData;
    $("integrationForm").onsubmit = saveIntegrationSettings;
    if ($("devUiForm")) $("devUiForm").onsubmit = saveDevUiSettings;
    if ($("devDensity")) $("devDensity").onchange = previewDevUiSettings;
    if ($("devTheme")) $("devTheme").onchange = previewDevUiSettings;
    if ($("devMotion")) $("devMotion").onchange = previewDevUiSettings;
    if ($("devPerformance")) $("devPerformance").onchange = function () { previewDevUiSettings(); startMpSync(); };
    if ($("devSaleWidth")) $("devSaleWidth").oninput = previewDevUiSettings;
    if ($("devShelfHeight")) $("devShelfHeight").oninput = previewDevUiSettings;
    if ($("resetDevUiBtn")) $("resetDevUiBtn").onclick = resetDevUiSettings;
    if ($("resetTabOrderBtn")) $("resetTabOrderBtn").onclick = resetTabOrder;
    if ($("autoUpdateCheck")) $("autoUpdateCheck").onchange = saveUpdateSettings;
    if ($("checkUpdatesBtn")) $("checkUpdatesBtn").onclick = function () { checkForUpdates(false); };
    if ($("copyUpdaterCommandBtn")) $("copyUpdaterCommandBtn").onclick = copyUpdaterCommand;
    if ($("downloadUpdateBtn")) $("downloadUpdateBtn").onclick = downloadUpdate;
    if ($("openRepoBtn")) $("openRepoBtn").onclick = openUpdateRepo;
    if ($("closeUpdateModal")) $("closeUpdateModal").onclick = closeUpdateModal;
    if ($("copyUpdaterCommandModalBtn")) $("copyUpdaterCommandModalBtn").onclick = copyUpdaterCommand;
    if ($("downloadUpdateModalBtn")) $("downloadUpdateModalBtn").onclick = downloadUpdate;
    if ($("openRepoModalBtn")) $("openRepoModalBtn").onclick = openUpdateRepo;
    if ($("generateTestDataBtn")) $("generateTestDataBtn").onclick = generateTestData;
    if ($("clearAllDataBtn")) $("clearAllDataBtn").onclick = clearAllData;
    if ($("clearDataForm")) $("clearDataForm").onsubmit = confirmClearAllData;
    if ($("closeClearDataModal")) $("closeClearDataModal").onclick = closeClearDataModal;
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
    $("movementFilters").oninput = scheduleRenderMovements;
    $("movementFilters").onchange = renderMovements;
    $("movementsList").onscroll = function () {
      var list = $("movementsList");
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - 180) loadMoreMovements();
    };
    $("selectVisibleMovements").onclick = selectVisibleMovements;
    $("clearMovementSelection").onclick = clearMovementSelection;
    $("editMovementBtn").onclick = openMovementEdit;
    $("deleteMovementBtn").onclick = openMovementDelete;
    $("movementEditForm").onsubmit = saveMovementEdit;
    $("closeMovementEditModal").onclick = closeMovementEdit;
    $("movementDeleteForm").onsubmit = deleteSelectedMovements;
    $("closeMovementDeleteModal").onclick = closeMovementDelete;
    $("monthlyPhoto").onchange = function () { handleMonthlyPhoto($("monthlyPhoto").files[0]); };
    $("monthlyRecurring").onchange = function () { $("monthlyWeekdayWrap").classList.toggle("hidden", !$("monthlyRecurring").checked); };
    $("quickModeBtn").onclick = function () { setSaleMode("quick"); };
    $("basketModeBtn").onclick = function () { setSaleMode("basket"); };
    $("clearBasketBtn").onclick = function () { basket = []; renderBasket(); };
    $("chargeBasketBtn").onclick = chargeBasket;
    if ($("mercadoPagoBtn")) $("mercadoPagoBtn").onclick = checkoutMercadoPago;
    $("openWithdrawBtn").onclick = openWithdrawModal;
    $("reviewPaymentsCard").onclick = openReviewTransfersModal;
    $("closeReviewTransfersModal").onclick = closeReviewTransfersModal;
    bindResizeHandle($("splitResizeHandle"), startSplitResize);
    bindResizeHandle($("shelfResizeHandle"), startShelfResize);
    $("cropPreview").onpointerdown = startCropDrag;
    $("cropPreview").onmousedown = startCropDrag;
    $("cropPreview").ontouchstart = startCropDrag;
    document.addEventListener("pointermove", function (e) { moveSplitResize(e); moveShelfResize(e); moveCropDrag(e); });
    document.addEventListener("mousemove", function (e) { moveSplitResize(e); moveShelfResize(e); moveCropDrag(e); });
    document.addEventListener("touchmove", function (e) { moveSplitResize(e); moveShelfResize(e); moveCropDrag(e); }, { passive: false });
    document.addEventListener("pointerup", function () {
      stopSplitResize();
      stopShelfResize();
      stopCropDrag();
      if (movementDragSelect) {
        movementDragSelect = null;
        if (currentTab === "Movimientos") renderMovements();
      }
    });
    document.addEventListener("mouseup", function () {
      stopSplitResize();
      stopShelfResize();
      stopCropDrag();
    });
    document.addEventListener("touchend", function () {
      stopSplitResize();
      stopShelfResize();
      stopCropDrag();
    });
    $("closeWithdrawModal").onclick = closeWithdrawModal;
    $("closeUndoModal").onclick = closeUndoModal;
    $("undoForm").onsubmit = confirmUndoSale;
    $("closeProductModal").onclick = closeProductModal;
    $("closeProductEditorModal").onclick = closeProductEditor;
    $("closeProductFormModal").onclick = closeProductForm;
    $("newProductBtn").onclick = function () { openProductForm(null); };
    $("productSaleForm").onsubmit = function (e) { e.preventDefault(); addProductToTicket(); };
    $("productEditorForm").onsubmit = saveProductEditor;
    $("addProductToTicket").onclick = null;
    $("openCustomItemBtn").onclick = openCustomItemModal;
    $("closeCustomItemModal").onclick = closeCustomItemModal;
    $("customItemForm").onsubmit = saveCustomItem;
    $("customItemQty").oninput = updateCustomItemTotal;
    $("customItemPrice").oninput = updateCustomItemTotal;
    $("editProductImage").onchange = function () { handleProductImage($("editProductImage").files[0]); };
    $("cropZoom").oninput = updateCropPreview;
    $("cropX").oninput = updateCropPreview;
    $("cropY").oninput = updateCropPreview;
    $("productPriceInput").oninput = updateProductModalTotal;
    $("productQuantityInput").oninput = updateProductModalTotal;
    $("productQuantityInput").onkeydown = function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        addProductToTicket();
      }
    };
    $("saleAmount").oninput = scheduleSaleAutoSave;
    $("ticketPaid").oninput = renderBasket;
    if ($("ticketPaymentSelect")) $("ticketPaymentSelect").onchange = renderBasket;
    $("productModal").onclick = function (e) { if (e.target === $("productModal") && selectedProduct) $("productQuantityInput").focus(); };
    $("productModal").oncontextmenu = function (e) { e.preventDefault(); if (selectedProduct) closeProductModal(); };
    $("withdrawModal").onclick = function (e) { if (e.target === $("withdrawModal")) closeWithdrawModal(); };
    $("undoModal").onclick = function (e) { if (e.target === $("undoModal")) closeUndoModal(); };
    $("productEditorModal").onclick = function (e) { if (e.target === $("productEditorModal")) closeProductEditor(); };
    $("productFormModal").onclick = function (e) { if (e.target === $("productFormModal")) closeProductForm(); };
    $("customItemModal").onclick = function (e) { if (e.target === $("customItemModal")) closeCustomItemModal(); };
    $("reviewTransfersModal").onclick = function (e) { if (e.target === $("reviewTransfersModal")) closeReviewTransfersModal(); };
    $("movementEditModal").onclick = function (e) { if (e.target === $("movementEditModal")) closeMovementEdit(); };
    $("movementDeleteModal").onclick = function (e) { if (e.target === $("movementDeleteModal")) closeMovementDelete(); };
    if ($("userEditModal")) $("userEditModal").onclick = function (e) { if (e.target === $("userEditModal")) closeUserEdit(); };
    if ($("clearDataModal")) $("clearDataModal").onclick = function (e) { if (e.target === $("clearDataModal")) closeClearDataModal(); };
    if ($("updateModal")) $("updateModal").onclick = function (e) { if (e.target === $("updateModal")) closeUpdateModal(); };
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
    document.addEventListener("click", function (e) {
      if (!e.target || !e.target.closest || !e.target.closest("#productContextMenu")) closeProductContextMenu();
      var target = e.target;
      while (target && target !== document) {
        if (target.id === "loginSubmitBtn") {
          login(e);
          if (e.stopPropagation) e.stopPropagation();
          return;
        }
        target = target.parentNode;
      }
    }, true);
  }
  function fillSelects() {
    renderMonthlyReasonOptions();
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
    updateAppHeight();
    window.addEventListener("resize", updateAppHeight);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", updateAppHeight);
    attachLoginHandlers();
    if (!("indexedDB" in window)) {
      alert("Este navegador no soporta IndexedDB. Use Chrome, Edge o Firefox.");
      return;
    }
    bind();
    loadDevUiSettings();
    loadUpdateSettings();
    fillSelects();
    setPayment("Efectivo");
    setSaleMode("quick");
    seed().then(function () {
      return renderLoginUsers("turno_manana");
    }).then(function () {
      restoreSession();
      if (updateSettings().autoCheck !== false) checkForUpdates(true);
      // PWA registration is intentionally left off during local preview so UI changes are never hidden by cache.
    });
  });
})();
