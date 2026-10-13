# Dienst-App – Einrichtung

PWA mit Startseite (Pinnwand, private Notizen, Zeitstrahl, Einsatzdienst), Chat, Dienstplan, Material und Verwaltung.
Läuft auf **Supabase** (Datenbank, Login, Echtzeit) und **Netlify** (Hosting + eine kleine Function für die Verwaltung).

## 1. Supabase

1. Neues Projekt anlegen.
2. **SQL Editor → New query**: den kompletten Inhalt von `supabase/schema.sql` einfügen und **Run** drücken.
3. **Authentication → Sign In / Providers → Email**: „Confirm email“ **ausschalten** (sonst muss das erste Konto per Mail bestätigt werden).
4. **Project Settings → API** öffnen und diese drei Werte notieren:
   - Project URL
   - `anon public` Key
   - `service_role` Key (**geheim**, nur für Netlify, nie in die App-Dateien!)

## 2. Zugangsdaten eintragen

In `public/config.js` die Project URL und den `anon public` Key eintragen.

## 3. Netlify

Die Verwaltungsfunktion (Personen anlegen/entfernen, Passwort setzen) liegt in `netlify/functions/admin.js` und braucht ein echtes Deployment mit Build – am einfachsten über GitHub:

1. Ordner in ein GitHub-Repository hochladen.
2. Netlify → **Add new site → Import from Git**. Die Einstellungen kommen aus `netlify.toml` (Publish: `public`, Functions: `netlify/functions`).
3. **Site configuration → Environment variables** anlegen:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role Key
4. Deployen (nach dem Setzen der Variablen einmal neu deployen).

Alternativ per Netlify CLI: `npm install`, dann `netlify deploy --prod`.

## 4. Erster Start

1. App öffnen → **„Erstes Konto anlegen (Einrichtung)“**. Das allererste Konto wird automatisch **Admin**.
2. Anzeigename festlegen.
3. In Supabase unter **Authentication → Sign In / Providers** die Option **„Allow new users to sign up“ ausschalten**. Ab dann legst du alle Personen im Tab **Verwaltung** an.
4. Im Verwaltungs-Tab Personen mit Startpasswort anlegen und Rollen vergeben. Beim ersten Login legt jede Person ihren Anzeigenamen selbst fest.

## 5. Als App installieren

- iPhone: Safari → Teilen → „Zum Home-Bildschirm“
- Android/Chrome: Menü → „App installieren“

## So verhält sich die App

- **Einsatzdienst-Rolle**: fest zugeordnet (Verwaltung → Rolle „Einsatzdienst“ an eine Person geben) **und** automatisch bei der Person, die laut Dienstplan gerade im Dienst ist – jede unter „Dienst“ gewählte Schicht (egal welche Rolle, auch freie Zeit) zählt als Einsatzdienst. Ist gerade niemand eingetragen, geht die Rolle an den Nächsten im Plan. Wer die Rolle hat, sieht den roten Kasten mit Einsatzdienst-Notizen und -Aufgaben.
- **Private Notizen** auf der Pinnwand sind per Datenbankregel für alle anderen unsichtbar, auch für Admins.
- **Chat**: Gruppenchat steht immer oben; Direktnachrichten sehen nur die beiden Beteiligten. Rollenfilter („frag mal die Springer“) und Namenssuche in der Liste.
- **Schichten**: Springer 8h / 10h / Nacht · FSJ EDT / EDN / ED24 · Ehrenamt wie FSJ plus freie Zeit. Personen mit mehreren Rollen bekommen die Auswahl aller ihrer Rollen. Personen ohne diese Rollen (z. B. nur Lager oder nur Admin) können eine freie Zeit eintragen, die ebenfalls als Einsatzdienst zählt.
- **Material**: Alle melden Verbrauch/Ablauf. Lager (und Admin) sehen die Liste zum Abhaken; nur die Lager-Rolle bekommt den roten Punkt am Material-Tab.
- Eigene Schichten trägt jeder selbst ein, Admins können für alle planen.
