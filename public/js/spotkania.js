// spotkania.js - Zarządzanie spotkaniami

let meetings = [];
let filteredMeetings = [];

// Elementy DOM
const meetingsTableBody = document.getElementById('meetingsTableBody');
const searchInput = document.getElementById('searchMeetings');
const meetingDetailsModal = document.getElementById('meetingDetailsModal');
const closeMeetingModal = document.getElementById('closeMeetingModal');
const meetingDetails = document.getElementById('meetingDetails');

// Inicjalizacja
document.addEventListener('DOMContentLoaded', function() {
    loadMeetings();
    setupEventListeners();
});

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
        showLoading();
        
        const response = await fetch('/api/sales');
        if (!response.ok) {
            throw new Error('Błąd pobierania spotkań');
        }
        
        meetings = await response.json();
        filteredMeetings = [...meetings];
        renderMeetingsTable();
        
    } catch (error) {
        console.error('Błąd ładowania spotkań:', error);
        showError('Nie udało się załadować spotkań');
    }
}

// Wyświetlanie tabeli spotkań
function renderMeetingsTable() {
    if (filteredMeetings.length === 0) {
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
    
    const detailsHTML = `
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
        </div>
        
        ${meeting.transcription ? `
            <div class="transcription-section">
                <h4>
                    <i class="fas fa-microphone"></i>
                    Transkrypcja spotkania
                </h4>
                <div class="transcription-content">
                    ${escapeHtml(meeting.transcription).replace(/\n/g, '<br>')}
                </div>
            </div>
        ` : ''}
        
        ${(meeting.positive_findings || meeting.negative_findings) ? `
            <div class="findings-section">
                ${meeting.positive_findings ? `
                    <div class="findings-card positive">
                        <h4>
                            <i class="fas fa-thumbs-up"></i>
                            Pozytywne sygnały
                        </h4>
                        <p>${escapeHtml(meeting.positive_findings).replace(/\n/g, '<br>')}</p>
                    </div>
                ` : ''}
                
                ${meeting.negative_findings ? `
                    <div class="findings-card negative">
                        <h4>
                            <i class="fas fa-thumbs-down"></i>
                            Zastrzeżenia i obiekcje
                        </h4>
                        <p>${escapeHtml(meeting.negative_findings).replace(/\n/g, '<br>')}</p>
                    </div>
                ` : ''}
            </div>
        ` : ''}
        
        ${meeting.recommendations ? `
            <div class="recommendations-section">
                <h4>
                    <i class="fas fa-lightbulb"></i>
                    Rekomendacje AI
                </h4>
                <p>${escapeHtml(meeting.recommendations).replace(/\n/g, '<br>')}</p>
            </div>
        ` : ''}
        
        ${meeting.ai_suggestions ? `
            <div class="ai-suggestions-section">
                <h4>
                    <i class="fas fa-robot"></i>
                    Szczegółowe sugestie AI z sesji
                </h4>
                <div class="ai-suggestions-content">
                    ${escapeHtml(meeting.ai_suggestions).replace(/\n/g, '<br>').replace(/---/g, '<hr style="margin: 16px 0; border: 1px solid #e2e8f0;">')}
                </div>
            </div>
        ` : ''}
        
        <div class="notes-section">
            <h4>
                <i class="fas fa-sticky-note"></i>
                Twoje notatki
            </h4>
            <textarea id="meetingNotes" placeholder="Dodaj swoje notatki do tego spotkania...">${meeting.own_notes || ''}</textarea>
            <div class="notes-actions">
                <button class="btn btn-primary" onclick="saveMeetingNotes(${meeting.id})">
                    <i class="fas fa-save"></i>
                    Zapisz notatki
                </button>
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