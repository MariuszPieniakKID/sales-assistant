// spotkania.js - Zarządzanie spotkaniami

console.log('🎬 spotkania.js - Start ładowania skryptu');

let meetings = [];
let filteredMeetings = [];

// Elementy DOM - sprawdzenie czy istnieją
console.log('🔍 Sprawdzanie elementów DOM...');
const meetingsTableBody = document.getElementById('meetingsTableBody');
const searchInput = document.getElementById('searchMeetings');
const meetingDetailsModal = document.getElementById('meetingDetailsModal');
const closeMeetingModal = document.getElementById('closeMeetingModal');
const meetingDetails = document.getElementById('meetingDetails');

console.log('📋 Elementy DOM znalezione:', {
    meetingsTableBody: !!meetingsTableBody,
    searchInput: !!searchInput,
    meetingDetailsModal: !!meetingDetailsModal,
    closeMeetingModal: !!closeMeetingModal,
    meetingDetails: !!meetingDetails
});

// Inicjalizacja - sprawdź czy DOM jest już gotowy
console.log('🎯 Sprawdzanie stanu DOM:', document.readyState);

function initializeMeetings() {
    console.log('🚀 Inicjalizacja sekcji spotkań...');
    console.log('🔍 Elementy DOM w inicjalizacji:', {
        meetingsTableBody: !!document.getElementById('meetingsTableBody'),
        searchInput: !!document.getElementById('searchMeetings'),
        meetingDetailsModal: !!document.getElementById('meetingDetailsModal')
    });
    
    loadMeetings();
    setupEventListeners();
}

if (document.readyState === 'loading') {
    console.log('⏳ DOM jeszcze się ładuje - czekam na DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', initializeMeetings);
} else {
    console.log('✅ DOM już gotowy - uruchamiam inicjalizację z małym opóźnieniem');
    // DOM już gotowy, ale dodaj małe opóźnienie dla sekcji AJAX
    setTimeout(initializeMeetings, 200);
}

// Konfiguracja event listenerów
function setupEventListeners() {
    // Wyszukiwanie
    searchInput.addEventListener('input', handleSearch);
    
    // Zamykanie modala
    const closeMeetingModal = document.getElementById('closeMeetingModal');
    if (closeMeetingModal) {
        closeMeetingModal.addEventListener('click', closeMeetingDetailsModal);
    }
    
    // Zamykanie modala przez kliknięcie w tło
    if (meetingDetailsModal) {
        meetingDetailsModal.addEventListener('click', function(e) {
            if (e.target === meetingDetailsModal) {
                closeMeetingDetailsModal();
            }
        });
    }
    
    // Zamykanie modala przez ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && meetingDetailsModal && meetingDetailsModal.classList.contains('active')) {
            closeMeetingDetailsModal();
        }
    });
    
    // Przycisk powrotu do listy spotkań
    const backToListBtn = document.getElementById('backToListBtn');
    if (backToListBtn) {
        backToListBtn.addEventListener('click', backToMeetingsList);
    }
    
    // Przycisk eksportu do PDF
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportMeetingToPDF);
    }
}

// Ładowanie spotkań z API
async function loadMeetings() {
    try {
        console.log('🔄 Ładowanie spotkań z API...');
        showLoading();
        
        const response = await fetch('/api/meetings-all', {
            credentials: 'include'
        });
        console.log('📡 Odpowiedź API:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error('Błąd pobierania spotkań');
        }
        
        meetings = await response.json();
        console.log('📊 Załadowano spotkań:', meetings.length, meetings);
        
        filteredMeetings = [...meetings];
        renderMeetingsTable();
        
    } catch (error) {
        console.error('❌ Błąd ładowania spotkań:', error);
        showError('Nie udało się załadować spotkań');
    }
}

// Wyświetlanie tabeli spotkań
function renderMeetingsTable() {
    console.log('🎨 Renderowanie tabeli spotkań:', filteredMeetings.length);
    
    if (filteredMeetings.length === 0) {
        console.log('📭 Brak spotkań do wyświetlenia - pokazuję pusty stan');
        showEmptyState();
        return;
    }
    
    const tableHTML = filteredMeetings.map(meeting => {
        const meetingDate = new Date(meeting.meeting_datetime);
        const formattedDate = meetingDate.toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const status = getMeetingStatus(meeting);
        const typeInfo = getMeetingTypeInfo(meeting);
        
        return `
            <tr onclick="openMeetingDetails('${meeting.id}', '${meeting.type || 'live_session'}')" data-meeting-id="${meeting.id}" data-meeting-type="${meeting.type || 'live_session'}">
                <td>
                    <div class="client-name">${escapeHtml(meeting.client_name)}</div>
                    <div class="meeting-type-indicator">
                        <i class="fas ${typeInfo.icon}"></i>
                        ${typeInfo.text}
                    </div>
                </td>
                <td>
                    <div class="product-name">${escapeHtml(meeting.product_name)}</div>
                </td>
                <td>
                    <div class="meeting-date">${formattedDate}</div>
                    ${meeting.duration ? `<div class="meeting-duration">⏱️ ${Math.floor(meeting.duration / 60)}min ${meeting.duration % 60}s</div>` : ''}
                </td>
                <td>
                    <span class="status-badge ${status.class}">
                        <i class="fas ${status.icon}"></i>
                        ${status.text}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-view" onclick="event.stopPropagation(); openMeetingDetails('${meeting.id}', '${meeting.type || 'live_session'}')" title="Zobacz szczegóły">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    meetingsTableBody.innerHTML = tableHTML;
}

// Określanie statusu spotkania
function getMeetingStatus(meeting) {
    const now = new Date();
    const meetingDate = new Date(meeting.meeting_datetime);
    
    // Dla nagrań - zawsze sprawdzaj status
    if (meeting.type === 'recording') {
        if (meeting.status === 'completed' && meeting.transcript && meeting.transcript.trim()) {
            return {
                class: 'status-completed',
                icon: 'fa-check-circle',
                text: 'Zakończone'
            };
        } else if (meeting.status === 'active') {
            return {
                class: 'status-active',
                icon: 'fa-microphone',
                text: 'Nagrywanie'
            };
        } else {
            return {
                class: 'status-cancelled',
                icon: 'fa-times-circle',
                text: 'Przerwane'
            };
        }
    }
    
    // Dla live sessions - oryginalna logika
    if (meetingDate > now) {
        return {
            class: 'status-pending',
            icon: 'fa-clock',
            text: 'Zaplanowane'
        };
    } else if (meeting.transcription && meeting.transcription.trim()) {
        return {
            class: 'status-completed',
            icon: 'fa-check-circle',
            text: 'Zakończone'
        };
    } else {
        return {
            class: 'status-cancelled',
            icon: 'fa-times-circle',
            text: 'Anulowane'
        };
    }
}

// Określanie typu spotkania
function getMeetingTypeInfo(meeting) {
    if (meeting.type === 'recording') {
        return {
            icon: 'fa-microphone',
            text: 'Nagranie',
            class: 'type-recording'
        };
    } else {
        return {
            icon: 'fa-comments',
            text: 'Sesja Live',
            class: 'type-live'
        };
    }
}

// Wyszukiwanie spotkań
function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredMeetings = [...meetings];
    } else {
        filteredMeetings = meetings.filter(meeting => 
            meeting.client_name.toLowerCase().includes(searchTerm) ||
            meeting.product_name.toLowerCase().includes(searchTerm) ||
            (meeting.transcription && meeting.transcription.toLowerCase().includes(searchTerm)) ||
            (meeting.positive_findings && meeting.positive_findings.toLowerCase().includes(searchTerm)) ||
            (meeting.negative_findings && meeting.negative_findings.toLowerCase().includes(searchTerm)) ||
            (meeting.recommendations && meeting.recommendations.toLowerCase().includes(searchTerm)) ||
            (meeting.own_notes && meeting.own_notes.toLowerCase().includes(searchTerm))
        );
    }
    
    renderMeetingsTable();
}

// Otwieranie szczegółów spotkania w tej samej sekcji
async function openMeetingDetails(meetingId, meetingType = 'live_session') {
    console.log('Otwieranie szczegółów spotkania ID:', meetingId, 'Typ:', meetingType);
    
    try {
        // Znajdź spotkanie w lokalnych danych
        const meeting = meetings.find(m => m.id === meetingId);
        if (!meeting) {
            console.error('Nie znaleziono spotkania w lokalnych danych');
            showError('Nie znaleziono spotkania');
            return;
        }
        
        console.log('Dane spotkania znalezione:', meeting);
        
        // Ukryj widok listy i pokaż widok szczegółów
        document.getElementById('meetingsListView').style.display = 'none';
        document.getElementById('meetingDetailsView').style.display = 'block';
        
        // Renderuj szczegóły w zależności od typu spotkania
        if (meetingType === 'recording') {
            renderRecordingDetailsInSection(meeting);
        } else {
            renderMeetingDetailsInSection(meeting);
        }
        
    } catch (error) {
        console.error('Błąd otwierania szczegółów spotkania:', error);
        showError('Nie udało się załadować szczegółów spotkania');
    }
}

// Renderowanie szczegółów spotkania w sekcji
function renderMeetingDetailsInSection(meeting) {
    console.log('Renderowanie szczegółów spotkania:', meeting);
    
    // Zapisz spotkanie do eksportu PDF
    currentMeetingForExport = meeting;
    
    // Ustaw tytuł
    const titleElement = document.getElementById('meetingDetailsTitle');
    if (titleElement) {
        const clientName = meeting.client_name || 'Nieznany klient';
        titleElement.textContent = `Spotkanie z ${clientName}`;
    }
    
    // Generuj HTML dla szczegółów
    const detailsHTML = `
        <!-- Transkrypcja -->
        <div class="meeting-detail-section">
            <h3>
                <i class="fas fa-microphone"></i>
                Transkrypcja rozmowy
            </h3>
            <div class="transcription-detail">
                ${meeting.transcription ? 
                    formatTranscriptionForDetails(meeting.transcription) : 
                    '<div class="empty-state-detail"><i class="fas fa-microphone-slash"></i><h4>Brak transkrypcji</h4><p>Transkrypcja nie jest dostępna dla tego spotkania</p></div>'
                }
            </div>
        </div>
        
        <!-- Sugestie AI -->
        <div class="meeting-detail-section">
            <h3>
                <i class="fas fa-robot"></i>
                Sugestie AI z sesji
            </h3>
            <div class="ai-suggestions-detail">
                ${formatAISuggestionsForDetails(meeting.chatgpt_history, meeting.ai_suggestions)}
            </div>
        </div>
        
        <!-- Podsumowanie - pełna szerokość -->
        <div class="meeting-detail-section summary-detail">
            <h3>
                <i class="fas fa-chart-line"></i>
                Podsumowanie spotkania
            </h3>
            <div class="summary-content-detail">
                ${meeting.final_summary ? 
                    formatSummaryForDetails(meeting.final_summary) : 
                    '<div class="empty-state-detail"><i class="fas fa-chart-bar"></i><h4>Brak podsumowania</h4><p>Podsumowanie nie jest dostępne dla tego spotkania</p></div>'
                }
            </div>
        </div>
    `;
    
    // Wstaw HTML do kontenera
    const contentContainer = document.getElementById('meetingDetailsContent');
    if (contentContainer) {
        contentContainer.innerHTML = detailsHTML;
    }
}

// Renderowanie szczegółów nagrania w sekcji
function renderRecordingDetailsInSection(recording) {
    console.log('Renderowanie szczegółów nagrania:', recording);
    
    // Zapisz nagranie do eksportu PDF
    currentMeetingForExport = recording;
    
    // Ustaw tytuł
    const titleElement = document.getElementById('meetingDetailsTitle');
    if (titleElement) {
        const clientName = recording.client_name || 'Nieznany klient';
        const duration = recording.duration ? `(${Math.floor(recording.duration / 60)}min ${recording.duration % 60}s)` : '';
        titleElement.textContent = `🎙️ Nagranie z ${clientName} ${duration}`;
    }
    
    // Generuj HTML dla szczegółów nagrania - prostszy layout skupiony na transkrypcji
    const detailsHTML = `
        <!-- Informacje o nagraniu -->
        <div class="recording-info-section">
            <div class="recording-meta">
                <div class="meta-item">
                    <i class="fas fa-user"></i>
                    <span><strong>Klient:</strong> ${escapeHtml(recording.client_name)}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-box"></i>
                    <span><strong>Produkt:</strong> ${escapeHtml(recording.product_name)}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-calendar"></i>
                    <span><strong>Data:</strong> ${new Date(recording.created_at).toLocaleDateString('pl-PL', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}</span>
                </div>
                ${recording.duration ? `
                <div class="meta-item">
                    <i class="fas fa-clock"></i>
                    <span><strong>Długość:</strong> ${Math.floor(recording.duration / 60)}min ${recording.duration % 60}s</span>
                </div>
                ` : ''}
                <div class="meta-item">
                    <i class="fas fa-info-circle"></i>
                    <span><strong>Status:</strong> ${getRecordingStatusText(recording.status)}</span>
                </div>
            </div>
        </div>
        
        <!-- Pełna transkrypcja nagrania -->
        <div class="recording-transcript-section">
            <h3>
                <i class="fas fa-file-alt"></i>
                Transkrypcja nagrania
            </h3>
            <div class="recording-transcript-full">
                ${recording.transcript ? 
                    formatRecordingTranscript(recording.transcript) : 
                    '<div class="empty-state-recording"><i class="fas fa-microphone-slash"></i><h4>Brak transkrypcji</h4><p>Transkrypcja nie jest dostępna dla tego nagrania</p></div>'
                }
            </div>
        </div>
        
        <!-- Notatki -->
        ${recording.notes ? `
        <div class="recording-notes-section">
            <h3>
                <i class="fas fa-sticky-note"></i>
                Notatki
            </h3>
            <div class="recording-notes-content">
                ${escapeHtml(recording.notes)}
            </div>
        </div>
        ` : ''}
    `;
    
    // Wstaw HTML do kontenera
    const contentContainer = document.getElementById('meetingDetailsContent');
    if (contentContainer) {
        contentContainer.innerHTML = detailsHTML;
        // Dodaj klasę dla stylowania nagrania
        contentContainer.className = 'meeting-details-content recording-details';
    }
}

// Powrót do listy spotkań
function backToMeetingsList() {
    console.log('Powrót do listy spotkań');
    
    // Ukryj widok szczegółów i pokaż widok listy
    document.getElementById('meetingDetailsView').style.display = 'none';
    document.getElementById('meetingsListView').style.display = 'block';
}

// Zamykanie modala szczegółów
function closeMeetingDetailsModal() {
    if (meetingDetailsModal) {
        meetingDetailsModal.classList.remove('active');
    }
    if (meetingDetails) {
        meetingDetails.innerHTML = '';
    }
    
    // Resetuj tytuł modala do stanu domyślnego
    const modalTitle = document.querySelector('#meetingDetailsModal .modal-header h3');
    if (modalTitle) {
        modalTitle.innerHTML = 'Szczegóły spotkania';
    }
}

// Zapisywanie notatek do spotkania
async function saveMeetingNotes(meetingId) {
    const notesTextarea = document.getElementById('meetingNotes');
    const notes = notesTextarea.value.trim();
    
    try {
        const response = await fetch(`/api/sales/${meetingId}/notes`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notes })
        });
        
        if (!response.ok) {
            throw new Error('Błąd zapisywania notatek');
        }
        
        // Aktualizuj lokalne dane
        const meeting = meetings.find(m => m.id === meetingId);
        if (meeting) {
            meeting.own_notes = notes;
        }
        
        showSuccess('Notatki zostały zapisane');
        
    } catch (error) {
        console.error('Błąd zapisywania notatek:', error);
        showError('Nie udało się zapisać notatek');
    }
}

// Wyświetlanie pustego stanu
function showEmptyState() {
    meetingsTableBody.innerHTML = `
        <tr>
            <td colspan="5">
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>Brak spotkań</h3>
                    <p>Nie znaleziono żadnych spotkań spełniających kryteria wyszukiwania.</p>
                </div>
            </td>
        </tr>
    `;
}

// Wyświetlanie stanu ładowania
function showLoading() {
    meetingsTableBody.innerHTML = `
        <tr>
            <td colspan="5">
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <h3>Ładowanie spotkań...</h3>
                    <p>Proszę czekać, pobieramy dane spotkań.</p>
                </div>
            </td>
        </tr>
    `;
}

// Funkcje pomocnicze
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getRecordingStatusText(status) {
    switch (status) {
        case 'active':
            return '🔴 Nagrywanie w toku';
        case 'completed':
            return '✅ Zakończone';
        case 'stopped':
            return '⏹️ Zatrzymane';
        default:
            return '❓ Nieznany';
    }
}

function formatRecordingTranscript(transcript) {
    if (!transcript || transcript.trim() === '') {
        return '<div class="empty-transcript">Brak transkrypcji</div>';
    }
    
    // Prosty format transkrypcji - każda linijka na nowej linii
    const lines = transcript.split('\n').filter(line => line.trim() !== '');
    
    const formattedLines = lines.map(line => {
        // Escape HTML dla bezpieczeństwa
        const escapedLine = escapeHtml(line.trim());
        
        // Jeśli linia nie jest pusta, zwróć ją w formacie akapitu
        if (escapedLine) {
            return `<p class="transcript-line">${escapedLine}</p>`;
        }
        return '';
    }).filter(line => line !== '');
    
    return formattedLines.join('');
}

function showSuccess(message) {
    // Implementacja toast notification - można rozszerzyć
    console.log('Success:', message);
    // Tutaj można dodać toast notification system
}

function showError(message) {
    // Implementacja toast notification - można rozszerzyć
    console.error('Error:', message);
    // Tutaj można dodać toast notification system
}

// Switch between tabs in meeting details
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected tab content
    const selectedTab = document.getElementById(tabName + '-tab');
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Add active class to clicked button
    event.target.classList.add('active');
}

// Format transcription with speaker roles
function formatTranscription(transcription) {
    if (!transcription) return '';
    
    console.log('DEBUG: formatTranscription input length:', transcription.length);
    console.log('DEBUG: formatTranscription first 200 chars:', transcription.substring(0, 200));
    
    // Split by lines and format each speaker line
    const lines = transcription.split('\n');
    console.log('DEBUG: formatTranscription lines count:', lines.length);
    
    return lines.map(line => {
        if (line.trim() === '') return '<br>';
        
        // Check if line contains speaker role markers
        if (line.includes('[🔵SPRZEDAWCA]') || line.includes('🔵SPRZEDAWCA')) {
            const text = line.replace(/\[🔵SPRZEDAWCA\]/g, '').replace(/🔵SPRZEDAWCA/g, '').trim();
            return `<div class="speaker-line salesperson">
                <span class="speaker-badge salesperson">🔵 SPRZEDAWCA</span>
                <span class="speaker-text">${escapeHtml(text)}</span>
            </div>`;
        } else if (line.includes('[🔴KLIENT]') || line.includes('🔴KLIENT')) {
            const text = line.replace(/\[🔴KLIENT\]/g, '').replace(/🔴KLIENT/g, '').trim();
            return `<div class="speaker-line client">
                <span class="speaker-badge client">🔴 KLIENT</span>
                <span class="speaker-text">${escapeHtml(text)}</span>
            </div>`;
        } else if (line.includes('🟡') || line.includes('[🟡')) {
            // Handle unknown speakers
            const speakerMatch = line.match(/\[?🟡([^\]]*)\]?/);
            const speakerName = speakerMatch ? speakerMatch[1].trim() : 'NIEZNANY';
            const text = line.replace(/\[?🟡[^\]]*\]?/g, '').trim();
            return `<div class="speaker-line unknown">
                <span class="speaker-badge unknown">🟡 ${escapeHtml(speakerName)}</span>
                <span class="speaker-text">${escapeHtml(text)}</span>
            </div>`;
        } else {
            // Regular line without speaker detection - check if it starts with [Speaker]
            const speakerMatch = line.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (speakerMatch) {
                const speaker = speakerMatch[1];
                const text = speakerMatch[2];
                return `<div class="speaker-line generic">
                    <span class="speaker-badge generic">👤 ${escapeHtml(speaker)}</span>
                    <span class="speaker-text">${escapeHtml(text)}</span>
                </div>`;
            } else {
                // Regular line without speaker detection
                return `<div class="text-line">${escapeHtml(line)}</div>`;
            }
        }
    }).join('');
}

// Format ChatGPT conversation history - show AI suggestions from ai_suggestions field as fallback
function formatChatGPTHistory(historyJSON, aiSuggestions) {
    console.log('DEBUG: formatChatGPTHistory called with:', { 
        historyJSON: historyJSON ? 'present' : 'null', 
        aiSuggestions: aiSuggestions ? 'present' : 'null' 
    });
    
    // Try to parse chatgpt_history first
    if (historyJSON) {
        try {
            let history;
            if (typeof historyJSON === 'string') {
                history = JSON.parse(historyJSON);
            } else {
                history = historyJSON;
            }
            
            if (Array.isArray(history) && history.length > 0) {
                // Filter only assistant responses (AI suggestions) and skip system prompts
                const aiResponses = history.filter(message => message.role === 'assistant');
                
                if (aiResponses.length > 0) {
                    console.log('DEBUG: Using chatgpt_history, found', aiResponses.length, 'AI responses');
                    return aiResponses.map((message, index) => {
                        const timestamp = `Odpowiedź AI #${index + 1}`;
                        
                        return `<div class="ai-response-block">
                            <div class="response-header">
                                <span class="response-badge">🤖 ${timestamp}</span>
                            </div>
                            <div class="response-content">
                                ${formatAIResponse(message.content)}
                            </div>
                        </div>`;
                    }).join('');
                }
            }
        } catch (error) {
            console.error('Error parsing ChatGPT history:', error);
        }
    }
    
    // Fallback: Use ai_suggestions field if chatgpt_history is empty or invalid
    if (aiSuggestions) {
        console.log('DEBUG: Falling back to ai_suggestions field');
        try {
            // ai_suggestions is usually a text field with suggestions separated by ---
            const blocks = aiSuggestions.split('\n---\n');
            
            if (blocks.length > 0 && blocks[0].trim() !== '') {
                return blocks.map((block, index) => {
                    const lines = block.split('\n');
                    const timestamp = lines[0]?.match(/\[(.*?)\]/)?.[1] || `Sugestia #${index + 1}`;
                    const content = lines.slice(1).join('\n').trim();
                    
                    if (content) {
                        return `<div class="ai-response-block">
                            <div class="response-header">
                                <span class="response-badge">🤖 ${escapeHtml(timestamp)}</span>
                            </div>
                            <div class="response-content">
                                <div class="ai-suggestion-content">
                                    ${escapeHtml(content).replace(/\n/g, '<br>')}
                                </div>
                            </div>
                        </div>`;
                    }
                    return '';
                }).filter(block => block !== '').join('');
            }
        } catch (error) {
            console.error('Error parsing ai_suggestions:', error);
        }
    }
    
    // If both fail, show empty state
    console.log('DEBUG: Both chatgpt_history and ai_suggestions are empty or invalid');
    return '<div class="empty-state-message"><i class="fas fa-robot"></i>Brak sugestii AI w tej sesji<br><small>Sugestie AI pojawiają się podczas sesji na żywo</small></div>';
}

// Format AI response (try to parse JSON or show as text)
function formatAIResponse(content) {
    try {
        const parsed = JSON.parse(content);
        
        // Format as structured data
        let formatted = '<div class="ai-response-structured">';
        
        Object.keys(parsed).forEach(key => {
            const value = parsed[key];
            formatted += `<div class="response-field">
                <strong>${escapeHtml(key)}:</strong> `;
            
            if (Array.isArray(value)) {
                formatted += `<ul>`;
                value.forEach(item => {
                    formatted += `<li>${escapeHtml(item)}</li>`;
                });
                formatted += `</ul>`;
            } else {
                formatted += `<span>${escapeHtml(value)}</span>`;
            }
            
            formatted += `</div>`;
        });
        
        formatted += '</div>';
        return formatted;
        
    } catch (error) {
        // Not JSON, show as regular text
        return escapeHtml(content).replace(/\n/g, '<br>');
    }
}

// Format final summary with markdown-like formatting
function formatSummary(summary) {
    if (!summary) return '';
    
    let formatted = escapeHtml(summary);
    
    // Convert markdown-like headers
    formatted = formatted.replace(/## (.*)/g, '<h3>$1</h3>');
    formatted = formatted.replace(/### (.*)/g, '<h4>$1</h4>');
    
    // Convert line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Convert lists
    formatted = formatted.replace(/- (.*?)(<br>|$)/g, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
    
    return `<div class="summary-formatted">${formatted}</div>`;
}

// Formatowanie transkrypcji dla widoku szczegółów - wyświetla całą transkrypcję jako ciągły tekst
function formatTranscriptionForDetails(transcription) {
    if (!transcription || transcription.trim() === '') {
        return '<div class="empty-state-detail"><i class="fas fa-microphone-slash"></i><h4>Brak transkrypcji</h4></div>';
    }
    
    console.log('DEBUG: formatTranscriptionForDetails input length:', transcription.length);
    
    // Wyświetl całą transkrypcję jako ciągły tekst z podstawowym formatowaniem
    let formattedText = escapeHtml(transcription);
    
    // Zamień nowe linie na <br> dla lepszego wyświetlania
    formattedText = formattedText.replace(/\n/g, '<br>');
    
    // Podświetl znaczniki ról jeśli istnieją
    formattedText = formattedText.replace(/\[🔵[^\]]*\]/g, '<span class="speaker-highlight salesperson">$&</span>');
    formattedText = formattedText.replace(/\[🔴[^\]]*\]/g, '<span class="speaker-highlight client">$&</span>');
    formattedText = formattedText.replace(/\[🟡[^\]]*\]/g, '<span class="speaker-highlight unknown">$&</span>');
    
    return `
        <div class="transcription-full-text">
            ${formattedText}
        </div>
    `;
}

// Formatowanie sugestii AI dla widoku szczegółów
function formatAISuggestionsForDetails(historyJSON, aiSuggestions) {
    console.log('DEBUG: formatAISuggestionsForDetails called');
    
    // Spróbuj najpierw chatgpt_history
    if (historyJSON) {
        try {
            let history;
            if (typeof historyJSON === 'string') {
                history = JSON.parse(historyJSON);
            } else {
                history = historyJSON;
            }
            
            if (Array.isArray(history) && history.length > 0) {
                const aiResponses = history.filter(message => message.role === 'assistant');
                
                if (aiResponses.length > 0) {
                    console.log('DEBUG: Using chatgpt_history, found', aiResponses.length, 'AI responses');
                    return aiResponses.map((message, index) => {
                        const timestamp = `Odpowiedź AI #${index + 1}`;
                        
                        return `
                            <div class="ai-response-block-detail">
                                <div class="response-badge-detail">
                                    🤖 ${escapeHtml(timestamp)}
                                </div>
                                <div class="response-content-detail">
                                    ${formatAIResponseForDetails(message.content)}
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch (error) {
            console.error('Error parsing ChatGPT history:', error);
        }
    }
    
    // Fallback: Użyj ai_suggestions
    if (aiSuggestions) {
        console.log('DEBUG: Falling back to ai_suggestions field');
        try {
            const blocks = aiSuggestions.split('\n---\n');
            
            if (blocks.length > 0 && blocks[0].trim() !== '') {
                return blocks.map((block, index) => {
                    const lines = block.split('\n');
                    const timestamp = lines[0]?.match(/\[(.*?)\]/)?.[1] || `Sugestia #${index + 1}`;
                    const content = lines.slice(1).join('\n').trim();
                    
                    if (content) {
                        return `
                            <div class="ai-response-block-detail">
                                <div class="response-badge-detail">
                                    🤖 ${escapeHtml(timestamp)}
                                </div>
                                <div class="response-content-detail">
                                    ${escapeHtml(content).replace(/\n/g, '<br>')}
                                </div>
                            </div>
                        `;
                    }
                    return '';
                }).filter(block => block !== '').join('');
            }
        } catch (error) {
            console.error('Error parsing ai_suggestions:', error);
        }
    }
    
    // Jeśli oba nie działają
    console.log('DEBUG: Both chatgpt_history and ai_suggestions are empty or invalid');
    return '<div class="empty-state-detail"><i class="fas fa-robot"></i><h4>Brak sugestii AI</h4><p>Sugestie AI nie są dostępne dla tego spotkania</p></div>';
}

// Formatowanie odpowiedzi AI dla widoku szczegółów
function formatAIResponseForDetails(content) {
    if (!content) return '';
    
    try {
        // Spróbuj sparsować jako JSON
        const parsed = JSON.parse(content);
        
        let formatted = '';
        
        if (parsed.czy_kompletna) {
            formatted += `<div><strong>Status:</strong> ${escapeHtml(parsed.czy_kompletna)}</div>`;
        }
        
        if (parsed.akcja) {
            formatted += `<div><strong>Akcja:</strong> ${escapeHtml(parsed.akcja)}</div>`;
        }
        
        if (parsed.sugestie && Array.isArray(parsed.sugestie)) {
            formatted += `<div><strong>Sugestie:</strong></div>`;
            formatted += '<ul>';
            parsed.sugestie.forEach(suggestion => {
                formatted += `<li>${escapeHtml(suggestion)}</li>`;
            });
            formatted += '</ul>';
        }
        
        if (parsed.uwagi) {
            formatted += `<div><strong>Uwagi:</strong> ${escapeHtml(parsed.uwagi)}</div>`;
        }
        
        return formatted || escapeHtml(content);
        
    } catch (error) {
        // Jeśli nie jest JSONem, wyświetl jako tekst
        return escapeHtml(content).replace(/\n/g, '<br>');
    }
}

// Formatowanie podsumowania dla widoku szczegółów
function formatSummaryForDetails(summary) {
    if (!summary) return '';
    
    // Podstawowe formatowanie tekstu
    let formatted = escapeHtml(summary);
    
    // Formatowanie list
    formatted = formatted.replace(/\*\s+(.+)/g, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Formatowanie nagłówków
    formatted = formatted.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    formatted = formatted.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    formatted = formatted.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    
    // Formatowanie pogrubienia
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Formatowanie nowych linii
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

// Globalna zmienna do przechowywania aktualnego spotkania dla eksportu PDF
let currentMeetingForExport = null;

// Funkcja eksportu spotkania do PDF
async function exportMeetingToPDF() {
    if (!currentMeetingForExport) {
        showError('Brak danych spotkania do eksportu');
        return;
    }
    
    try {
        console.log('Eksportowanie spotkania do PDF:', currentMeetingForExport.id);
        
        // Przygotuj dane do eksportu
        const meeting = currentMeetingForExport;
        const clientName = meeting.client_name || 'Nieznany klient';
        const productName = meeting.product_name || 'Nieznany produkt';
        const meetingDate = new Date(meeting.meeting_datetime).toLocaleString('pl-PL');
        
        // Przygotuj zawartość PDF
        const pdfContent = {
            meetingId: meeting.id,
            clientName: clientName,
            productName: productName,
            meetingDate: meetingDate,
            transcription: meeting.transcription || 'Brak transkrypcji',
            aiSuggestions: meeting.ai_suggestions || 'Brak sugestii AI',
            chatgptHistory: meeting.chatgpt_history || null,
            finalSummary: meeting.final_summary || 'Brak podsumowania',
            positiveFindings: meeting.positive_findings || '',
            negativeFindings: meeting.negative_findings || '',
            recommendations: meeting.recommendations || '',
            ownNotes: meeting.own_notes || ''
        };
        
        // Wyślij żądanie do backendu o wygenerowanie PDF
        const response = await fetch('/api/meetings/export-pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(pdfContent)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Pobierz odpowiedź jako blob
        const blob = await response.blob();
        
        console.log('Otrzymano plik typu:', blob.type);
        
        // Sprawdź typ pliku i ustaw odpowiednie rozszerzenie
        let fileName, successMessage;
        
        if (blob.type === 'application/pdf') {
            fileName = `spotkanie_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${meeting.id}.pdf`;
            successMessage = '📄 PDF został pobrany pomyślnie!';
        } else if (blob.type === 'text/html' || blob.type.includes('html')) {
            fileName = `spotkanie_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${meeting.id}.html`;
            successMessage = '📄 Raport HTML został pobrany! Otwórz plik i użyj Ctrl+P → "Zapisz jako PDF"';
        } else {
            console.error('Otrzymano nieprawidłowy typ pliku:', blob.type);
            throw new Error('Serwer zwrócił nieobsługiwany typ pliku: ' + blob.type);
        }
        
        // Utwórz link do pobrania
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        
        // Dodaj do DOM, kliknij i usuń
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showSuccess(successMessage);
        
    } catch (error) {
        console.error('Błąd eksportu do PDF:', error);
        showError('Nie udało się wyeksportować do PDF: ' + error.message);
    }
}

// Eksport funkcji dla dostępu globalnego
window.openMeetingDetails = openMeetingDetails;
window.saveMeetingNotes = saveMeetingNotes;
window.switchTab = switchTab;
window.exportMeetingToPDF = exportMeetingToPDF; 