/* home.js – Startseite: Einsatzdienst, Zeitstrahl, Pinnwand mit privaten Notizen */
(function () {
  'use strict';
  const App = window.App;
  const { S, el, icon } = App;

  const view = (App.views.home = {
    root: null,
    edBuilt: false,

    mount(root) {
      this.root = root;
      this.edBuilt = false;
      root.replaceChildren();

      const me = S.me;
      const st = App.edState();
      this.hello = el('div', { class: 'hello' });
      this.nowCard = el('section', { class: 'card now-card' });
      this.edCard = el('section', { class: 'card ed-card', hidden: true });
      this.tlCard = el('section', { class: 'card' });
      this.boardCard = el('section', { class: 'card' });

      this.hello.append(
        el('h2', {}, `Hallo, ${App.name(me)}`),
        el('div', { class: 'chips' }, App.displayRoles(me.id, st).map((r) => App.chip(r)))
      );

      this.buildBoard();
      root.append(this.hello, this.nowCard, this.edCard, this.tlCard, this.boardCard);
      this.update();

      clearInterval(this.timer);
      this.timer = setInterval(() => { if (S.tab === 'home') { this.renderTimeline(); this.renderNow(); } }, 60000);
    },

    unmount() { clearInterval(this.timer); },

    update() {
      if (!this.root || !this.root.isConnected) return;
      const st = App.edState();
      this.hello.querySelector('.chips').replaceChildren(...App.displayRoles(S.me.id, st).map((r) => App.chip(r)));
      this.renderNow(st);
      this.renderEd(st);
      this.renderTimeline();
      this.renderBoardList();
    },

    /* ---------- Wer ist jetzt Einsatzdienst? ---------- */
    renderNow(st) {
      st = st || App.edState();
      const box = this.nowCard;
      box.replaceChildren();
      const edRole = App.roleByName('Einsatzdienst');
      const redColor = edRole ? edRole.color : '#dc2626';
      box.style.setProperty('--accent', redColor);

      box.append(el('h3', {}, el('span', { class: 'live-dot' }), 'Einsatzdienst'));

      const people = [...st.ids].map(App.profileById).filter(Boolean);
      if (!people.length) {
        box.append(el('p', { class: 'muted' }, 'Aktuell ist niemand als Einsatzdienst eingetragen.'));
      } else {
        const list = el('div', { class: 'ed-list' });
        people.forEach((p) => {
          const why = st.fixed.has(p.id) ? 'fest zugeordnet'
            : st.active.has(p.id) ? 'laut Dienstplan'
            : st.nextStart ? 'ab ' + this.fmtStart(st.nextStart) : '';
          list.append(el('div', { class: 'ed-person' },
            el('div', { class: 'avatar', style: { background: redColor, color: App.contrast(redColor) } }, App.name(p).slice(0, 1).toUpperCase()),
            el('div', { class: 'grow' },
              el('strong', {}, App.name(p)),
              el('div', { class: 'small muted' }, why)),
            p.id === S.me.id
              ? el('span', { class: 'chip', style: { background: redColor, color: App.contrast(redColor) } }, 'Du')
              : el('button', { class: 'btn small', type: 'button', onclick: () => App.openChat(p.id) }, icon('chat', 16), 'Schreiben')
          ));
        });
        box.append(list);
      }

      // Weitere, die gerade im Dienst sind
      const now = Date.now();
      const others = [];
      for (const s of S.shifts.values()) {
        if (s.status !== 'dienst' || !s.start_at) continue;
        if (new Date(s.start_at) <= now && new Date(s.end_at) > now && !st.ids.has(s.profile_id)) others.push(s);
      }
      if (others.length) {
        box.append(el('div', { class: 'small muted', style: { marginTop: '12px' } }, 'Außerdem gerade im Dienst'));
        box.append(el('div', { class: 'chips' }, others.map((s) => {
          const p = App.profileById(s.profile_id);
          return el('button', { class: 'pill', type: 'button', title: App.shiftRange(s), onclick: () => p && p.id !== S.me.id && App.openChat(p.id) },
            el('i', { style: { background: App.shiftColor(s) } }), App.name(p), ' · ', App.shiftShort(s));
        })));
      }
    },

    fmtStart(ms) {
      const d = new Date(ms);
      const today = new Date();
      if (App.isSameDay(d, today)) return 'heute ' + App.fmtTime(d);
      if (App.isSameDay(d, App.addDays(today, 1))) return 'morgen ' + App.fmtTime(d);
      return `${App.WD[d.getDay()]} ${App.fmtDM(d)} ${App.fmtTime(d)}`;
    },

    /* ---------- Einsatzdienst-Notizen & Aufgaben (rot) ---------- */
    renderEd(st) {
      st = st || App.edState();
      const mine = st.ids.has(S.me.id);
      const box = this.edCard;
      if (!mine) {
        box.hidden = true;
        box.replaceChildren();
        this.edBuilt = false;
        return;
      }
      box.hidden = false;
      const edRole = App.roleByName('Einsatzdienst');
      box.style.setProperty('--accent', edRole ? edRole.color : '#dc2626');

      if (!this.edBuilt) {
        this.edBuilt = true;
        this.noteInput = el('input', { class: 'input', placeholder: 'Neue Notiz für den Einsatzdienst …', maxlength: 500 });
        this.taskInput = el('input', { class: 'input', placeholder: 'Neue Aufgabe …', maxlength: 500 });
        const addNote = () => this.addEd('note', this.noteInput);
        const addTask = () => this.addEd('task', this.taskInput);
        this.noteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });
        this.taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
        this.notesList = el('div', { class: 'ed-items' });
        this.tasksList = el('div', { class: 'ed-items' });
        box.replaceChildren(
          el('h3', {}, 'Einsatzdienst – Notizen & Aufgaben'),
          el('p', { class: 'small' }, 'Das sehen alle, die gerade den Einsatzdienst haben.'),
          el('div', { class: 'two-col' },
            el('div', {},
              el('h4', {}, 'Notizen'),
              el('div', { class: 'row' }, this.noteInput, el('button', { class: 'btn primary', type: 'button', onclick: addNote, 'aria-label': 'Notiz hinzufügen' }, icon('plus'))),
              this.notesList),
            el('div', {},
              el('h4', {}, 'Aufgaben'),
              el('div', { class: 'row' }, this.taskInput, el('button', { class: 'btn primary', type: 'button', onclick: addTask, 'aria-label': 'Aufgabe hinzufügen' }, icon('plus'))),
              this.tasksList))
        );
      }

      const notes = S.edItems.filter((i) => i.kind === 'note');
      const tasks = S.edItems.filter((i) => i.kind === 'task').sort((a, b) => Number(a.done) - Number(b.done));
      this.notesList.replaceChildren(...(notes.length ? notes.map((i) => this.edRow(i)) : [el('p', { class: 'muted small' }, 'Keine Notizen.')]));
      this.tasksList.replaceChildren(...(tasks.length ? tasks.map((i) => this.edRow(i)) : [el('p', { class: 'muted small' }, 'Keine Aufgaben.')]));
    },

    edRow(i) {
      const isTask = i.kind === 'task';
      const by = App.profileById(i.created_by);
      return el('div', { class: 'ed-row' + (i.done ? ' done' : '') },
        isTask ? el('input', { type: 'checkbox', class: 'check', checked: i.done, 'aria-label': 'Erledigt', onchange: (e) => this.toggleEd(i, e.target.checked) }) : el('span', { class: 'bullet' }),
        el('div', { class: 'grow' }, el('div', { class: 'txt' }, i.body), el('div', { class: 'small muted' }, (by ? App.name(by) + ' · ' : '') + App.relTime(i.created_at))),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Löschen', onclick: () => this.delEd(i) }, icon('trash', 18))
      );
    },

    addEd(kind, input) {
      const body = input.value.trim();
      if (!body) return;
      App.guard(async () => {
        const { error } = await App.sb.from('ed_items').insert({ kind, body });
        if (error) throw error;
        input.value = '';
        await App.load.edItems();
        this.renderEd();
      });
    },
    toggleEd(i, done) {
      App.guard(async () => {
        const { error } = await App.sb.from('ed_items').update({ done }).eq('id', i.id);
        if (error) throw error;
        await App.load.edItems();
        this.renderEd();
      });
    },
    delEd(i) {
      App.guard(async () => {
        const { error } = await App.sb.from('ed_items').delete().eq('id', i.id);
        if (error) throw error;
        await App.load.edItems();
        this.renderEd();
      });
    },

    /* ---------- Zeitstrahl ---------- */
    renderTimeline() {
      const box = this.tlCard;
      box.replaceChildren();
      const now = new Date();
      const d0 = App.startOfDay(now);
      const d1 = App.addDays(d0, 1);
      const span = d1 - d0;
      const st = App.edState(now);

      const byPerson = new Map();
      for (const s of S.shifts.values()) {
        if (s.status !== 'dienst' || !s.start_at) continue;
        const a = new Date(s.start_at), b = new Date(s.end_at);
        if (b <= d0 || a >= d1) continue;
        if (!byPerson.has(s.profile_id)) byPerson.set(s.profile_id, []);
        byPerson.get(s.profile_id).push({ s, a, b });
      }
      const rows = [...byPerson.entries()].map(([pid, bars]) => ({ pid, bars: bars.sort((x, y) => x.a - y.a) }));
      rows.sort((x, y) => (st.ids.has(y.pid) - st.ids.has(x.pid)) || (x.bars[0].a - y.bars[0].a));

      box.append(el('div', { class: 'between' },
        el('h3', {}, icon('clock', 18), ' Heute im Dienst'),
        el('span', { class: 'small muted' }, App.fmtLong(now))));

      if (!rows.length) {
        box.append(el('p', { class: 'muted' }, 'Für heute ist noch niemand im Dienstplan eingetragen.'));
        return;
      }

      const p = Math.min(1, Math.max(0, (now - d0) / span));
      const tl = el('div', { class: 'tl', style: { '--p': String(p) } });

      const axis = el('div', { class: 'tl-row tl-axis' }, el('div', { class: 'tl-name' }));
      const axisTrack = el('div', { class: 'tl-track' });
      for (let h = 0; h <= 24; h += 3) axisTrack.append(el('span', { class: 'tl-tick', style: { left: (h / 24) * 100 + '%' } }, pad2(h)));
      axis.append(axisTrack);
      tl.append(axis);

      rows.forEach(({ pid, bars }) => {
        const person = App.profileById(pid);
        const isEd = st.ids.has(pid);
        const track = el('div', { class: 'tl-track' });
        for (let h = 3; h < 24; h += 3) track.append(el('span', { class: 'tl-grid', style: { left: (h / 24) * 100 + '%' } }));
        bars.forEach(({ s, a, b }) => {
          const from = Math.max(a, d0), to = Math.min(b, d1);
          const on = a <= now && b > now;
          track.append(el('div', {
            class: 'tl-bar' + (on ? ' on' : '') + (s.is_ed ? ' ed' : ''),
            style: { left: ((from - d0) / span) * 100 + '%', width: ((to - from) / span) * 100 + '%', background: App.shiftColor(s) },
            title: `${App.name(person)}: ${App.shiftRange(s)}`,
          }, el('span', {}, App.shiftShort(s))));
        });
        tl.append(el('div', { class: 'tl-row' },
          el('div', { class: 'tl-name' + (isEd ? ' ed' : '') }, App.name(person)),
          track));
      });

      tl.append(el('div', { class: 'tl-now', title: 'Jetzt ' + App.fmtTime(now) }, el('span', {}, App.fmtTime(now))));
      box.append(tl);
    },

    /* ---------- Pinnwand ---------- */
    buildBoard() {
      this.noteText = el('textarea', { class: 'input', rows: 3, maxlength: 2000, placeholder: 'Etwas an die Pinnwand schreiben …' });
      this.notePrivate = el('input', { type: 'checkbox', id: 'note-private' });
      this.boardList = el('div', { class: 'board' });
      this.boardCard.append(
        el('h3', {}, 'Pinnwand'),
        el('p', { class: 'small muted' }, 'Öffentliche Zettel sehen alle. Private Zettel sind nur für dich sichtbar – andere sehen sie nicht.'),
        this.noteText,
        el('div', { class: 'between', style: { marginTop: '8px' } },
          el('label', { class: 'toggle', for: 'note-private' }, this.notePrivate, icon('lock', 16), ' Privat (nur für mich)'),
          el('button', { class: 'btn primary', type: 'button', onclick: () => this.addNote() }, 'Anpinnen')),
        this.boardList
      );
    },

    addNote() {
      const body = this.noteText.value.trim();
      if (!body) return;
      App.guard(async () => {
        const { error } = await App.sb.from('notes').insert({ body, is_private: this.notePrivate.checked });
        if (error) throw error;
        this.noteText.value = '';
        await App.load.notes();
        this.renderBoardList();
      });
    },

    renderBoardList() {
      if (!this.boardList) return;
      const notes = S.notes;
      if (!notes.length) {
        this.boardList.replaceChildren(el('p', { class: 'muted' }, 'Noch nichts angepinnt.'));
        return;
      }
      this.boardList.replaceChildren(...notes.map((n) => {
        const mine = n.owner_id === S.me.id;
        const canDelete = mine || (App.isAdmin() && !n.is_private);
        const owner = App.profileById(n.owner_id);
        return el('article', { class: 'sticky' + (n.is_private ? ' private' : '') },
          n.is_private ? el('div', { class: 'tag' }, icon('lock', 14), ' Nur für dich sichtbar') : null,
          el('div', { class: 'txt' }, n.body),
          el('footer', {},
            el('span', { class: 'small muted' }, `${n.is_private ? 'Privat' : App.name(owner)} · ${App.relTime(n.created_at)}`),
            canDelete ? el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Löschen', onclick: () => this.delNote(n) }, icon('trash', 16)) : null));
      }));
    },

    delNote(n) {
      App.guard(async () => {
        const { error } = await App.sb.from('notes').delete().eq('id', n.id);
        if (error) throw error;
        await App.load.notes();
        this.renderBoardList();
      });
    },
  });

  function pad2(n) { return String(n).padStart(2, '0'); }
})();
