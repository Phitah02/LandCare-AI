// Login Page JavaScript
class LoginPage {
    constructor() {
        this.loginForm = document.getElementById('login-form');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.togglePasswordBtn = document.getElementById('toggle-password');
        this.errorMessage = document.getElementById('error-message');
        this.successMessage = document.getElementById('success-message');
        this.isLoading = false;

        this.initEventListeners();
        this.checkIfAlreadyLoggedIn();
    }

    initEventListeners() {
        // Form submission
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));

        // Toggle password visibility
        this.togglePasswordBtn.addEventListener('click', (e) => this.togglePasswordVisibility(e));

        // Clear messages on input
        this.emailInput.addEventListener('focus', () => this.clearMessages());
        this.passwordInput.addEventListener('focus', () => this.clearMessages());
    }

    togglePasswordVisibility(e) {
        e.preventDefault();
        const icon = this.togglePasswordBtn.querySelector('i');
        
        if (this.passwordInput.type === 'password') {
            this.passwordInput.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            this.passwordInput.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    clearMessages() {
        this.errorMessage.style.display = 'none';
        this.successMessage.style.display = 'none';
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
        this.successMessage.style.display = 'none';
        window.scrollTo(0, 0);
    }

    showSuccess(message) {
        this.successMessage.textContent = message;
        this.successMessage.style.display = 'block';
        this.errorMessage.style.display = 'none';
    }

    async handleLogin(e) {
        e.preventDefault();

        if (this.isLoading) return;

        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;

        // Validation
        if (!email || !password) {
            this.showError('Please enter both email and password');
            return;
        }

        if (!this.isValidEmail(email)) {
            this.showError('Please enter a valid email address');
            return;
        }

        if (password.length < 6) {
            this.showError('Password must be at least 6 characters');
            return;
        }

        this.isLoading = true;
        const submitBtn = this.loginForm.querySelector('.btn-sign-in');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Signing In...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('http://localhost:5000/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Store the token
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('userEmail', email);

                this.showSuccess('Login successful! Redirecting...');
                
                // Redirect to dashboard after 1.5 seconds
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                this.showError(data.error || data.message || 'Login failed. Please check your credentials.');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Connection error. Please try again later.');
        } finally {
            this.isLoading = false;
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    checkIfAlreadyLoggedIn() {
        const authToken = localStorage.getItem('authToken');
        if (authToken) {
            // User is already logged in, redirect to dashboard
            window.location.href = 'index.html';
        }
    }
}

// Initialize login page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Login page initialized');
    new LoginPage();
});
