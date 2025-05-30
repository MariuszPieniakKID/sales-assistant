// profil.js - Zarządzanie profilem użytkownika

let currentUser = null;

// Elementy DOM
const personalDataForm = document.getElementById('personalDataForm');
const passwordForm = document.getElementById('passwordForm');
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');

// Inicjalizacja
document.addEventListener('DOMContentLoaded', function() {
    loadUserProfile();
    setupEventListeners();
    loadUserStats();
});

// Konfiguracja event listenerów
function setupEventListeners() {
    // Formularz danych osobowych
    personalDataForm.addEventListener('submit', handlePersonalDataSubmit);
    
    // Formularz zmiany hasła
    passwordForm.addEventListener('submit', handlePasswordSubmit);
    
    // Walidacja potwierdzenia hasła
    document.getElementById('confirmPassword').addEventListener('input', validatePasswordConfirmation);
}

// Ładowanie profilu użytkownika
async function loadUserProfile() {
    try {
        const response = await fetch('/api/profile');
        
        if (!response.ok) {
            throw new Error('Błąd pobierania profilu');
        }
        
        currentUser = await response.json();
        populateProfileForm(currentUser);
        
    } catch (error) {
        console.error('Błąd ładowania profilu:', error);
        showToast('Błąd ładowania profilu', 'error');
    }
}

// Wypełnienie formularza danymi użytkownika
function populateProfileForm(user) {
    firstNameInput.value = user.first_name || '';
    lastNameInput.value = user.last_name || '';
    emailInput.value = user.email || '';
    phoneInput.value = user.phone || '';
}

// Obsługa formularza danych osobowych
async function handlePersonalDataSubmit(e) {
    e.preventDefault();
    
    const saveBtn = document.getElementById('savePersonalDataBtn');
    const btnText = saveBtn.querySelector('.btn-text');
    const spinner = saveBtn.querySelector('.spinner');
    
    // Pokaż loading
    setButtonLoading(saveBtn, true);
    
    try {
        const formData = {
            firstName: firstNameInput.value.trim(),
            lastName: lastNameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: phoneInput.value.trim()
        };
        
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Profil został zaktualizowany', 'success');
            currentUser = { ...currentUser, ...formData };
            // Aktualizuj nazwę w headerze
            updateHeaderUserName();
        } else {
            throw new Error(result.message || 'Błąd aktualizacji profilu');
        }
        
    } catch (error) {
        console.error('Błąd aktualizacji profilu:', error);
        showToast(error.message || 'Błąd aktualizacji profilu', 'error');
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

// Obsługa formularza zmiany hasła
async function handlePasswordSubmit(e) {
    e.preventDefault();
    
    const changeBtn = document.getElementById('changePasswordBtn');
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    // Walidacja
    if (newPassword !== confirmPassword) {
        showToast('Nowe hasła nie są identyczne', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('Nowe hasło musi mieć minimum 6 znaków', 'error');
        return;
    }
    
    // Pokaż loading
    setButtonLoading(changeBtn, true);
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Hasło zostało zmienione', 'success');
            passwordForm.reset();
        } else {
            throw new Error(result.message || 'Błąd zmiany hasła');
        }
        
    } catch (error) {
        console.error('Błąd zmiany hasła:', error);
        showToast(error.message || 'Błąd zmiany hasła', 'error');
    } finally {
        setButtonLoading(changeBtn, false);
    }
}

// Ładowanie statystyk użytkownika
async function loadUserStats() {
    try {
        const response = await fetch('/api/user-stats');
        
        if (!response.ok) {
            throw new Error('Błąd pobierania statystyk');
        }
        
        const stats = await response.json();
        updateStatsDisplay(stats);
        
    } catch (error) {
        console.error('Błąd ładowania statystyk:', error);
    }
}

// Aktualizacja wyświetlania statystyk
function updateStatsDisplay(stats) {
    document.getElementById('userProductsCount').textContent = stats.productsCount || 0;
    document.getElementById('userMeetingsCount').textContent = stats.meetingsCount || 0;
    document.getElementById('accountAge').textContent = stats.accountAge || 0;
}

// Walidacja potwierdzenia hasła
function validatePasswordConfirmation() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const confirmInput = document.getElementById('confirmPassword');
    
    if (confirmPassword && newPassword !== confirmPassword) {
        confirmInput.style.borderColor = '#ef4444';
        confirmInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';
    } else {
        confirmInput.style.borderColor = '#e5e7eb';
        confirmInput.style.boxShadow = 'none';
    }
}

// Przełączanie widoczności hasła
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.parentElement.querySelector('.toggle-password');
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// Ustawienie stanu loading przycisku
function setButtonLoading(button, loading) {
    const btnText = button.querySelector('.btn-text');
    const spinner = button.querySelector('.spinner');
    
    if (loading) {
        btnText.style.display = 'none';
        spinner.style.display = 'inline-flex';
        button.disabled = true;
    } else {
        btnText.style.display = 'inline';
        spinner.style.display = 'none';
        button.disabled = false;
    }
}

// Aktualizacja nazwy użytkownika w headerze
function updateHeaderUserName() {
    const userNameElement = document.querySelector('.user-name');
    if (userNameElement && currentUser) {
        userNameElement.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
    }
}

// Funkcja toast (jeśli nie istnieje globalnie)
function showToast(message, type = 'info') {
    // Sprawdź czy funkcja toast istnieje globalnie
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }
    
    // Fallback - prosty alert
    if (type === 'error') {
        alert('Błąd: ' + message);
    } else {
        alert(message);
    }
} 