#!/bin/bash

# 🚂 Railway Deployment Script
# Automatyczny deployment aplikacji Sales Assistant na Railway

echo "🚂 Railway Deployment Script"
echo "================================"

# Sprawdź czy Railway CLI jest zainstalowane
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI nie jest zainstalowane"
    echo "💡 Zainstaluj: npm install -g @railway/cli"
    exit 1
fi

# Sprawdź czy jesteś zalogowany
if ! railway whoami &> /dev/null; then
    echo "❌ Nie jesteś zalogowany do Railway"
    echo "💡 Zaloguj się: railway login"
    exit 1
fi

# Sprawdź czy istnieje projekt Railway
if ! railway status &> /dev/null; then
    echo "❌ Brak projektu Railway w tym folderze"
    echo "💡 Utwórz projekt: railway init"
    exit 1
fi

echo "✅ Railway CLI gotowe"
echo ""

# Sprawdź czy wszystkie zależności są zainstalowane
echo "📦 Sprawdzanie zależności..."
if [ ! -d "node_modules" ]; then
    echo "📥 Instalowanie zależności npm..."
    npm install
fi

# Test lokalny (opcjonalny)
read -p "🧪 Czy chcesz przetestować lokalnie przed deployment? (y/n): " test_local
if [ "$test_local" = "y" ] || [ "$test_local" = "Y" ]; then
    echo "🔧 Uruchamianie testów lokalnych..."
    echo "📍 Sprawdź http://localhost:3000 w przeglądarce"
    echo "⚠️  Naciśnij Ctrl+C żeby zatrzymać i kontynuować deployment"
    npm start
fi

# Commit zmian (jeśli są)
echo "📝 Sprawdzanie zmian w Git..."
if [ -n "$(git status --porcelain)" ]; then
    echo "📁 Znaleziono niezapisane zmiany"
    read -p "💾 Czy chcesz je zapisać przed deployment? (y/n): " commit_changes
    if [ "$commit_changes" = "y" ] || [ "$commit_changes" = "Y" ]; then
        git add .
        read -p "✏️  Podaj commit message: " commit_message
        git commit -m "$commit_message"
    fi
fi

# Deploy na Railway
echo ""
echo "🚀 Uruchamianie deployment na Railway..."
railway up

# Sprawdź status
echo ""
echo "📊 Status deployment:"
railway status

# Pokaż logi
read -p "📋 Czy chcesz zobaczyć logi? (y/n): " show_logs
if [ "$show_logs" = "y" ] || [ "$show_logs" = "Y" ]; then
    echo "📋 Logi aplikacji (Ctrl+C żeby wyjść):"
    railway logs
fi

# Pokaż URL
echo ""
echo "🎉 Deployment zakończony!"
echo "🌐 Twoja aplikacja jest dostępna na:"
railway domain

echo ""
echo "💡 Pro tips:"
echo "   - Sprawdź logi: railway logs"
echo "   - Monitoring: https://railway.app/dashboard"
echo "   - Zmienne: railway variables"
echo ""
echo "✅ Gotowe! Miłego użytkowania Railway! 🚂" 