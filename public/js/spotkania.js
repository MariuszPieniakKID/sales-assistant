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
    closeMeetingModal.addEventListener('click', closeMeetingDetailsModal);
    
    // Zamykanie modala przez kliknięcie w tło
    meetingDetailsModal.addEventListener('click', function(e) {
        if (e.target === meetingDetailsModal) {
            closeMeetingDetailsModal();
        }
    });
    
    // Zamykanie modala przez ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && meetingDetailsModal.classList.contains('active')) {
            closeMeetingDetailsModal();
        }
    });
}

// Ładowanie spotkań z API
async function loadMeetings() {
    try {
        console.log('🔄 Ładowanie spotkań z API...');
        showLoading();
        
        const response = await fetch('/api/sales');
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
        
        return `
            <tr onclick="openMeetingDetails(${meeting.id})" data-meeting-id="${meeting.id}">
                <td>
                    <div class="client-name">${escapeHtml(meeting.client_name)}</div>
                </td>
                <td>
                    <div class="product-name">${escapeHtml(meeting.product_name)}</div>
                </td>
                <td>
                    <div class="meeting-date">${formattedDate}</div>
                </td>
                <td>
                    <span class="status-badge ${status.class}">
                        <i class="fas ${status.icon}"></i>
                        ${status.text}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-view" onclick="event.stopPropagation(); openMeetingDetails(${meeting.id})" title="Zobacz szczegóły">
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

// Otwieranie szczegółów spotkania
async function openMeetingDetails(meetingId) {
    const meeting = meetings.find(m => m.id === meetingId);
    if (!meeting) {
        showError('Nie znaleziono spotkania');
        return;
    }
    
    const meetingDate = new Date(meeting.meeting_datetime);
    const formattedDate = meetingDate.toLocaleDateString('pl-PL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Aktualizuj tytuł modala
    const modalTitle = document.querySelector('#meetingDetailsModal .modal-header h3');
    if (modalTitle) {
        const status = getMeetingStatus(meeting);
        modalTitle.innerHTML = `
            <i class="fas fa-handshake"></i>
            Spotkanie: ${escapeHtml(meeting.client_name)} - ${escapeHtml(meeting.product_name)}
            <span style="font-size: 14px; font-weight: 400; color: #64748b; margin-left: 12px;">
                ${status.text}
            </span>
        `;
    }
    
    const detailsHTML = `
        <div class="meeting-details-container">
            <!-- Podstawowe informacje o spotkaniu -->
            <div class="meeting-basic-info">
                <div class="meeting-info">
                    <div class="info-card">
                        <h4>Klient</h4>
                        <p>${escapeHtml(meeting.client_name)}</p>
                    </div>
                    <div class="info-card">
                        <h4>Produkt</h4>
                        <p>${escapeHtml(meeting.product_name)}</p>
                    </div>
                    <div class="info-card">
                        <h4>Data spotkania</h4>
                        <p>${formattedDate}</p>
                    </div>
                    <div class="info-card">
                        <h4>Status</h4>
                        <p>${getMeetingStatus(meeting).text}</p>
                    </div>
                </div>
            </div>
            
            <!-- Główna zawartość -->
            <div class="meeting-main-content">
                <!-- Lewy panel - Transkrypcja -->
                <div class="meeting-left-panel">
                    <div class="transcription-panel">
                        <h4>
                            <i class="fas fa-microphone"></i>
                            Transkrypcja rozmowy
                        </h4>
                        <div class="transcription-content">
                            ${meeting.transcription ? 
                                escapeHtml(meeting.transcription).replace(/\n/g, '<br>') : 
                                '<div class="empty-state-message"><i class="fas fa-microphone-slash"></i>Brak transkrypcji dla tego spotkania</div>'
                            }
                        </div>
                    </div>
                </div>
                
                <!-- Prawy panel - Sugestie AI (główne) -->
                <div class="meeting-right-panel">
                    <div class="ai-suggestions-panel">
                        <h4>
                            <i class="fas fa-robot"></i>
                            Sugestie AI
                        </h4>
                        <div class="ai-suggestions-content">
                            ${meeting.ai_suggestions ? 
                                escapeHtml(meeting.ai_suggestions).replace(/\n/g, '<br>').replace(/---/g, '<hr style="margin: 16px 0; border: 1px solid #e2e8f0;">') : 
                                '<div class="empty-state-message"><i class="fas fa-brain"></i>Brak sugestii AI dla tego spotkania<br><small>Sugestie AI pojawiają się podczas sesji na żywo</small></div>'
                            }
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Dodatkowe informacje - kompaktowe -->
            <div class="additional-info-panel">
                ${(meeting.positive_findings || meeting.negative_findings) ? `
                    <div class="findings-compact">
                        ${meeting.positive_findings ? `
                            <div class="findings-card-compact positive">
                                <h5>
                                    <i class="fas fa-thumbs-up"></i>
                                    Pozytywne sygnały
                                </h5>
                                <p>${escapeHtml(meeting.positive_findings).replace(/\n/g, '<br>')}</p>
                            </div>
                        ` : ''}
                        
                        ${meeting.negative_findings ? `
                            <div class="findings-card-compact negative">
                                <h5>
                                    <i class="fas fa-thumbs-down"></i>
                                    Zastrzeżenia i obiekcje
                                </h5>
                                <p>${escapeHtml(meeting.negative_findings).replace(/\n/g, '<br>')}</p>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                
                ${meeting.recommendations ? `
                    <div class="recommendations-compact">
                        <h5>
                            <i class="fas fa-lightbulb"></i>
                            Rekomendacje AI
                        </h5>
                        <p>${escapeHtml(meeting.recommendations).replace(/\n/g, '<br>')}</p>
                    </div>
                ` : ''}
                
                <div class="notes-section-compact">
                    <h5>
                        <i class="fas fa-sticky-note"></i>
                        Twoje notatki
                    </h5>
                    <textarea id="meetingNotes" placeholder="Dodaj swoje notatki do tego spotkania...">${meeting.own_notes || ''}</textarea>
                    <div class="notes-actions-compact">
                        <button class="btn-compact btn-primary-compact" onclick="saveMeetingNotes(${meeting.id})">
                            <i class="fas fa-save"></i>
                            Zapisz
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    meetingDetails.innerHTML = detailsHTML;
    meetingDetailsModal.classList.add('active');
}

// Zamykanie modala szczegółów
function closeMeetingDetailsModal() {
    meetingDetailsModal.classList.remove('active');
    meetingDetails.innerHTML = '';
    
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

// Eksport funkcji dla dostępu globalnego
window.openMeetingDetails = openMeetingDetails;
window.saveMeetingNotes = saveMeetingNotes; 