# 🚂 Migracja na Railway - Krok po kroku

## 🎯 Dlaczego Railway?
- ✅ **Pełne wsparcie WebSocket** - Real-time AI Assistant będzie działać
- ✅ **Darmowy tier** - $5 miesięcznie gratis
- ✅ **Łatwy deployment** - podobny do Vercel
- ✅ **Automatyczne HTTPS** - bezpieczne połączenia

## 🚀 Migracja - instrukcje

### Krok 1: Załóż konto Railway
1. Idź na https://railway.app
2. Zarejestruj się przez GitHub
3. Potwierdź email

### Krok 2: Zainstaluj Railway CLI
```bash
npm install -g @railway/cli
```

### Krok 3: Zaloguj się i utwórz projekt
```bash
# Zaloguj się
railway login

# W folderze projektu - utwórz nowy projekt
railway init

# Wybierz "Empty Project" i nazwij go np. "sales-assistant"
```

### Krok 4: Skonfiguruj zmienne środowiskowe
W Railway Dashboard (https://railway.app/dashboard) kliknij na swój projekt, potem "Variables":

**Wymagane zmienne:**
```
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require
SESSION_SECRET=your-strong-session-secret-key-here
OPENAI_API_KEY=sk-your-openai-api-key
ASSEMBLYAI_API_KEY=your-assemblyai-api-key
NODE_ENV=production
PORT=3000
```

**Gdzie znajdziesz klucze:**
- `DATABASE_URL` - z Neon Dashboard (Connection Details)
- `OPENAI_API_KEY` - z https://platform.openai.com/api-keys
- `ASSEMBLYAI_API_KEY` - z https://www.assemblyai.com/dashboard
- `SESSION_SECRET` - wygeneruj bezpieczny klucz (min. 32 znaki)

### Krok 5: Deploy aplikacji
```bash
# W folderze projektu
railway up

# Lub używając Git
git add .
git commit -m "Initial Railway deployment"
railway up
```

### Krok 6: Sprawdź deployment
1. Railway automatycznie nada ci domenę (np. `your-app.up.railway.app`)
2. Sprawdź logi w Railway Dashboard
3. Testuj na adresie: `https://your-app.up.railway.app`

## 🧪 Testowanie WebSocket

Po deployment sprawdź czy WebSocket działa:

1. Otwórz aplikację w przeglądarce
2. Otwórz Developer Tools (F12) → Console
3. Przejdź do sekcji "Sesja AI"
4. Sprawdź logi:
   - ✅ `WebSocket connected successfully` = wszystko OK!
   - ❌ `WebSocket error` = coś nie gra

## 🔧 Konfiguracja zaawansowana

### Custom domena (opcjonalnie)
W Railway Dashboard → Settings → Domains możesz dodać własną domenę.

### Skalowanie
Railway automatycznie skaluje aplikację w zależności od ruchu.

### Monitoring
W Dashboard masz dostęp do:
- Metryki CPU/RAM
- Logi aplikacji
- Historia deploymentów

## 🚨 Troubleshooting

### Problem: "Build failed"
```bash
# Sprawdź czy masz wszystkie zależności
npm install

# Sprawdź czy package.json ma poprawny start script
npm start
```

### Problem: "Database connection failed"
1. Sprawdź `DATABASE_URL` w zmiennych
2. Upewnij się że kończy się na `?sslmode=require`
3. Sprawdź czy Neon database działa

### Problem: "WebSocket nie łączy się"
1. Sprawdź logi Railway Dashboard
2. Upewnij się że port 3000 jest prawidłowo skonfigurowany
3. Sprawdź czy `server.js` używa `http.createServer(app)` dla WebSocket

### Problem: "Session errors"
1. Sprawdź `SESSION_SECRET` w zmiennych
2. Upewnij się że `DATABASE_URL` jest poprawny
3. Sprawdź czy tabela `user_sessions` została utworzona

## 📊 Monitoring kosztów

Railway oferuje:
- **$5/miesiąc gratis** - wystarczy dla małych projektów
- **$0.000463/GB-hour** dla RAM
- **$0.000231/vCPU-hour** dla CPU

Dla typowej aplikacji to będzie ~$2-3/miesiąc.

## 🎉 Po udanej migracji

1. **Zaktualizuj linki** - zmień wszystkie referencje z Vercel na Railway
2. **Przetestuj AI Assistant** - sprawdź czy real-time funkcje działają
3. **Backup** - Railway robi automatyczne backupy, ale możesz też eksportować

## 💡 Wskazówki pro

1. **Użyj GitHub integration** - automatyczny deploy przy push
2. **Monitoruj logi** - Railway Dashboard → View Logs
3. **Ustaw alerty** - powiadomienia o błędach
4. **Konfiguruj staging** - osobny projekt do testów

---

## 🆘 Potrzebujesz pomocy?

- Railway Docs: https://docs.railway.app
- Discord: https://railway.app/discord
- GitHub Issues: Stwórz issue w repozytorium

**Gotowy do migracji? 🚀** 