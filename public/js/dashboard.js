document.addEventListener('DOMContentLoaded', function() {
    // Elementy DOM
    const sidebar = document.getElementById('sidebar');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const logoutBtn = document.getElementById('logoutBtn');
    const userName = document.getElementById('userName');
    const pageTitle = document.getElementById('pageTitle');
    const contentArea = document.getElementById('contentArea');
    
    // Elementy statystyk
    const productsCount = document.getElementById('productsCount');
    const clientsCount = document.getElementById('clientsCount');
    const meetingsCount = document.getElementById('meetingsCount');

    // Flaga do sprawdzenia czy nawigacja jest już skonfigurowana
    let navigationSetup = false;
    let isAdmin = false;

    // Inicjalizacja
    init();

    async function init() {
        // Załaduj dane użytkownika
        await loadUserData();
        
        // Sprawdź status admina
        await checkAdminStatus();
        
        // Załaduj statystyki
        await loadStats();
        
        // Obsługa nawigacji (tylko raz)
        if (!navigationSetup) {
            setupNavigation();
            navigationSetup = true;
        }
        
        // Obsługa mobilnego menu
        setupMobileMenu();
        
        // Obsługa wylogowania
        setupLogout();
    }

    // Załaduj dane użytkownika
    async function loadUserData() {
        try {
            const response = await fetch('/api/user');
            if (response.ok) {
                const userData = await response.json();
                userName.textContent = userData.firstName;
                console.log('✅ Dane użytkownika załadowane:', userData);
            } else {
                console.error('❌ Błąd autoryzacji - przekierowanie do logowania');
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('❌ Błąd ładowania danych użytkownika:', error);
            window.location.href = '/login';
        }
    }

    // Sprawdź status admina
    async function checkAdminStatus() {
        try {
            // Pobierz dane użytkownika z session
            const response = await fetch('/api/user');
            if (response.ok) {
                const userData = await response.json();
                
                // Sprawdź czy ID użytkownika to 3 (admin)
                isAdmin = userData.id === 3;
                
                console.log('👤 Status użytkownika:', {
                    id: userData.id,
                    isAdmin: isAdmin
                });
                
                // Pokaż/ukryj opcje admina
                const adminItems = document.querySelectorAll('.admin-only');
                adminItems.forEach(item => {
                    item.style.display = isAdmin ? 'block' : 'none';
                });
                
                if (isAdmin) {
                    console.log('✅ Użytkownik jest adminem - panel admina włączony');
                } else {
                    console.log('ℹ️ Użytkownik standardowy - panel admina ukryty');
                }
            }
        } catch (error) {
            console.error('❌ Błąd sprawdzania statusu admina:', error);
            isAdmin = false;
        }
    }

    // Załaduj statystyki
    async function loadStats() {
        try {
            console.log('📊 Ładowanie statystyk...');
            
            // Załaduj produkty
            const productsResponse = await fetch('/api/products');
            if (productsResponse.ok) {
                const products = await productsResponse.json();
                productsCount.textContent = products.length;
            }

            // Załaduj klientów
            const clientsResponse = await fetch('/api/clients');
            if (clientsResponse.ok) {
                const clients = await clientsResponse.json();
                clientsCount.textContent = clients.length;
            }

            // Załaduj spotkania
            const salesResponse = await fetch('/api/sales');
            if (salesResponse.ok) {
                const sales = await salesResponse.json();
                meetingsCount.textContent = sales.length;
            }
            
            console.log('✅ Statystyki załadowane');
        } catch (error) {
            console.error('❌ Błąd ładowania statystyk:', error);
        }
    }

    // Konfiguracja nawigacji (tylko raz!)
    function setupNavigation() {
        console.log('🔧 Konfiguracja nawigacji...');
        
        // Użyj event delegation dla lepszej wydajności
        document.addEventListener('click', function(e) {
            const target = e.target.closest('[data-section]');
            if (!target) return;
            
            e.preventDefault();
            
            const section = target.dataset.section;
            console.log('🔍 Kliknięto sekcję:', section);
            
            // Sprawdź uprawnienia do panelu admina
            if (section === 'admin' && !isAdmin) {
                console.log('❌ Brak uprawnień do panelu admina');
                showError('Brak uprawnień do panelu administratora');
                return;
            }
            
            // Aktualizuj aktywne linki
            updateActiveNavLink(target);
            
            // Załaduj sekcję
            loadSection(section);
            
            // Zamknij mobile menu
            closeMobileMenu();
        });
    }

    // Aktualizuj aktywny link nawigacji
    function updateActiveNavLink(activeLink) {
        // Usuń active z wszystkich linków
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        // Dodaj active do klikniętego linku (jeśli to nav-link)
        if (activeLink.classList.contains('nav-link')) {
            activeLink.classList.add('active');
        }
    }

    // Załaduj sekcję
    async function loadSection(section) {
        console.log('📄 Ładowanie sekcji:', section);
        
        // Aktualizuj tytuł strony
        const sectionTitles = {
            'dashboard': 'Dashboard',
            'produkty': 'Produkty',
            'klienci': 'Klienci',
            'spotkania': 'Spotkania',
            'profil': 'Edytuj Profil',
            'sesja': 'Rozpocznij sesję',
            'admin': 'Panel Administratora'
        };
        
        pageTitle.textContent = sectionTitles[section] || 'Dashboard';
        
        if (section === 'dashboard') {
            // Pokaż dashboard
            showDashboard();
        } else {
            // Załaduj zewnętrzną sekcję
            try {
                console.log(`🔄 Pobieranie treści dla sekcji: ${section}`);
                const response = await fetch(`/${section}`);
                
                if (response.ok) {
                    const html = await response.text();
                    contentArea.innerHTML = html;
                    console.log(`✅ Sekcja ${section} załadowana pomyślnie`);
                    
                    // Załaduj odpowiedni skrypt dla sekcji (z timeout dla stabilności)
                    setTimeout(() => {
                        loadSectionScript(section);
                    }, 100);
                } else {
                    console.error(`❌ Błąd HTTP ${response.status} przy ładowaniu sekcji ${section}`);
                    showError(`Nie można załadować sekcji (${response.status})`);
                }
            } catch (error) {
                console.error('❌ Błąd ładowania sekcji:', error);
                showError('Błąd połączenia - sprawdź internet i spróbuj ponownie');
            }
        }
    }

    // Pokaż dashboard
    function showDashboard() {
        console.log('🏠 Pokazuję dashboard');
        
        contentArea.innerHTML = `
            <div class="dashboard-overview">
                <div class="welcome-card">
                    <div class="welcome-content">
                        <h2>Witaj w Asystencie Sprzedaży!</h2>
                        <p>Inteligentny system wspierający doradców handlowych w czasie rzeczywistym podczas spotkań sprzedażowych.</p>
                    </div>
                    <div class="welcome-image">
                        <i class="fas fa-rocket"></i>
                    </div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-box"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number" id="productsCount">${productsCount.textContent}</div>
                            <div class="stat-label">Produkty</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number" id="clientsCount">${clientsCount.textContent}</div>
                            <div class="stat-label">Klienci</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number" id="meetingsCount">${meetingsCount.textContent}</div>
                            <div class="stat-label">Spotkania</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-number">98%</div>
                            <div class="stat-label">Skuteczność</div>
                        </div>
                    </div>
                </div>
                
                <div class="quick-actions">
                    <h3>Szybkie akcje</h3>
                    <div class="action-buttons">
                        <button class="action-btn" data-section="produkty">
                            <i class="fas fa-plus"></i>
                            <span>Dodaj produkt</span>
                        </button>
                        <button class="action-btn" data-section="klienci">
                            <i class="fas fa-user-plus"></i>
                            <span>Dodaj klienta</span>
                        </button>
                        <button class="action-btn start-session" data-section="sesja">
                            <i class="fas fa-play"></i>
                            <span>Rozpocznij sesję</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // NIE wywołuj setupNavigation ponownie!
        console.log('✅ Dashboard wyświetlony');
    }

    // Załaduj skrypt dla sekcji
    function loadSectionScript(section) {
        console.log(`📦 Ładowanie skryptu dla sekcji: ${section}`);
        
        // Sprawdź czy skrypt już istnieje
        const existingScript = document.querySelector(`script[data-section="${section}"]`);
        if (existingScript) {
            console.log(`ℹ️ Skrypt dla ${section} już istnieje, pomijam`);
            return;
        }
        
        // Usuń poprzedni skrypt sekcji (inne sekcje)
        const allSectionScripts = document.querySelectorAll('script[data-section]');
        allSectionScripts.forEach(script => {
            if (script.dataset.section !== section) {
                console.log(`🗑️ Usuwam stary skrypt: ${script.dataset.section}`);
                script.remove();
            }
        });
        
        // Załaduj nowy skrypt
        const script = document.createElement('script');
        script.src = `js/${section}.js`;
        script.dataset.section = section;
        
        script.onload = () => {
            console.log(`✅ Skrypt ${section}.js załadowany pomyślnie`);
        };
        
        script.onerror = () => {
            console.log(`ℹ️ Nie znaleziono skryptu ${section}.js (to jest normalne)`);
        };
        
        document.head.appendChild(script);
    }

    // Konfiguracja mobilnego menu
    function setupMobileMenu() {
        if (mobileMenuToggle) {
            mobileMenuToggle.addEventListener('click', toggleMobileMenu);
        }
        
        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', closeMobileMenu);
        }
        
        // Zamknij menu po zmianie rozmiaru okna
        window.addEventListener('resize', function() {
            if (window.innerWidth > 1024) {
                closeMobileMenu();
            }
        });
    }

    // Przełącz mobilne menu
    function toggleMobileMenu() {
        if (sidebar && mobileOverlay) {
            sidebar.classList.toggle('open');
            mobileOverlay.classList.toggle('active');
            document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
        }
    }

    // Zamknij mobilne menu
    function closeMobileMenu() {
        if (sidebar && mobileOverlay) {
            sidebar.classList.remove('open');
            mobileOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // Konfiguracja wylogowania
    function setupLogout() {
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async function() {
                if (confirm('Czy na pewno chcesz się wylogować?')) {
                    try {
                        console.log('🚪 Wylogowywanie...');
                        const response = await fetch('/api/logout', { method: 'POST' });
                        if (response.ok) {
                            console.log('✅ Wylogowano pomyślnie');
                            window.location.href = '/login';
                        } else {
                            console.error('❌ Błąd podczas wylogowania');
                            alert('Błąd podczas wylogowania');
                        }
                    } catch (error) {
                        console.error('❌ Błąd wylogowania:', error);
                        alert('Błąd podczas wylogowania');
                    }
                }
            });
        }
    }

    // Pokaż błąd
    function showError(message) {
        console.error('❌ Pokazuję błąd:', message);
        
        contentArea.innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 20px;"></i>
                <h3 style="color: #1e293b; margin-bottom: 10px;">Wystąpił błąd</h3>
                <p style="color: #64748b;">${message}</p>
                <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    Odśwież stronę
                </button>
            </div>
        `;
    }

    // Obsługa skrótów klawiszowych
    document.addEventListener('keydown', function(e) {
        // Alt + M - toggle mobile menu
        if (e.altKey && e.key === 'm') {
            e.preventDefault();
            toggleMobileMenu();
        }
        
        // Esc - zamknij mobile menu
        if (e.key === 'Escape') {
            closeMobileMenu();
        }
    });
    
    // Dodaj global error handler
    window.addEventListener('error', function(e) {
        console.error('🚨 Global JavaScript Error:', e.error);
    });
    
    window.addEventListener('unhandledrejection', function(e) {
        console.error('🚨 Unhandled Promise Rejection:', e.reason);
    });
    
    console.log('🎉 Dashboard.js załadowany i skonfigurowany pomyślnie!');
}); 