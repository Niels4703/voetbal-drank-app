# Drankstand

Een gedeelde webapp voor een vriendenvoetbalgroep. De app houdt bij wie meedoet, wie aan de beurt is en wie de volgende keer drinken meeneemt.

## Functionaliteit

- Gedeeld inzicht in spelers via Supabase
- Aanwezigheid per matchdag
- Automatische selectie van de eerlijkste speler op basis van drankbeurten / ratio
- Historiek van afgeronde matchdagen
- Matchdatum instellen voor de volgende wedstrijd
- Gratis centrale planning via GitHub Actions + Supabase

## Gratis planning

De app werkt met deze gratis stack:

- GitHub Pages voor de frontend
- Supabase voor de gedeelde data
- GitHub Actions voor de cron-jobs om 17:00 en 21:00 in Europe/Amsterdam te draaien

### GitHub Actions cron

Voeg deze repository secrets toe:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

De workflow draait op dinsdag om 17:00 en 21:00.

## Supabase setup

1. Maak een project aan op Supabase.
2. Open de SQL editor.
3. Run supabase/schema.sql.
4. Vul config.js in met de project URL en public key.
5. Zet de repo op GitHub Pages.

## Lokale draaien

```bash
python3 -m http.server 3000
