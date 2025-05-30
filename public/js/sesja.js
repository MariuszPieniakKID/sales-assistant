// sesja.js - Zarządzanie sesjami sprzedażowymi

// PIERWSZY TEST - czy skrypt się wykonuje
console.log('🚀 START - sesja.js');

console.log('🎬 sesja.js - Start ładowania skryptu');

let clients = [];
let products = [];
let currentSession = null;
let recordingTimer = null;
let recordingStartTime = null;
let isRecording = false;
let recognition = null;
let isProcessingResponse = false;

// Elementy DOM
console.log('🔍 Szukanie elementów DOM...');
const sessionClientSelect = document.getElementById('sessionClient');
const sessionProductSelect = document.getElementById('sessionProduct');
const sessionNotesTextarea = document.getElementById('sessionNotes');
const startSessionBtn = document.getElementById('startSessionBtn');
const sessionStatus = document.getElementById('sessionStatus');
const recentSessionsList = document.getElementById('recentSessionsList');

// NATYCHMIASTOWY TEST DOM
console.log('🔍 TEST IMMEDIATE DOM:', {
    sessionClientSelect: !!sessionClientSelect ? 'FOUND' : 'NOT FOUND',
    sessionProductSelect: !!sessionProductSelect ? 'FOUND' : 'NOT FOUND',
    sessionNotesTextarea: !!sessionNotesTextarea ? 'FOUND' : 'NOT FOUND',
});

console.log('🔍 Znalezione elementy DOM:', {
    sessionClientSelect: !!sessionClientSelect,
    sessionProductSelect: !!sessionProductSelect,
    sessionNotesTextarea: !!sessionNotesTextarea,
    startSessionBtn: !!startSessionBtn,
    sessionStatus: !!sessionStatus,
    recentSessionsList: !!recentSessionsList
});

// Funkcja pomocnicza do fetch z automatycznym sprawdzaniem sesji
async function fetchWithAuth(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        // Sprawdź czy odpowiedź wskazuje na wygasłą sesję
        if (response.status === 401) {
            console.log('❌ API zwróciło 401 - sesja wygasła w sesja.js');
            window.location.href = '/login';
            return null;
        }
        
        // Dodatkowe sprawdzenie - czy nie dostaliśmy HTML przekierowania
        if (response.ok && response.url.includes('/login')) {
            console.log('❌ Otrzymano przekierowanie do /login przez URL w sesja.js');
            window.location.href = '/login';
            return null;
        }
        
        return response;
    } catch (error) {
        console.error('❌ Błąd fetchWithAuth w sesja.js:', error);
        throw error;
    }
}

// Inicjalizacja
function initSesjaSection() {
    console.log('🎬 Inicjalizacja sekcji sesja...');
    loadClients();
    loadProducts();
    loadRecentSessions();
    setupEventListeners();
}

// Sprawdź czy DOM jest gotowy lub czekaj na DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSesjaSection);
} else {
    // DOM już gotowy - wykonaj natychmiast
    initSesjaSection();
}

// Konfiguracja event listenerów
function setupEventListeners() {
    console.log('🔧 Konfiguracja event listenerów...');
    
    // Sprawdź czy elementy istnieją
    if (!sessionClientSelect || !sessionProductSelect || !startSessionBtn) {
        console.error('❌ Brak wymaganych elementów DOM dla event listenerów');
        return;
    }
    
    // Wybór klienta i produktu
    sessionClientSelect.addEventListener('change', validateSessionForm);
    sessionProductSelect.addEventListener('change', validateSessionForm);
    
    // Rozpoczęcie sesji
    startSessionBtn.addEventListener('click', function(event) {
        event.preventDefault(); // Zapobiegaj domyślnej akcji
        event.stopPropagation(); // Zatrzymaj propagację
        console.log('🖱️ Kliknięto przycisk Rozpocznij sesję');
        startSession();
    });
    
    // Kontrola sesji
    document.getElementById('pauseSessionBtn')?.addEventListener('click', pauseSession);
    document.getElementById('stopSessionBtn')?.addEventListener('click', stopSession);
    
    console.log('✅ Event listenery skonfigurowane');
}

// Ładowanie klientów
async function loadClients() {
    try {
        console.log('📥 Ładowanie klientów...');
        const response = await fetchWithAuth('/api/clients');
        
        if (!response) {
            // fetchWithAuth już obsłużył przekierowanie
            return;
        }
        
        if (!response.ok) {
            throw new Error('Błąd pobierania klientów');
        }
        
        clients = await response.json();
        console.log('✅ Załadowano klientów:', clients.length);
        populateClientSelect();
        
    } catch (error) {
        console.error('❌ Błąd ładowania klientów:', error);
        showToast('Błąd ładowania klientów', 'error');
    }
}

// Ładowanie produktów
async function loadProducts() {
    try {
        console.log('📥 Ładowanie produktów...');
        const response = await fetchWithAuth('/api/products');
        
        if (!response) {
            // fetchWithAuth już obsłużył przekierowanie
            return;
        }
        
        if (!response.ok) {
            throw new Error('Błąd pobierania produktów');
        }
        
        products = await response.json();
        console.log('✅ Załadowano produktów:', products.length);
        populateProductSelect();
        
    } catch (error) {
        console.error('❌ Błąd ładowania produktów:', error);
        showToast('Błąd ładowania produktów', 'error');
    }
}

// Wypełnienie listy klientów
function populateClientSelect() {
    console.log('🏢 populateClientSelect - start, klienci:', clients.length);
    console.log('🔍 Element sessionClientSelect:', !!sessionClientSelect);
    
    if (!sessionClientSelect) {
        console.error('❌ Element sessionClientSelect nie istnieje!');
        return;
    }
    
    sessionClientSelect.innerHTML = '<option value="">-- Wybierz klienta --</option>';
    
    clients.forEach((client, index) => {
        console.log(`👤 Dodaję klienta ${index + 1}:`, client.name, `(ID: ${client.id})`);
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        sessionClientSelect.appendChild(option);
    });
    
    console.log('✅ populateClientSelect - zakończone, opcje:', sessionClientSelect.children.length);
}

// Wypełnienie listy produktów
function populateProductSelect() {
    console.log('📦 populateProductSelect - start, produkty:', products.length);
    console.log('🔍 Element sessionProductSelect:', !!sessionProductSelect);
    
    if (!sessionProductSelect) {
        console.error('❌ Element sessionProductSelect nie istnieje!');
        return;
    }
    
    sessionProductSelect.innerHTML = '<option value="">-- Wybierz produkt --</option>';
    
    products.forEach((product, index) => {
        console.log(`📦 Dodaję produkt ${index + 1}:`, product.name, `(ID: ${product.id})`);
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = product.name;
        sessionProductSelect.appendChild(option);
    });
    
    console.log('✅ populateProductSelect - zakończone, opcje:', sessionProductSelect.children.length);
}

// Walidacja formularza sesji
function validateSessionForm() {
    const clientSelected = sessionClientSelect.value !== '';
    const productSelected = sessionProductSelect.value !== '';
    
    startSessionBtn.disabled = !(clientSelected && productSelected);
}

// Rozpoczęcie sesji
async function startSession() {
    console.log('🎙️ startSession() - rozpoczynam live chat sesję...');
    
    const clientId = sessionClientSelect.value;
    const productId = sessionProductSelect.value;
    const notes = sessionNotesTextarea.value;
    
    console.log('📋 Dane sesji:', { clientId, productId, notes });
    
    if (!clientId || !productId) {
        console.log('❌ Brak klienta lub produktu');
        showToast('Proszę wybierz klienta i produkt', 'error');
        return;
    }
    
    try {
        console.log('🤖 Rozpoczynam live chat z ChatGPT...');
        
        // Rozpocznij chat z OpenAI
        const response = await fetchWithAuth('/api/chat/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                clientId: clientId,
                productId: productId,
                notes: notes
            })
        });
        
        if (!response) {
            return; // fetchWithAuth już obsłużył przekierowanie
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Błąd rozpoczynania chatu');
        }
        
        const chatData = await response.json();
        console.log('✅ Chat rozpoczęty:', chatData);
        
        // Utwórz sesję
        currentSession = {
            clientId: clientId,
            productId: productId,
            notes: notes,
            chatContext: chatData.chatContext,
            conversationHistory: [],
            startTime: new Date()
        };
        
        console.log('✅ Sesja utworzona:', currentSession);
        
        // Pokaż interfejs live chatu
        console.log('🖥️ Pokazuję interfejs live chatu...');
        showLiveChatInterface();
        
        // Wyczyść panel sugestii
        const suggestionsContent = document.getElementById('suggestionsContent');
        if (suggestionsContent) {
            suggestionsContent.innerHTML = `
                <div class="suggestion-item initial">
                    <i class="fas fa-info-circle"></i>
                    <span>Rozpocznij rozmowę z klientem. AI będzie analizował i podpowiadał w czasie rzeczywistym.</span>
                </div>
            `;
        }
        
        // Rozpocznij timer
        console.log('⏰ Rozpoczynam timer...');
        startRecordingTimer();
        
        console.log('🎉 Live chat sesja rozpoczęta pomyślnie!');
        showToast('Live chat z ChatGPT rozpoczęty!', 'success');
        
    } catch (error) {
        console.error('❌ Błąd rozpoczynania live chat sesji:', error);
        showToast('Błąd rozpoczynania sesji: ' + error.message, 'error');
    }
}

// Pokazanie interfejsu nagrywania
function showRecordingInterface() {
    console.log('🖥️ showRecordingInterface() - start');
    
    try {
        // Ukryj formularz konfiguracji
        console.log('🔍 Szukam .setup-card...');
        const setupCard = document.querySelector('.setup-card');
        if (setupCard) {
            console.log('✅ Znaleziono .setup-card, ukrywam...');
            setupCard.style.display = 'none';
        } else {
            console.error('❌ NIE znaleziono .setup-card!');
        }
        
        // Pokaż status sesji
        console.log('🔍 Sprawdzam sessionStatus element...');
        if (sessionStatus) {
            console.log('✅ sessionStatus istnieje, pokazuję...');
            sessionStatus.style.display = 'block';
        } else {
            console.error('❌ sessionStatus NIE istnieje!');
        }
        
        // Wypełnij informacje o sesji
        console.log('🔍 Szukam klienta i produktu...');
        const selectedClient = clients.find(c => c.id == currentSession.clientId);
        const selectedProduct = products.find(p => p.id == currentSession.productId);
        
        console.log('👤 Znaleziony klient:', selectedClient);
        console.log('📦 Znaleziony produkt:', selectedProduct);
        
        console.log('🔍 Aktualizuję nazwy w interfejsie...');
        const clientNameEl = document.getElementById('currentClientName');
        const productNameEl = document.getElementById('currentProductName');
        
        if (clientNameEl) {
            clientNameEl.textContent = selectedClient ? selectedClient.name : '-';
            console.log('✅ Zaktualizowano currentClientName');
        } else {
            console.error('❌ NIE znaleziono currentClientName!');
        }
        
        if (productNameEl) {
            productNameEl.textContent = selectedProduct ? selectedProduct.name : '-';
            console.log('✅ Zaktualizowano currentProductName');
        } else {
            console.error('❌ NIE znaleziono currentProductName!');
        }
        
        console.log('✅ showRecordingInterface() - zakończone pomyślnie');
        
    } catch (error) {
        console.error('❌ BŁĄD w showRecordingInterface():', error);
        throw error; // Re-throw aby zobaczyć czy to powoduje przekierowanie
    }
}

// Rozpoczęcie timera nagrywania
function startRecordingTimer() {
    recordingStartTime = Date.now();
    recordingTimer = setInterval(updateRecordingTime, 1000);
}

// Aktualizacja czasu nagrywania
function updateRecordingTime() {
    if (!recordingStartTime) return;
    
    const elapsed = Date.now() - recordingStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    const timeString = 
        String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0');
    
    // Aktualizuj timer w nowym interfejsie
    const sessionTimer = document.getElementById('sessionTimer');
    if (sessionTimer) {
        sessionTimer.textContent = timeString;
    }
    
    // Aktualizuj timer w live chat interface (fallback)
    const liveChatTimer = document.getElementById('liveChatTimer');
    if (liveChatTimer) {
        liveChatTimer.textContent = timeString;
    }
    
    // Fallback na stary timer
    const recordingTime = document.getElementById('recordingTime');
    if (recordingTime) {
        recordingTime.textContent = timeString;
    }
}

// Wstrzymanie sesji
function pauseSession() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    
    const pauseBtn = document.getElementById('pauseSessionBtn');
    pauseBtn.innerHTML = '<i class="fas fa-play"></i> Wznów';
    pauseBtn.onclick = resumeSession;
    
    showToast('Sesja wstrzymana', 'info');
}

// Wznowienie sesji
function resumeSession() {
    startRecordingTimer();
    
    const pauseBtn = document.getElementById('pauseSessionBtn');
    pauseBtn.innerHTML = '<i class="fas fa-pause"></i> Wstrzymaj';
    pauseBtn.onclick = pauseSession;
    
    showToast('Sesja wznowiona', 'info');
}

// Zakończenie sesji
async function stopSession() {
    if (!currentSession) return;
    
    try {
        // Zatrzymaj timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // Zatrzymaj strumień audio
        if (currentSession.stream) {
            currentSession.stream.getTracks().forEach(track => track.stop());
        }
        
        // Zapisz sesję (symulacja - w rzeczywistości wysłałbyś nagranie do serwera)
        const sessionData = {
            clientId: currentSession.clientId,
            productId: currentSession.productId,
            notes: currentSession.notes,
            duration: Date.now() - recordingStartTime,
            endTime: new Date()
        };
        
        console.log('Sesja zakończona:', sessionData);
        
        // Reset interfejsu
        resetSessionInterface();
        
        // Odśwież ostatnie sesje
        loadRecentSessions();
        
        showToast('Sesja zakończona i zapisana', 'success');
        
    } catch (error) {
        console.error('Błąd kończenia sesji:', error);
        showToast('Błąd kończenia sesji', 'error');
    }
}

// Reset interfejsu sesji
function resetSessionInterface() {
    // Pokaż formularz konfiguracji
    document.querySelector('.setup-card').style.display = 'block';
    
    // Ukryj status sesji
    sessionStatus.style.display = 'none';
    
    // Wyczyść formularz
    sessionClientSelect.value = '';
    sessionProductSelect.value = '';
    sessionNotesTextarea.value = '';
    
    // Reset zmiennych
    currentSession = null;
    recordingStartTime = null;
    
    // Waliduj formularz
    validateSessionForm();
}

// Ładowanie ostatnich sesji
async function loadRecentSessions() {
    try {
        console.log('📅 Ładowanie ostatnich sesji...');
        const response = await fetchWithAuth('/api/sales');
        
        if (!response) {
            // fetchWithAuth już obsłużył przekierowanie
            return;
        }
        
        if (!response.ok) {
            throw new Error('Błąd pobierania sesji');
        }
        
        const sessions = await response.json();
        console.log('✅ Załadowano sesji:', sessions.length);
        displayRecentSessions(sessions.slice(0, 5)); // Ostatnie 5 sesji
        
    } catch (error) {
        console.error('Błąd ładowania sesji:', error);
        // Nie blokujemy UI - pokaż pustą listę
        displayRecentSessions([]);
    }
}

// Wyświetlenie ostatnich sesji
function displayRecentSessions(sessions) {
    if (sessions.length === 0) {
        recentSessionsList.innerHTML = `
            <div class="no-sessions">
                <i class="fas fa-microphone-slash"></i>
                <p>Brak ostatnich sesji</p>
            </div>
        `;
        return;
    }
    
    recentSessionsList.innerHTML = sessions.map(session => `
        <div class="session-item">
            <div class="session-details">
                <div class="session-title">${session.client_name} - ${session.product_name}</div>
                <div class="session-meta">${new Date(session.meeting_datetime).toLocaleString('pl-PL')}</div>
            </div>
            <div class="session-duration">
                <i class="fas fa-clock"></i>
                ${formatDuration(session.created_at)}
            </div>
        </div>
    `).join('');
}

// Formatowanie czasu trwania
function formatDuration(timestamp) {
    // Placeholder - w rzeczywistości obliczałbyś rzeczywisty czas trwania
    return '15:30';
}

// Funkcja toast (fallback jeśli nie istnieje globalnie)
function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }
    
    // Fallback
    if (type === 'error') {
        alert('Błąd: ' + message);
    } else {
        alert(message);
    }
}

// Funkcja testowa - sprawdź czy skrypt się załadował
window.testSesjaScript = function() {
    console.log('✅ sesja.js ZAŁADOWANY!');
    console.log('🔍 Elementy DOM:', {
        sessionClientSelect: !!sessionClientSelect,
        sessionProductSelect: !!sessionProductSelect
    });
    
    // Przetestuj ładowanie danych ręcznie
    console.log('🧪 Testuje ładowanie klientów...');
    loadClients();
    
    console.log('🧪 Testuje ładowanie produktów...');
    loadProducts();
};

// Pokazanie interfejsu live chatu z ChatGPT
function showLiveChatInterface() {
    console.log('🖥️ showLiveChatInterface() - start');
    
    try {
        // Ukryj formularz konfiguracji
        const setupCard = document.querySelector('.setup-card');
        if (setupCard) {
            setupCard.style.display = 'none';
        }
        
        // Ukryj stary status sesji
        const sessionStatus = document.getElementById('sessionStatus');
        if (sessionStatus) {
            sessionStatus.style.display = 'none';
        }
        
        // Ukryj recent sessions
        const recentSessions = document.querySelector('.recent-sessions');
        if (recentSessions) {
            recentSessions.style.display = 'none';
        }
        
        // Znajdź informacje o kliencie i produkcie
        const selectedClient = clients.find(c => c.id == currentSession.clientId);
        const selectedProduct = products.find(p => p.id == currentSession.productId);
        
        // NOWY PROSTY INTERFEJS - TYLKO SUGESTIE AI
        const liveChatHTML = `
            <div class="ai-suggestions-interface">
                <!-- Kompaktowy header -->
                <div class="compact-header">
                    <div class="session-info">
                        <h1>🤖 AI Asystent Sprzedażowy</h1>
                        <p>Klient: <strong>${selectedClient ? selectedClient.name : 'Nieznany'}</strong> | 
                           Produkt: <strong>${selectedProduct ? selectedProduct.name : 'Nieznany'}</strong> | 
                           Czas: <span id="sessionTimer">00:00:00</span></p>
                    </div>
                    <button class="end-session-btn" id="endSessionBtn">
                        Zakończ sesję
                    </button>
                </div>
                
                <!-- GŁÓWNY PANEL SUGESTII -->
                <div class="ai-suggestions-panel">
                    <div class="suggestions-title">
                        <h2>💡 Sugestie AI w czasie rzeczywistym</h2>
                        <div class="ai-status" id="aiStatus">
                            <span class="status-dot"></span>
                            <span>Oczekuje na rozpoczęcie</span>
                        </div>
                    </div>
                    
                    <div class="suggestions-area" id="suggestionsArea">
                        <!-- Wiadomość startowa -->
                        <div class="start-message">
                            <div class="start-icon">🎯</div>
                            <h3>Gotowy do pomocy!</h3>
                            <p>Kliknij przycisk poniżej aby rozpocząć analizę rozmowy.<br>
                               AI będzie podpowiadać Ci najlepsze strategie sprzedażowe.</p>
                            
                            <div class="quick-tips">
                                <div class="tip">
                                    <span class="tip-icon">🤝</span>
                                    <span>Buduj relację z klientem</span>
                                </div>
                                <div class="tip">
                                    <span class="tip-icon">🔍</span>
                                    <span>Odkryj prawdziwe potrzeby</span>
                                </div>
                                <div class="tip">
                                    <span class="tip-icon">💎</span>
                                    <span>Dopasuj rozwiązanie</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- DUŻY PRZYCISK START -->
                <div class="start-control">
                    <button class="start-ai-btn" id="startAiBtn">
                        <span class="btn-icon">🎤</span>
                        <div class="btn-text">
                            <div class="btn-title">Rozpocznij analizę AI</div>
                            <div class="btn-subtitle">Kliknij aby AI zaczął słuchać i doradzać</div>
                        </div>
                    </button>
                    
                    <div class="listening-indicator" id="listeningIndicator" style="display: none;">
                        <div class="sound-waves">
                            <span class="wave"></span>
                            <span class="wave"></span>
                            <span class="wave"></span>
                        </div>
                        <span class="listening-text">AI słucha i analizuje rozmowę...</span>
                    </div>
                </div>
            </div>
        `;
        
        // Dodaj interfejs do session-content
        const sessionContent = document.querySelector('.session-content');
        if (sessionContent) {
            sessionContent.insertAdjacentHTML('beforeend', liveChatHTML);
        }
        
        // Konfiguruj event listenery
        setupSimpleEventListeners();
        
        console.log('✅ showLiveChatInterface() - zakończone pomyślnie');
        
    } catch (error) {
        console.error('❌ BŁĄD w showLiveChatInterface():', error);
        throw error;
    }
}

// Proste event listenery
function setupSimpleEventListeners() {
    console.log('🔧 Konfiguracja prostych event listenerów...');
    
    // Przycisk zakończ sesję
    const endSessionBtn = document.getElementById('endSessionBtn');
    if (endSessionBtn) {
        endSessionBtn.addEventListener('click', endLiveChat);
    }
    
    // Przycisk start AI
    const startAiBtn = document.getElementById('startAiBtn');
    if (startAiBtn) {
        startAiBtn.addEventListener('click', toggleAIListening);
    }
    
    console.log('✅ Proste event listenery skonfigurowane');
}

// Toggle AI słuchania
function toggleAIListening() {
    if (isRecording) {
        stopAIListening();
    } else {
        startAIListening();
    }
}

// Start AI słuchania
function startAIListening() {
    console.log('🎤 Rozpoczynam AI słuchanie...');
    
    if (!recognition && !initSpeechRecognition()) {
        showToast('Rozpoznawanie mowy nie jest obsługiwane', 'error');
        return;
    }
    
    try {
        recognition.start();
        isRecording = true;
        updateAIUI(true);
    } catch (error) {
        console.error('❌ Błąd rozpoczynania AI słuchania:', error);
    }
}

// Stop AI słuchania
function stopAIListening() {
    console.log('🛑 Zatrzymuję AI słuchanie');
    
    if (recognition) {
        recognition.stop();
    }
    
    isRecording = false;
    updateAIUI(false);
}

// Update AI UI
function updateAIUI(listening) {
    const startBtn = document.getElementById('startAiBtn');
    const listeningIndicator = document.getElementById('listeningIndicator');
    const aiStatus = document.getElementById('aiStatus');
    const statusDot = aiStatus?.querySelector('.status-dot');
    
    if (listening) {
        // Przycisk
        if (startBtn) {
            startBtn.classList.add('recording');
            const btnTitle = startBtn.querySelector('.btn-title');
            const btnSubtitle = startBtn.querySelector('.btn-subtitle');
            if (btnTitle) btnTitle.textContent = 'Zatrzymaj analizę AI';
            if (btnSubtitle) btnSubtitle.textContent = 'AI aktywnie analizuje rozmowę';
        }
        
        // Indicator
        if (listeningIndicator) {
            listeningIndicator.style.display = 'flex';
        }
        
        // Status
        if (aiStatus) {
            aiStatus.classList.add('active');
            const statusText = aiStatus.querySelector('span:last-child');
            if (statusText) statusText.textContent = 'AI aktywny - analizuje';
        }
        
        // Usuń start message
        const startMessage = document.querySelector('.start-message');
        if (startMessage) {
            startMessage.style.display = 'none';
        }
        
    } else {
        // Przycisk
        if (startBtn) {
            startBtn.classList.remove('recording');
            const btnTitle = startBtn.querySelector('.btn-title');
            const btnSubtitle = startBtn.querySelector('.btn-subtitle');
            if (btnTitle) btnTitle.textContent = 'Rozpocznij analizę AI';
            if (btnSubtitle) btnSubtitle.textContent = 'Kliknij aby AI zaczął słuchać i doradzać';
        }
        
        // Indicator
        if (listeningIndicator) {
            listeningIndicator.style.display = 'none';
        }
        
        // Status
        if (aiStatus) {
            aiStatus.classList.remove('active');
            const statusText = aiStatus.querySelector('span:last-child');
            if (statusText) statusText.textContent = 'Oczekuje na rozpoczęcie';
        }
    }
}

// Wyświetlanie sugestii AI - NOWA FUNKCJA
function displayAISuggestions(analysis) {
    const suggestionsArea = document.getElementById('suggestionsArea');
    if (!suggestionsArea) return;
    
    // Parsuj analizę
    const lines = analysis.split('\n').filter(line => line.trim());
    let speaker = '';
    let suggestions = [];
    
    lines.forEach(line => {
        if (line.includes('[KTO MÓWI]:')) {
            speaker = line.split(':')[1]?.trim();
        } else if (line.includes('[SUGESTIA')) {
            suggestions.push(line.split(':')[1]?.trim());
        }
    });
    
    // Utwórz kartę sugestii
    const suggestionCard = document.createElement('div');
    suggestionCard.className = 'suggestion-card';
    
    const timestamp = new Date().toLocaleTimeString('pl-PL', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    
    const speakerIcon = speaker === 'klient' ? '👤' : '🎯';
    const speakerText = speaker === 'klient' ? 'Klient mówi' : 'Twoja kolej';
    const cardClass = speaker === 'klient' ? 'client-turn' : 'seller-turn';
    
    suggestionCard.innerHTML = `
        <div class="card-header ${cardClass}">
            <div class="speaker-badge">
                <span class="speaker-icon">${speakerIcon}</span>
                <span class="speaker-text">${speakerText}</span>
            </div>
            <div class="card-time">${timestamp}</div>
        </div>
        
        <div class="suggestions-list">
            ${suggestions.map(suggestion => `
                <div class="suggestion-item">
                    <span class="suggestion-icon">💡</span>
                    <span class="suggestion-text">${suggestion}</span>
                </div>
            `).join('')}
        </div>
    `;
    
    // Usuń stare karty jeśli jest ich za dużo
    const allCards = suggestionsArea.querySelectorAll('.suggestion-card');
    if (allCards.length >= 6) {
        for (let i = 0; i < allCards.length - 5; i++) {
            allCards[i].remove();
        }
    }
    
    suggestionsArea.appendChild(suggestionCard);
    
    // Auto-scroll
    suggestionsArea.scrollTop = suggestionsArea.scrollHeight;
    
    // Animacja wejścia
    setTimeout(() => {
        suggestionCard.classList.add('visible');
    }, 100);
}

// Zakończenie live chatu
async function endLiveChat() {
    console.log('🔚 Zakończenie live chatu...');
    
    try {
        // Zatrzymaj timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // Zatrzymaj rozpoznawanie mowy
        if (recognition && isRecording) {
            recognition.stop();
        }
        
        // Zatrzymaj syntezę mowy (jeśli jeszcze istnieje)
        if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.cancel();
        }
        
        // Zapisz sesję do bazy danych
        if (currentSession && currentSession.conversationHistory.length > 0) {
            console.log('💾 Zapisuję sesję do bazy danych...');
            
            try {
                const response = await fetchWithAuth('/api/chat/save-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        clientId: currentSession.clientId,
                        productId: currentSession.productId,
                        conversationHistory: currentSession.conversationHistory,
                        notes: currentSession.notes,
                        startTime: currentSession.startTime
                    })
                });
                
                if (response && response.ok) {
                    const sessionData = await response.json();
                    console.log('✅ Sesja zapisana:', sessionData.session.id);
                    
                    // Pokaż podsumowanie sesji
                    showSessionSummary(sessionData.session);
                } else {
                    console.error('❌ Błąd zapisywania sesji');
                    showToast('Błąd zapisywania sesji', 'error');
                }
                
            } catch (saveError) {
                console.error('❌ Błąd podczas zapisywania sesji:', saveError);
                showToast('Nie udało się zapisać sesji', 'error');
            }
        }
        
        // Usuń interfejs live chatu
        const liveChatInterface = document.getElementById('liveChatInterface');
        if (liveChatInterface) {
            liveChatInterface.remove();
        }
        
        // Przywróć oryginalny interfejs
        const setupCard = document.querySelector('.setup-card');
        const recentSessions = document.querySelector('.recent-sessions');
        
        if (setupCard) {
            setupCard.style.display = 'block';
        }
        
        if (recentSessions) {
            recentSessions.style.display = 'block';
        }
        
        // Wyczyść formularz
        if (sessionClientSelect) sessionClientSelect.value = '';
        if (sessionProductSelect) sessionProductSelect.value = '';
        if (sessionNotesTextarea) sessionNotesTextarea.value = '';
        
        // Reset zmiennych
        currentSession = null;
        recordingStartTime = null;
        isRecording = false;
        recognition = null;
        
        // Waliduj formularz
        validateSessionForm();
        
        // Odśwież ostatnie sesje
        loadRecentSessions();
        
        showToast('Live chat zakończony', 'success');
        
    } catch (error) {
        console.error('❌ Błąd kończenia live chatu:', error);
        showToast('Błąd kończenia sesji', 'error');
    }
}

// Pokazanie podsumowania sesji po zakończeniu
function showSessionSummary(sessionData) {
    console.log('📊 Pokazuję podsumowanie sesji:', sessionData);
    
    // Utwórz modal z podsumowaniem
    const modal = document.createElement('div');
    modal.className = 'session-summary-modal';
    modal.id = 'sessionSummaryModal';
    
    const formatText = (text) => {
        return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    };
    
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closeSessionSummary()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>
                    <i class="fas fa-chart-line"></i>
                    Podsumowanie sesji
                </h3>
                <button type="button" class="close-btn" onclick="closeSessionSummary()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="modal-body">
                <div class="summary-section">
                    <h4><i class="fas fa-thumbs-up"></i> Pozytywne wnioski</h4>
                    <div class="summary-content positive">
                        ${formatText(sessionData.positiveFindings)}
                    </div>
                </div>
                
                <div class="summary-section">
                    <h4><i class="fas fa-thumbs-down"></i> Obszary do poprawy</h4>
                    <div class="summary-content negative">
                        ${formatText(sessionData.negativeFindings)}
                    </div>
                </div>
                
                <div class="summary-section">
                    <h4><i class="fas fa-lightbulb"></i> Rekomendacje na przyszłość</h4>
                    <div class="summary-content recommendations">
                        ${formatText(sessionData.recommendations)}
                    </div>
                </div>
                
                <div class="summary-meta">
                    <p><strong>Data sesji:</strong> ${new Date(sessionData.meetingDatetime).toLocaleString('pl-PL')}</p>
                    <p><strong>ID sesji:</strong> #${sessionData.id}</p>
                </div>
            </div>
            
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeSessionSummary()">
                    <i class="fas fa-check"></i>
                    Rozumiem
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Animacja wejścia
    setTimeout(() => {
        modal.classList.add('show');
    }, 100);
}

// Zamknięcie podsumowania sesji
function closeSessionSummary() {
    const modal = document.getElementById('sessionSummaryModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// Dodaj style do window (fallback jeśli nie ma globalnych stylów)
if (!document.getElementById('sessionSummaryStyles')) {
    const styles = document.createElement('style');
    styles.id = 'sessionSummaryStyles';
    styles.textContent = `
        .session-summary-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        .session-summary-modal.show {
            opacity: 1;
        }
        
        .modal-backdrop {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
        }
        
        .modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 16px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }
        
        .modal-header {
            padding: 20px 24px;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 16px 16px 0 0;
        }
        
        .modal-header h3 {
            margin: 0;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        
        .close-btn {
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            cursor: pointer;
            opacity: 0.8;
            transition: opacity 0.3s;
        }
        
        .close-btn:hover {
            opacity: 1;
        }
        
        .modal-body {
            padding: 24px;
        }
        
        .summary-section {
            margin-bottom: 24px;
        }
        
        .summary-section h4 {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 12px 0;
            color: #1e293b;
            font-size: 16px;
        }
        
        .summary-content {
            padding: 16px;
            border-radius: 8px;
            line-height: 1.6;
        }
        
        .summary-content.positive {
            background: #f0fdf4;
            border: 1px solid #10b981;
            color: #065f46;
        }
        
        .summary-content.negative {
            background: #fef2f2;
            border: 1px solid #ef4444;
            color: #991b1b;
        }
        
        .summary-content.recommendations {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            color: #92400e;
        }
        
        .summary-meta {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            font-size: 14px;
            color: #64748b;
        }
        
        .summary-meta p {
            margin: 4px 0;
        }
        
        .modal-footer {
            padding: 16px 24px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
        }
    `;
    document.head.appendChild(styles);
}

// Wysyłanie wiadomości tekstowej (tylko do testów)
function sendTextMessage() {
    const chatTextInput = document.getElementById('chatTextInput');
    const message = chatTextInput.value.trim();
    if (!message) return;
    
    chatTextInput.value = '';
    
    // Dodaj jako wypowiedź do rozmowy
    processSpeech(message);
}

// Analiza rozmowy w czasie rzeczywistym
async function analyzeConversationInRealTime() {
    console.log('🤖 Analizuję rozmowę w czasie rzeczywistym...');
    
    if (!currentSession || !currentSession.chatContext) {
        return;
    }
    
    // Nie analizuj jeśli już przetwarzamy
    if (isProcessingResponse) {
        console.log('⏳ Już analizuję, pomijam...');
        return;
    }
    
    try {
        isProcessingResponse = true;
        
        // Przygotuj kontekst z ostatnich wypowiedzi
        const recentTranscripts = currentSession.conversationHistory
            .slice(-15)
            .filter(msg => msg.role === 'speech')
            .map(msg => msg.content)
            .join(' ');
        
        // Specjalny prompt dla analizy real-time
        const realtimePrompt = `${currentSession.chatContext.systemPrompt}

TRANSKRYPCJA ROZMOWY W TOKU:
"${recentTranscripts}"

TWOJE ZADANIE:
1. Rozpoznaj kto mówi (handlowiec vs klient) na podstawie kontekstu
2. Zidentyfikuj najważniejsze elementy rozmowy
3. Daj mi NATYCHMIASTOWE wskazówki co powinienem teraz zrobić/powiedzieć

PAMIĘTAJ:
- Odpowiadaj BARDZO KRÓTKO (max 2-3 wskazówki)
- Skup się na tym co TERAZ jest ważne
- Nie powtarzaj wcześniejszych sugestii
- Reaguj na zmiany w rozmowie
- ZAWSZE dawaj konkretne sugestie

Format odpowiedzi:
[KTO MÓWI]: handlowiec/klient
[SUGESTIA]: co zrobić TERAZ
[SUGESTIA 2]: dodatkowa wskazówka (opcjonalnie)`;
        
        // Wyślij do AI
        const response = await fetchWithAuth('/api/chat/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: realtimePrompt,
                systemPrompt: 'Jesteś ekspertem od sprzedaży słuchającym rozmowy na żywo. Analizuj i doradzaj KRÓTKO.',
                conversationHistory: []
            })
        });
        
        if (!response || !response.ok) {
            console.error('❌ Błąd analizy AI');
            isProcessingResponse = false;
            return;
        }
        
        // Odbierz sugestie
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;
        }
        
        console.log('💡 Analiza real-time:', fullResponse);
        
        // Wyświetl sugestie używając nowej funkcji
        displayAISuggestions(fullResponse);
        
        // Opóźnienie przed następną analizą
        setTimeout(() => {
            isProcessingResponse = false;
        }, 1000);
        
    } catch (error) {
        console.error('❌ Błąd analizy real-time:', error);
        isProcessingResponse = false;
    }
}

// Inicjalizacja rozpoznawania mowy
function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
    } else if ('SpeechRecognition' in window) {
        recognition = new SpeechRecognition();
    } else {
        console.warn('⚠️ Rozpoznawanie mowy nie jest obsługiwane');
        return false;
    }
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pl-PL';
    recognition.maxAlternatives = 1;
    
    let currentTranscript = '';
    let silenceTimer = null;
    
    recognition.onstart = function() {
        console.log('🎤 Rozpoczęto nagrywanie');
        isRecording = true;
    };
    
    recognition.onresult = function(event) {
        let interimTranscript = '';
        currentTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                currentTranscript += transcript + ' ';
                
                // Resetuj timer ciszy
                clearTimeout(silenceTimer);
                
                // Ustaw timer ciszy (1 sekunda dla szybszej reakcji)
                silenceTimer = setTimeout(() => {
                    if (currentTranscript.trim()) {
                        processSpeech(currentTranscript.trim());
                        currentTranscript = '';
                    }
                }, 1000);
                
            } else {
                interimTranscript += transcript;
            }
        }
    };
    
    recognition.onerror = function(event) {
        console.error('❌ Błąd rozpoznawania:', event.error);
        if (event.error !== 'aborted') {
            stopAIListening();
        }
    };
    
    recognition.onend = function() {
        console.log('🎤 Zakończono rozpoznawanie');
        if (isRecording) {
            // Restart jeśli nadal słuchamy
            setTimeout(() => {
                if (isRecording) {
                    recognition.start();
                }
            }, 100);
        }
    };
    
    return true;
}

// Przetwarzanie wypowiedzi
function processSpeech(transcript) {
    console.log('💬 Nowa wypowiedź:', transcript);
    
    // Dodaj do historii sesji
    if (currentSession) {
        currentSession.conversationHistory.push({
            role: 'speech',
            content: transcript,
            timestamp: new Date()
        });
    }
    
    // Analizuj rozmowę w tle
    analyzeConversationInRealTime();
} 