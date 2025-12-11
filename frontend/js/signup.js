// Signup Page JavaScript
class SignupPage {
    constructor() {
        this.signupForm = document.getElementById('signup-form');
        this.nameInput = document.getElementById('name');
        this.emailInput = document.getElementById('email');
        this.passwordInput = document.getElementById('password');
        this.confirmPasswordInput = document.getElementById('confirm-password');
        this.togglePasswordBtn = document.getElementById('toggle-password');
        this.toggleConfirmPasswordBtn = document.getElementById('toggle-confirm-password');
        this.errorMessage = document.getElementById('error-message');
        this.successMessage = document.getElementById('success-message');
        this.isLoading = false;

        this.initEventListeners();
        this.checkIfAlreadyLoggedIn();
    }

    initEventListeners() {
        // Form submission
        this.signupForm.addEventListener('submit', (e) => this.handleSignup(e));

        // Toggle password visibility
        this.togglePasswordBtn.addEventListener('click', (e) => this.togglePasswordVisibility(e, this.passwordInput, this.togglePasswordBtn));
        this.toggleConfirmPasswordBtn.addEventListener('click', (e) => this.togglePasswordVisibility(e, this.confirmPasswordInput, this.toggleConfirmPasswordBtn));

        // Clear messages on input
        [this.nameInput, this.emailInput, this.passwordInput, this.confirmPasswordInput].forEach(input => {
            input.addEventListener('focus', () => this.clearMessages());
        });

        // Real-time password match checking
        this.passwordInput.addEventListener('input', () => this.validatePasswordMatch());
        this.confirmPasswordInput.addEventListener('input', () => this.validatePasswordMatch());
    }

    validatePasswordMatch() {
        const password = this.passwordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;

        // Only show mismatch if confirm password field has been filled
        if (confirmPassword.length > 0 && password !== confirmPassword) {
            console.warn('Passwords do not match:', { password, confirmPassword });
        } else if (password === confirmPassword && confirmPassword.length > 0) {
            console.log('Passwords match!');
        }
    }

    togglePasswordVisibility(e, inputElement, buttonElement) {
        e.preventDefault();
        const icon = buttonElement.querySelector('i');
        
        if (inputElement.type === 'password') {
            inputElement.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            inputElement.type = 'password';
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

    async handleSignup(e) {
        e.preventDefault();

        if (this.isLoading) return;

        const name = this.nameInput.value.trim();
        const email = this.emailInput.value.trim();
        const password = this.passwordInput.value;
        const confirmPassword = this.confirmPasswordInput.value;

        // Debug logging
        console.log('Form submission data:', {
            name,
            email,
            password: '[hidden]',
            confirmPassword: '[hidden]',
            passwordLength: password.length,
            confirmPasswordLength: confirmPassword.length,
            passwordMatches: password === confirmPassword
        });

        // Validation
        if (!name || !email || !password || !confirmPassword) {
            this.showError('Please fill in all fields');
            return;
        }

        if (name.length < 2) {
            this.showError('Name must be at least 2 characters');
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

        if (password !== confirmPassword) {
            console.error('Password mismatch detected:', {
                password: password,
                confirmPassword: confirmPassword,
                passwordChars: password.split(''),
                confirmChars: confirmPassword.split('')
            });
            this.showError('Passwords do not match');
            return;
        }

        this.isLoading = true;
        const submitBtn = this.signupForm.querySelector('.btn-sign-in');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Creating Account...';
        submitBtn.disabled = true;

        try {
            const payload = {
                email: email,
                password: password
            };

            console.log('Sending signup request with payload:', payload);

            const response = await fetch('https://landcare-ai-1.onrender.com/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);

            let data;
            try {
                data = await response.json();
                console.log('Response data:', data);
            } catch (parseError) {
                console.error('Failed to parse response as JSON:', parseError);
                console.error('Response text:', await response.text());
                this.showError('Server error: Invalid response format');
                return;
            }

            if (response.ok) {
                // Store the token
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('userEmail', email);

                this.showSuccess('Account created successfully! Redirecting...');
                
                // Redirect to dashboard after 1.5 seconds
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                console.error('Signup failed with status', response.status, ':', data);
                this.showError(data.error || data.detail || data.message || `Signup failed (${response.status}). Please try again.`);
            }
        } catch (error) {
            console.error('Signup error:', error);
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

// Initialize signup page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Signup page initialized');
    new SignupPage();
});
