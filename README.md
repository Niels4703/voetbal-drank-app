# Voetbalavond Drankbeurt

Gedeelde webapp voor aanmeldingen en een eerlijke drankbeurt. De data staat in Supabase, niet in de browser. Iedereen met dezelfde link ziet direct dezelfde spelers, aanmeldingen en historie.

## Supabase instellen

1. Maak gratis een project aan op [supabase.com](https://supabase.com).
2. Open **SQL Editor** en voer `supabase/schema.sql` volledig uit.
3. Ga naar **Project Settings → API**.
4. Kopieer `Project URL` en de `anon public` key naar `config.js`.
5. Publiceer de repository bijvoorbeeld via GitHub Pages, Netlify of Vercel.

`config.js` bevat alleen de publieke anon key. Zet nooit de Supabase service-role key in deze webapp.

## Werking

- Een speler wordt met een slider aan- of afgemeld.
- Alleen aangemelde spelers kunnen worden gekozen.
- De speler met de minste drankbeurten komt eerst aan de beurt; bij gelijkstand wint degene die het langst geleden aan de beurt was.
- Na bevestigen wordt de avond in de historie opgeslagen, worden de drankstatistieken bijgewerkt en wordt de aanmelding leeggemaakt.
- Supabase Realtime en periodiek verversen zorgen dat wijzigingen van medespelers zichtbaar worden.

## Lokale test

```bash
python3 -m http.server 3000
```

Open daarna `http://localhost:3000`.
