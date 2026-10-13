/* main.js – Start, Anmeldung, Anzeigename, Navigation, Echtzeit */
(function () {
  'use strict';
  const App = window.App;
  const { S, el, icon } = App;
  const root = document.getElementById('root');
  const APP_NAME = (App.cfg && App.cfg.APP_NAME) || 'Dienst-App';

  let booted = false;
  let channel = null;
  let tickTimer = null;
  let lastEdSig = '';
  let lastDay = App.ymd(new Date());

  const TABS = [
    { id: 'home', label: 'Start', icon: 'home' },
    { id: 'chat', label: 'Chat', icon: 'chat' },
    { id: 'plan', label: 'Dienstplan', icon: 'calendar' },
    { id: 'material', label: 'Material', icon: 'box' },
    { id: 'admin', label: 'Verwaltung', icon: 'shield', admin: true },
  ];

  /* ---------- Bildschirme ---------- */
  function showCenter(...children) {
    root.replaceChildren(el('div', { class: 'center-screen' }, ...children));
  }

  function showConfigHelp() {
    showCenter(el('div', { class: 'card auth' },
      el('h2', {}, 'Fast fertig – Supabase fehlt noch'),
      el('p', {}, 'Trage in der Datei ', el('code', {}, 'public/config.js'), ' die URL und den „anon public“-Key deines Supabase-Projekts ein und lade die Seite neu.')));
  }

  function showFatal(e) {
    console.error(e);
    showCenter(el('div', { class: 'card auth' },
      el('h2', {}, 'Das hat nicht geklappt'),
      el('p', {}, App.errMsg(e)),
      el('p', { class: 'small muted' }, 'Wurde die Datei supabase/schema.sql im Supabase SQL-Editor ausgeführt?'),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Neu laden'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => App.sb.auth.signOut() }, 'Abmelden'))));
  }

  function showAuth() {
    let signup = false;
    const email = el('input', { class: 'input', type: 'email', placeholder: 'E-Mail', autocomplete: 'username', required: true });
    const pw = el('input', { class: 'input', type: 'password', placeholder: 'Passwort', autocomplete: 'current-password', required: true });
    const msg = el('div', { class: 'form-msg', role: 'alert' });
    const submit = el('button', { class: 'btn primary block', type: 'submit' }, 'Anmelden');
    const toggle = el('button', { class: 'link', type: 'button' }, 'Erstes Konto anlegen (Einrichtung)');

    const setMode = (s) => {
      signup = s;
      submit.textContent = s ? 'Konto anlegen' : 'Anmelden';
      toggle.textContent = s ? 'Zurück zur Anmeldung' : 'Erstes Konto anlegen (Einrichtung)';
      pw.autocomplete = s ? 'new-password' : 'current-password';
      msg.textContent = '';
    };
    toggle.addEventListener('click', () => setMode(!signup));

    const form = el('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      msg.textContent = '';
      submit.disabled = true;
      try {
        if (signup) {
          if (pw.value.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
          const { data, error } = await App.sb.auth.signUp({ email: email.value.trim(), password: pw.value });
          if (error) throw error;
          if (!data.session) {
            msg.className = 'form-msg ok';
            msg.textContent = 'Konto angelegt. Bitte die E-Mail bestätigen (oder in Supabase „Confirm email“ ausschalten) und dann anmelden.';
          }
        } else {
          const { error } = await App.sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
          if (error) throw error;
        }
      } catch (err) {
        msg.className = 'form-msg err';
        msg.textContent = App.errMsg(err);
      } finally { submit.disabled = false; }
    } }, email, pw, msg, submit);

    showCenter(el('div', { class: 'card auth' },
      el('img', { src: '/icons/icon-192.png', class: 'logo', alt: '' }),
      el('h1', {}, APP_NAME),
      el('p', { class: 'muted' }, 'Bitte melde dich an.'),
      form,
      el('div', { class: 'center' }, toggle)));
    email.focus();
  }

  // Beim ersten Login Anzeigenamen festlegen
  function askName() {
    return new Promise((resolve) => {
      const input = el('input', { class: 'input', placeholder: 'z. B. Anna M.', maxlength: 30, autocomplete: 'nickname' });
      const err = el('div', { class: 'form-msg err' });
      let m;
      const save = async () => {
        const v = input.value.trim();
        if (v.length < 2) { err.textContent = 'Bitte mindestens 2 Zeichen eingeben.'; return; }
        const { error } = await App.sb.from('profiles').update({ display_name: v }).eq('id', S.session.user.id);
        if (error) { err.textContent = App.errMsg(error); return; }
        S.me.display_name = v;
        m.close();
        resolve();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      m = App.modal({
        title: 'Willkommen!',
        persistent: true,
        body: el('div', { class: 'stack' },
          el('p', {}, 'Wie sollen dich die anderen sehen? Dieser Anzeigename erscheint im Dienstplan und im Chat.'),
          input, err),
        actions: [el('button', { class: 'btn primary', type: 'button', onclick: save }, 'Weiter')],
      });
    });
  }

  /* ---------- Gerüst ---------- */
  function buildShell() {
    root.replaceChildren(
      el('header', { class: 'top' },
        el('div', { class: 'brand' }, el('img', { src: '/icons/icon-192.png', alt: '' }), el('span', {}, APP_NAME)),
        el('div', { class: 'who', id: 'who' }),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Abmelden', title: 'Abmelden', onclick: logout }, icon('logout'))),
      el('nav', { class: 'tabs', id: 'nav', 'aria-label': 'Hauptnavigation' }),
      el('main', { class: 'view', id: 'view' }));
    renderHeader();
    renderNav();
  }

  function renderHeader() {
    const who = document.getElementById('who');
    if (!who || !S.me) return;
    who.replaceChildren(el('span', { class: 'who-name' }, App.name(S.me)), App.dots(S.me.id));
  }

  function renderNav() {
    const nav = document.getElementById('nav');
    if (!nav) return;
    nav.replaceChildren(...TABS.filter((t) => !t.admin || App.isAdmin()).map((t) =>
      el('button', { type: 'button', class: 'tab' + (S.tab === t.id ? ' active' : ''), 'data-tab': t.id, onclick: () => App.go(t.id) },
        el('span', { class: 'ico' }, icon(t.icon, 22), el('i', { class: 'dot' })),
        el('span', { class: 'lbl' }, t.label))));
    App.updateBadges();
  }

  App.go = (tab) => {
    if (tab === 'admin' && !App.isAdmin()) tab = 'home';
    if (!App.views[tab]) tab = 'home';
    const prev = App.views[S.tab];
    if (prev && prev.unmount && S.tab !== tab) prev.unmount();
    S.tab = tab;
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    document.querySelectorAll('#nav .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const v = document.getElementById('view');
    if (!v) return;
    v.replaceChildren();
    v.className = 'view view-' + tab;
    App.views[tab].mount(v);
    App.updateBadges();
    window.scrollTo(0, 0);
  };

  async function logout() {
    await App.sb.auth.signOut();
  }

  /* ---------- Start ---------- */
  async function boot() {
    if (booted) return;
    booted = true;
    showCenter(el('div', { class: 'spinner' }));
    try {
      await Promise.all([App.load.roles(), App.load.profiles(), App.load.profileRoles()]);
      if (!S.me) throw new Error('Dein Profil wurde nicht gefunden. Bitte wende dich an einen Admin.');
      if (!S.me.display_name) await askName();
      await Promise.all([App.load.notes(), App.load.edItems(), App.load.material(), App.load.chat(), App.load.edWindow()]);
      lastEdSig = edSig();
      buildShell();
      subscribe();
      startTick();
      const wanted = (location.hash || '').replace('#', '');
      App.go(TABS.some((t) => t.id === wanted) ? wanted : 'home');
    } catch (e) {
      booted = false;
      showFatal(e);
    }
  }

  function teardown() {
    booted = false;
    if (channel) { App.sb.removeChannel(channel); channel = null; }
    clearInterval(tickTimer);
    const prev = App.views[S.tab];
    if (prev && prev.unmount) prev.unmount();
    Object.assign(S, { session: null, me: null, roles: [], profiles: [], profileRoles: [], notes: [], edItems: [], chat: [], material: [], tab: 'home', activeChat: 'group' });
    S.shifts = new Map();
  }

  /* ---------- Echtzeit ---------- */
  const LOADERS = {
    roles: 'roles', profiles: 'profiles', profile_roles: 'profileRoles',
    notes: 'notes', ed_items: 'edItems', material_items: 'material',
  };
  const timers = {};
  function reload(table) {
    clearTimeout(timers[table]);
    timers[table] = setTimeout(async () => {
      try {
        await App.load[LOADERS[table]]();
        if (['roles', 'profiles', 'profile_roles'].includes(table)) { renderHeader(); renderNav(); }
        refreshViews();
      } catch (e) { console.error(e); }
    }, 150);
  }

  function refreshViews() {
    const v = App.views[S.tab];
    if (v && v.update) v.update();
    App.updateBadges();
  }

  function subscribe() {
    channel = App.sb.channel('app-changes');
    const on = (table, fn) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, fn);

    on('chat_messages', (p) => {
      if (p.eventType === 'INSERT') {
        const m = p.new;
        if (!App.addChatMessage(m)) return;
        if (m.sender_id !== S.me.id) {
          const viewing = S.tab === 'chat' && document.visibilityState === 'visible' && S.activeChat === App.chatKey(m);
          if (!viewing) {
            const from = App.name(App.profileById(m.sender_id));
            App.toast(`${from}: ${m.body.length > 60 ? m.body.slice(0, 60) + '…' : m.body}`, 'info', 4000);
          }
        }
      } else if (p.eventType === 'DELETE') {
        S.chat = S.chat.filter((x) => x.id !== p.old.id);
      }
      if (S.tab === 'chat' && App.views.chat.update) App.views.chat.update();
      App.updateBadges();
    });

    on('shifts', (p) => {
      if (p.eventType === 'DELETE') {
        for (const [k, v] of S.shifts) if (v.id === p.old.id) S.shifts.delete(k);
      } else {
        S.shifts.set(p.new.profile_id + '|' + p.new.day, p.new);
      }
      onShiftsChanged();
    });

    Object.keys(LOADERS).forEach((t) => on(t, () => reload(t)));
    channel.subscribe();
  }

  function edSig() { return [...App.edState().ids].sort().join(','); }

  async function onShiftsChanged() {
    const sig = edSig();
    if (sig !== lastEdSig) {
      lastEdSig = sig;
      try { await App.load.edItems(); } catch (e) { /* egal */ }
      renderHeader();
    }
    refreshViews();
  }

  /* ---------- Minutentakt: Einsatzdienst wandert weiter ---------- */
  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(async () => {
      if (!S.me) return;
      const today = App.ymd(new Date());
      if (today !== lastDay) { lastDay = today; try { await App.load.edWindow(); } catch (e) { /* egal */ } }
      const sig = edSig();
      if (sig !== lastEdSig) {
        lastEdSig = sig;
        try { await App.load.edItems(); } catch (e) { /* egal */ }
        renderHeader();
        refreshViews();
      }
    }, 30000);
  }

  // Beim Zurückkehren in die App (Handy) alles auffrischen
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !booted || !S.me) return;
    try {
      await Promise.all([App.load.chat(), App.load.notes(), App.load.edItems(), App.load.material(), App.load.edWindow()]);
      refreshViews();
    } catch (e) { /* offline */ }
  });

  window.addEventListener('hashchange', () => {
    if (!booted || !S.me) return;
    const t = (location.hash || '').replace('#', '');
    if (t && t !== S.tab && TABS.some((x) => x.id === t)) App.go(t);
  });

  /* ---------- Los geht's ---------- */
  async function init() {
    document.title = APP_NAME;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (!App.configured) { showConfigHelp(); return; }

    App.sb.auth.onAuthStateChange((event, session) => {
      // Nicht direkt in diesem Callback auf Supabase warten (Deadlock-Gefahr) -> setTimeout
      setTimeout(() => {
        if (event === 'SIGNED_OUT') { teardown(); showAuth(); }
        else if (session) {
          S.session = session;
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') boot();
        }
      }, 0);
    });

    const { data } = await App.sb.auth.getSession();
    if (data.session) { S.session = data.session; boot(); }
    else showAuth();
  }

  init();
})();
