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

    // Inicjalizacja
    init();

    async function init() {
        // Załaduj dane użytkownika
        await loadUserData();
        
        // Załaduj statystyki
        await loadStats();
        
        // Obsługa nawigacji
        setupNavigation();
        
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
                
                // Sprawdź czy to admin
                checkAdminStatus();
            }
        } catch (error) {
            console.error('Błąd ładowania danych użytkownika:', error);
        }
    }

    // Sprawdź status admina
    async function checkAdminStatus() {
        try {
            const response = await fetch('/api/admin/users');
            if (response.ok) {
                // Jeśli może dostać się do endpoint admina, to jest adminem
                const adminItems = document.querySelectorAll('.admin-only');
                adminItems.forEach(item => {
                    item.style.display = 'block';
                });
                console.log('✅ Użytkownik jest adminem - panel admina włączony');
            }
        } catch (error) {
            // Nie jest adminem - ukryj opcje admina
            const adminItems = document.querySelectorAll('.admin-only');
            adminItems.forEach(item => {
                item.style.display = 'none';
            });
        }
    }

    // Załaduj statystyki
    async function loadStats() {
        try {
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
        } catch (error) {
            console.error('Błąd ładowania statystyk:', error);
        }
    }

    // Konfiguracja nawigacji
    function setupNavigation() {
        const navLinks = document.querySelectorAll('[data-section]');
        
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const section = this.dataset.section;
                
                // Aktualizuj aktywne linki
                updateActiveNavLink(this);
                
                // Załaduj sekcję
                loadSection(section);
                
                // Zamknij mobile menu
                closeMobileMenu();
            });
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
                const response = await fetch(`/${section}`);
                if (response.ok) {
                    const html = await response.text();
                    contentArea.innerHTML = html;
                    
                    // Załaduj odpowiedni skrypt dla sekcji
                    loadSectionScript(section);
                } else {
                    showError('Nie można załadować sekcji');
                }
            } catch (error) {
                console.error('Błąd ładowania sekcji:', error);
                showError('Błąd ładowania sekcji');
            }
        }
    }

    // Pokaż dashboard
    function showDashboard() {
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
        
        // Ponownie konfiguruj nawigację dla nowych przycisków
        setupNavigation();
    }

    // Załaduj skrypt dla sekcji
    function loadSectionScript(section) {
        // Usuń poprzedni skrypt sekcji
        const existingScript = document.querySelector(`script[data-section]`);
        if (existingScript) {
            existingScript.remove();
        }
        
        // Załaduj nowy skrypt
        const script = document.createElement('script');
        script.src = `js/${section}.js`;
        script.dataset.section = section;
        script.onerror = () => {
            console.log(`Nie znaleziono skryptu dla sekcji: ${section}`);
        };
        document.head.appendChild(script);
    }

    // Konfiguracja mobilnego menu
    function setupMobileMenu() {
        mobileMenuToggle.addEventListener('click', toggleMobileMenu);
        mobileOverlay.addEventListener('click', closeMobileMenu);
        
        // Zamknij menu po zmianie rozmiaru okna
        window.addEventListener('resize', function() {
            if (window.innerWidth > 1024) {
                closeMobileMenu();
            }
        });
    }

    // Przełącz mobilne menu
    function toggleMobileMenu() {
        sidebar.classList.toggle('open');
        mobileOverlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
    }

    // Zamknij mobilne menu
    function closeMobileMenu() {
        sidebar.classList.remove('open');
        mobileOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Konfiguracja wylogowania
    function setupLogout() {
        logoutBtn.addEventListener('click', async function() {
            if (confirm('Czy na pewno chcesz się wylogować?')) {
                try {
                    const response = await fetch('/api/logout', { method: 'POST' });
                    if (response.ok) {
                        window.location.href = '/login';
                    } else {
                        alert('Błąd podczas wylogowania');
                    }
                } catch (error) {
                    console.error('Błąd wylogowania:', error);
                    alert('Błąd podczas wylogowania');
                }
            }
        });
    }

    // Pokaż błąd
    function showError(message) {
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
}); 