document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const loginBtn = document.getElementById('loginBtn');
    const btnText = loginBtn.querySelector('.btn-text');
    const spinner = loginBtn.querySelector('.spinner');
    const errorMessage = document.getElementById('errorMessage');

    // Sprawdź czy są zapisane poświadczenia
    loadSavedCredentials();

    // Toggle password visibility
    togglePasswordBtn.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        const icon = this.querySelector('i');
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    });

    // Handle form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const rememberMe = rememberMeCheckbox.checked;

        console.log('🔑 Frontend: Próba logowania dla:', email);

        if (!email || !password) {
            showError('Proszę wypełnić wszystkie pola');
            return;
        }

        setLoading(true);
        hideError();

        try {
            console.log('📡 Wysyłanie żądania logowania...');
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            console.log('📨 Odpowiedź serwera - status:', response.status);
            const data = await response.json();
            console.log('📋 Dane odpowiedzi:', data);

            if (data.success) {
                console.log('✅ Logowanie udane, przekierowanie...');
                // Zapisz poświadczenia jeśli użytkownik zaznaczył "Zapamiętaj mnie"
                if (rememberMe) {
                    localStorage.setItem('rememberedEmail', email);
                    localStorage.setItem('rememberMe', 'true');
                } else {
                    localStorage.removeItem('rememberedEmail');
                    localStorage.removeItem('rememberMe');
                }

                // Przekieruj do dashboard
                window.location.href = '/dashboard';
            } else {
                console.log('❌ Błąd logowania:', data.message);
                showError(data.message || 'Błąd logowania');
            }
        } catch (error) {
            console.error('💥 Błąd połączenia:', error);
            showError('Błąd połączenia z serwerem: ' + error.message);
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        loginBtn.disabled = isLoading;
        if (isLoading) {
            btnText.style.display = 'none';
            spinner.style.display = 'block';
        } else {
            btnText.style.display = 'block';
            spinner.style.display = 'none';
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }

    function loadSavedCredentials() {
        const rememberedEmail = localStorage.getItem('rememberedEmail');
        const rememberMe = localStorage.getItem('rememberMe') === 'true';

        if (rememberedEmail && rememberMe) {
            emailInput.value = rememberedEmail;
            rememberMeCheckbox.checked = true;
            passwordInput.focus();
        } else {
            emailInput.focus();
        }
    }

    // Dodaj efekt focus dla inputów
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            hideError();
        });
    });

    // Obsługa klawisza Enter
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !loginBtn.disabled) {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });
}); 