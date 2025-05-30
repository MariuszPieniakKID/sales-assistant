// sesja.js - Zarządzanie sesjami sprzedażowymi

// PIERWSZY TEST - czy skrypt się wykonuje
console.log('🚀 START - sesja.js');

console.log('🎬 sesja.js - Start ładowania skryptu');

let clients = [];
let products = [];
let currentSession = null;
let recordingTimer = null;
let recordingStartTime = null;

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
    
    document.getElementById('recordingTime').textContent = timeString;
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
        
        // Utwórz interfejs live chatu
        const liveChatHTML = `
            <div class="live-chat-interface" id="liveChatInterface">
                <div class="chat-header">
                    <div class="chat-info">
                        <h3>
                            <i class="fas fa-comments"></i>
                            Live Chat z ChatGPT
                        </h3>
                        <div class="session-details">
                            <span class="client-info">👤 ${selectedClient ? selectedClient.name : 'Nieznany klient'}</span>
                            <span class="product-info">📦 ${selectedProduct ? selectedProduct.name : 'Nieznany produkt'}</span>
                            <span class="timer-info">⏱️ <span id="liveChatTimer">00:00:00</span></span>
                        </div>
                    </div>
                    <div class="chat-controls">
                        <button type="button" class="btn btn-danger" id="endChatBtn">
                            <i class="fas fa-phone-slash"></i>
                            Zakończ sesję
                        </button>
                    </div>
                </div>
                
                <div class="chat-content">
                    <div class="chat-messages" id="chatMessages">
                        <div class="system-message">
                            <i class="fas fa-robot"></i>
                            <p>Witaj! Jestem Twoim asystentem sprzedażowym. Gotowy do rozmowy z klientem <strong>${selectedClient ? selectedClient.name : 'Nieznany'}</strong> na temat produktu <strong>${selectedProduct ? selectedProduct.name : 'Nieznany'}</strong>. Jak mogę Ci pomóc?</p>
                        </div>
                    </div>
                    
                    <div class="chat-input-section">
                        <div class="voice-controls">
                            <button type="button" class="btn btn-primary voice-btn" id="startVoiceBtn">
                                <i class="fas fa-microphone"></i>
                                Naciśnij i mów
                            </button>
                            <div class="voice-status" id="voiceStatus">
                                <span class="status-text">Gotowy do nagrywania</span>
                                <div class="voice-wave" id="voiceWave" style="display: none;">
                                    <div class="wave-bar"></div>
                                    <div class="wave-bar"></div>
                                    <div class="wave-bar"></div>
                                    <div class="wave-bar"></div>
                                    <div class="wave-bar"></div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="text-input-section">
                            <input type="text" id="chatTextInput" placeholder="Lub napisz wiadomość..." />
                            <button type="button" class="btn btn-secondary" id="sendTextBtn">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Dodaj interfejs do session-content
        const sessionContent = document.querySelector('.session-content');
        if (sessionContent) {
            sessionContent.insertAdjacentHTML('beforeend', liveChatHTML);
        }
        
        // Konfiguruj event listenery dla live chatu
        setupLiveChatEventListeners();
        
        console.log('✅ showLiveChatInterface() - zakończone pomyślnie');
        
    } catch (error) {
        console.error('❌ BŁĄD w showLiveChatInterface():', error);
        throw error;
    }
}

// Konfiguracja event listenerów dla live chatu
function setupLiveChatEventListeners() {
    console.log('🔧 Konfiguracja event listenerów live chatu...');
    
    // Przycisk zakończ sesję
    const endChatBtn = document.getElementById('endChatBtn');
    if (endChatBtn) {
        endChatBtn.addEventListener('click', endLiveChat);
    }
    
    // Przycisk głosowy
    const startVoiceBtn = document.getElementById('startVoiceBtn');
    if (startVoiceBtn) {
        startVoiceBtn.addEventListener('mousedown', startVoiceRecording);
        startVoiceBtn.addEventListener('mouseup', stopVoiceRecording);
        startVoiceBtn.addEventListener('mouseleave', stopVoiceRecording);
        startVoiceBtn.addEventListener('touchstart', startVoiceRecording);
        startVoiceBtn.addEventListener('touchend', stopVoiceRecording);
    }
    
    // Input tekstowy
    const chatTextInput = document.getElementById('chatTextInput');
    const sendTextBtn = document.getElementById('sendTextBtn');
    
    if (chatTextInput && sendTextBtn) {
        chatTextInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendTextMessage();
            }
        });
        
        sendTextBtn.addEventListener('click', sendTextMessage);
    }
    
    console.log('✅ Event listenery live chatu skonfigurowane');
}

// Zmienne dla rozpoznawania mowy
let recognition = null;
let isRecording = false;
let speechSynthesis = window.speechSynthesis;

// Inicjalizacja rozpoznawania mowy
function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
    } else if ('SpeechRecognition' in window) {
        recognition = new SpeechRecognition();
    } else {
        console.warn('⚠️ Rozpoznawanie mowy nie jest obsługiwane w tej przeglądarce');
        return false;
    }
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'pl-PL';
    
    recognition.onstart = function() {
        console.log('🎤 Rozpoczęto rozpoznawanie mowy');
        isRecording = true;
        updateVoiceUI(true);
    };
    
    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        console.log('🗣️ Rozpoznano tekst:', transcript);
        sendMessageToChatGPT(transcript);
    };
    
    recognition.onerror = function(event) {
        console.error('❌ Błąd rozpoznawania mowy:', event.error);
        isRecording = false;
        updateVoiceUI(false);
        showToast('Błąd rozpoznawania mowy: ' + event.error, 'error');
    };
    
    recognition.onend = function() {
        console.log('🎤 Zakończono rozpoznawanie mowy');
        isRecording = false;
        updateVoiceUI(false);
    };
    
    return true;
}

// Rozpoczęcie nagrywania głosu
function startVoiceRecording() {
    if (!recognition && !initSpeechRecognition()) {
        showToast('Rozpoznawanie mowy nie jest obsługiwane', 'error');
        return;
    }
    
    if (isRecording) return;
    
    try {
        recognition.start();
    } catch (error) {
        console.error('❌ Błąd rozpoczynania nagrywania:', error);
        showToast('Błąd rozpoczynania nagrywania', 'error');
    }
}

// Zatrzymanie nagrywania głosu
function stopVoiceRecording() {
    if (recognition && isRecording) {
        recognition.stop();
    }
}

// Aktualizacja UI dla głosu
function updateVoiceUI(recording) {
    const voiceBtn = document.getElementById('startVoiceBtn');
    const voiceStatus = document.getElementById('voiceStatus');
    const voiceWave = document.getElementById('voiceWave');
    const statusText = voiceStatus.querySelector('.status-text');
    
    if (recording) {
        voiceBtn.classList.add('recording');
        voiceBtn.innerHTML = '<i class="fas fa-stop"></i> Mówię...';
        statusText.textContent = 'Słucham...';
        voiceWave.style.display = 'flex';
    } else {
        voiceBtn.classList.remove('recording');
        voiceBtn.innerHTML = '<i class="fas fa-microphone"></i> Naciśnij i mów';
        statusText.textContent = 'Gotowy do nagrywania';
        voiceWave.style.display = 'none';
    }
}

// Wysyłanie wiadomości tekstowej
function sendTextMessage() {
    const chatTextInput = document.getElementById('chatTextInput');
    const message = chatTextInput.value.trim();
    
    if (!message) return;
    
    chatTextInput.value = '';
    sendMessageToChatGPT(message);
}

// Główna funkcja wysyłania wiadomości do ChatGPT
async function sendMessageToChatGPT(message) {
    console.log('🤖 Wysyłam wiadomość do ChatGPT:', message);
    
    if (!currentSession || !currentSession.chatContext) {
        showToast('Brak aktywnej sesji chatu', 'error');
        return;
    }
    
    try {
        // Dodaj wiadomość użytkownika do UI
        addMessageToChat('user', message);
        
        // Pokaż loader
        showChatLoader();
        
        // Wyślij do API
        const response = await fetchWithAuth('/api/chat/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                systemPrompt: currentSession.chatContext.systemPrompt,
                conversationHistory: currentSession.conversationHistory
            })
        });
        
        if (!response) {
            hideChatLoader();
            return; // fetchWithAuth już obsłużył przekierowanie
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Błąd komunikacji z ChatGPT');
        }
        
        const chatData = await response.json();
        console.log('✅ Otrzymano odpowiedź od ChatGPT:', chatData.response);
        
        // Ukryj loader
        hideChatLoader();
        
        // Dodaj odpowiedź AI do UI
        addMessageToChat('ai', chatData.response);
        
        // Zaktualizuj historię konwersacji
        currentSession.conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: chatData.response }
        );
        
        // Odczytaj odpowiedź głosowo
        speakText(chatData.response);
        
    } catch (error) {
        console.error('❌ Błąd komunikacji z ChatGPT:', error);
        hideChatLoader();
        addMessageToChat('error', 'Błąd komunikacji z ChatGPT: ' + error.message);
        showToast('Błąd ChatGPT: ' + error.message, 'error');
    }
}

// Dodawanie wiadomości do chatu
function addMessageToChat(type, message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}-message`;
    
    const timestamp = new Date().toLocaleTimeString('pl-PL', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    let icon = '';
    let senderName = '';
    
    switch (type) {
        case 'user':
            icon = '<i class="fas fa-user"></i>';
            senderName = 'Ty';
            break;
        case 'ai':
            icon = '<i class="fas fa-robot"></i>';
            senderName = 'ChatGPT';
            break;
        case 'error':
            icon = '<i class="fas fa-exclamation-triangle"></i>';
            senderName = 'System';
            messageDiv.className += ' error-message';
            break;
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            ${icon}
            <span class="sender-name">${senderName}</span>
            <span class="message-time">${timestamp}</span>
        </div>
        <div class="message-content">
            <p>${message}</p>
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll do dołu
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Pokazanie loadera w chacie
function showChatLoader() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const loaderDiv = document.createElement('div');
    loaderDiv.className = 'chat-message ai-message loading-message';
    loaderDiv.id = 'chatLoader';
    
    loaderDiv.innerHTML = `
        <div class="message-header">
            <i class="fas fa-robot"></i>
            <span class="sender-name">ChatGPT</span>
        </div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(loaderDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Ukrycie loadera w chacie
function hideChatLoader() {
    const loader = document.getElementById('chatLoader');
    if (loader) {
        loader.remove();
    }
}

// Odczytywanie tekstu głosowo
function speakText(text) {
    if (!speechSynthesis) {
        console.warn('⚠️ Speech synthesis nie jest obsługiwane');
        return;
    }
    
    // Zatrzymaj poprzednie odczytywanie
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pl-PL';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    // Znajdź polski głos jeśli dostępny
    const voices = speechSynthesis.getVoices();
    const polishVoice = voices.find(voice => voice.lang.startsWith('pl'));
    if (polishVoice) {
        utterance.voice = polishVoice;
    }
    
    utterance.onstart = function() {
        console.log('🔊 Rozpoczęto odczytywanie');
    };
    
    utterance.onend = function() {
        console.log('🔊 Zakończono odczytywanie');
    };
    
    utterance.onerror = function(event) {
        console.error('❌ Błąd odczytywania:', event.error);
    };
    
    speechSynthesis.speak(utterance);
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
        
        // Zatrzymaj syntezę mowy
        if (speechSynthesis) {
            speechSynthesis.cancel();
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

// Aktualizacja timera live chatu
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
    
    // Aktualizuj timer w live chat interface
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

// ... existing code ... 