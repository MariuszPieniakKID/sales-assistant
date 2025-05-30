# 🚀 Wdrożenie na Vercel - Sales Assistant

## Krok 1: Przygotowanie
✅ **Wykonane:**
- Kod w GitHub: https://github.com/MariuszPieniakKID/sales-assistant
- Plik `vercel.json` skonfigurowany
- `package.json` zaktualizowany dla Vercel
- `server.js` przystosowany do serverless
- Konfiguracja bazy danych z zmiennymi środowiskowymi

## Krok 2: Wdrożenie przez Vercel Dashboard

### A. Rejestracja i importowanie projektu
1. **Idź na** https://vercel.com
2. **Zaloguj się** używając GitHub (Sign up with GitHub)
3. **Kliknij "Add New..."** → "Project"
4. **Importuj** repozytorium `MariuszPieniakKID/sales-assistant`
5. **Kliknij "Import"**

### B. Konfiguracja projektu
1. **Project Name**: `sales-assistant` (lub dowolna nazwa)
2. **Framework Preset**: Other (zostaw domyślne)
3. **Root Directory**: `/` (główny katalog)
4. **Build Command**: `npm run vercel-build`
5. **Output Directory**: pozostaw puste
6. **Install Command**: `npm install`

### C. Zmienne środowiskowe ⚡ **WAŻNE!**
Przed wdrożeniem **DODAJ** zmienne środowiskowe:

**Kliknij "Environment Variables" i dodaj:**

```
DATABASE_URL = postgresql://asystent_owner:npg_l5AZrIXmOu7D@ep-red-salad-a28d0d0e-pooler.eu-central-1.aws.neon.tech/asystent?sslmode=require

SESSION_SECRET = your-super-secret-session-key-change-me

NODE_ENV = production
```

**⚠️ WAŻNE:** Zmień `SESSION_SECRET` na losowy, bezpieczny klucz!

### D. Wdrożenie
1. **Kliknij "Deploy"**
2. **Czekaj** na zakończenie procesu (2-3 minuty)
3. **Sprawdź** czy deployment zakończył się sukcesem

## Krok 3: Testowanie aplikacji

Po udanym wdrożeniu:

1. **Otwórz** URL aplikacji (Vercel poda link)
2. **Zaloguj się** testowymi kontami:
   - **Użytkownik**: test@test.pl / test123
   - **Admin**: admin@admin.pl / test123
3. **Przetestuj** wszystkie funkcje

## Krok 4: Konfiguracja domeny (opcjonalne)

1. **W panelu Vercel** → Twój projekt → "Settings" → "Domains"
2. **Dodaj domenę** lub użyj darmowej subdomeny Vercel
3. **Skonfiguruj DNS** jeśli używasz własnej domeny

## 🔧 Rozwiązywanie problemów

### Problem: "Internal Server Error"
**Sprawdź:**
- Czy zmienne środowiskowe są ustawione
- Czy `DATABASE_URL` jest poprawny
- Logi w Vercel Dashboard → Functions → View Function Logs

### Problem: "Module not found"
**Sprawdź:**
- Czy wszystkie zależności są w `package.json`
- Czy nie ma konfliktów wersji

### Problem: "Database connection failed"
**Sprawdź:**
- Czy baza danych Neon jest aktywna
- Czy connection string jest poprawny
- Czy Neon nie blokuje połączeń z Vercel

## 📊 Monitoring

**Vercel automatycznie zapewnia:**
- ✅ Monitoring wydajności
- ✅ Automatyczne skalowanie
- ✅ SSL certificates
- ✅ CDN globalny
- ✅ Automatyczne wdrożenia z GitHub

## 🎯 Następne kroki po wdrożeniu

1. **Przetestuj** wszystkie funkcjonalności
2. **Skonfiguruj** automatyczne wdrożenia (już skonfigurowane)
3. **Monitoruj** logi aplikacji
4. **Opcjonalnie:** Dodaj custom domain

---

**🎉 Twoja aplikacja powinna być dostępna na adresie typu:**
`https://sales-assistant-xyz.vercel.app`

**📱 Aplikacja będzie automatycznie aktualizowana przy każdym push do GitHub!** 