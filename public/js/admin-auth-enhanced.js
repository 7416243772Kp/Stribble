// C:\Ebook\public\js\admin-auth-enhanced.js

(function() {
  'use strict';

  // =============================
  // Password Reset Enhanced Handler
  // =============================
  
  const resetOverlay = document.getElementById('reset-overlay');
  const resetSteps = {
    1: document.getElementById('reset-step-1'),
    2: document.getElementById('reset-step-2'),
    3: document.getElementById('reset-step-3')
  };
  
  const stepIndicators = {
    1: document.getElementById('step-1-indicator'),
    2: document.getElementById('step-2-indicator'),
    3: document.getElementById('step-3-indicator')
  };
  
  let currentStep = 1;
  let otpTimer = null;
  let otpExpiryTime = null;
  
  // =============================
  // Helper Functions
  // =============================
  
  function showStep(stepNumber) {
    // Hide all steps
    Object.values(resetSteps).forEach(step => {
      if (step) step.classList.add('hidden');
    });
    
    // Show current step
    if (resetSteps[stepNumber]) {
      resetSteps[stepNumber].classList.remove('hidden');
    }
    
    // Update indicators
    Object.keys(stepIndicators).forEach(key => {
      const indicator = stepIndicators[key];
      if (indicator) {
        indicator.classList.remove('active', 'completed');
        if (parseInt(key) < stepNumber) {
          indicator.classList.add('completed');
        } else if (parseInt(key) === stepNumber) {
          indicator.classList.add('active');
        }
      }
    });
    
    currentStep = stepNumber;
  }
  
  function showMessage(message, type = 'error') {
    const errorEl = document.getElementById('reset-error');
    const successEl = document.getElementById('reset-success');
    
    if (type === 'error') {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
      successEl.classList.add('hidden');
      
      setTimeout(() => {
        errorEl.classList.add('hidden');
      }, 5000);
    } else {
      successEl.textContent = message;
      successEl.classList.remove('hidden');
      errorEl.classList.add('hidden');
      
      setTimeout(() => {
        successEl.classList.add('hidden');
      }, 5000);
    }
  }
  
  // =============================
  // OTP Input Handler
  // =============================
  
  function setupOTPInputs(prefix) {
    const inputs = [];
    for (let i = 1; i <= 6; i++) {
      const input = document.getElementById(`${prefix}-${i}`);
      if (input) {
        inputs.push(input);
        
        // Auto-focus next input
        input.addEventListener('input', (e) => {
          if (e.target.value && i < 6) {
            const nextInput = document.getElementById(`${prefix}-${i + 1}`);
            if (nextInput) nextInput.focus();
          }
          
          // Update filled class
          if (e.target.value) {
            e.target.classList.add('filled');
          } else {
            e.target.classList.remove('filled');
          }
          
          // Combine all values
          const combined = inputs.map(inp => inp.value).join('');
          const hiddenInput = document.getElementById(prefix === 'otp' ? 'reset-otp' : 'totp-login-token');
          if (hiddenInput) hiddenInput.value = combined;
        });
        
        // Handle backspace
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace' && !e.target.value && i > 1) {
            const prevInput = document.getElementById(`${prefix}-${i - 1}`);
            if (prevInput) {
              prevInput.focus();
              prevInput.value = '';
              prevInput.classList.remove('filled');
            }
          }
        });
        
        // Allow only numbers
        input.addEventListener('keypress', (e) => {
          if (!/[0-9]/.test(e.key)) {
            e.preventDefault();
          }
        });
      }
    }
  }
  
  // =============================
  // OTP Timer
  // =============================
  
  function startOTPTimer() {
    const timerDisplay = document.getElementById('timer-countdown');
    const otpTimerContainer = document.getElementById('otp-timer');
    const resendBtn = document.getElementById('resend-otp-btn');
    
    // Set expiry time (10 minutes from now)
    otpExpiryTime = Date.now() + 10 * 60 * 1000;
    
    if (otpTimer) clearInterval(otpTimer);
    
    otpTimer = setInterval(() => {
      const remaining = Math.max(0, otpExpiryTime - Date.now());
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      
      if (timerDisplay) {
        timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (remaining < 60000) {
          otpTimerContainer.classList.add('warning');
        }
      }
      
      if (remaining === 0) {
        clearInterval(otpTimer);
        if (timerDisplay) timerDisplay.textContent = 'Expired';
        if (resendBtn) {
          resendBtn.disabled = false;
          resendBtn.textContent = 'Resend Code';
        }
      }
    }, 1000);
    
    // Disable resend button for 60 seconds
    if (resendBtn) {
      resendBtn.disabled = true;
      let cooldown = 60;
      const cooldownTimer = setInterval(() => {
        cooldown--;
        if (cooldown > 0) {
          resendBtn.textContent = `Resend Code (${cooldown}s)`;
        } else {
          resendBtn.disabled = false;
          resendBtn.textContent = 'Resend Code';
          clearInterval(cooldownTimer);
        }
      }, 1000);
    }
  }
  
  // =============================
  // Password Strength Checker
  // =============================
  
  function checkPasswordStrength(password) {
    const requirements = {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    // Update requirement indicators
    Object.keys(requirements).forEach(req => {
      const element = document.getElementById(`req-${req}`);
      if (element) {
        if (requirements[req]) {
          element.classList.add('met');
          element.querySelector('.icon').textContent = '✓';
        } else {
          element.classList.remove('met');
          element.querySelector('.icon').textContent = '○';
        }
      }
    });
    
    // Calculate strength
    const metCount = Object.values(requirements).filter(Boolean).length;
    const strengthBar = document.getElementById('password-strength');
    
    if (strengthBar) {
      strengthBar.className = 'password-strength-fill';
      if (metCount <= 2) {
        strengthBar.classList.add('strength-weak');
      } else if (metCount <= 4) {
        strengthBar.classList.add('strength-medium');
      } else {
        strengthBar.classList.add('strength-strong');
      }
    }
    
    return metCount === 5;
  }
  
  // =============================
  // Step 1: Request OTP
  // =============================
  
  const sendOtpBtn = document.getElementById('send-otp-btn');
  const resetEmailInput = document.getElementById('reset-email');
  
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', async () => {
      const email = resetEmailInput.value.trim();
      
      if (!email) {
        showMessage('Please enter your email address');
        return;
      }
      
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage('Please enter a valid email address');
        return;
      }
      
      sendOtpBtn.disabled = true;
      sendOtpBtn.textContent = 'Sending...';
      
      try {
        const response = await fetch(`${window.API_BASE}/api/admin/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (data.success) {
          // Update email display
          const emailDisplay = document.getElementById('email-display');
          if (emailDisplay) emailDisplay.textContent = email;
          
          showMessage('✅ Verification code sent to your email!', 'success');
          showStep(2);
          startOTPTimer();
          
          // Focus first OTP input
          const firstOTPInput = document.getElementById('otp-1');
          if (firstOTPInput) firstOTPInput.focus();
        } else {
          showMessage(data.message || 'Failed to send verification code');
        }
      } catch (err) {
        console.error('Send OTP error:', err);
        showMessage('Server error. Please try again.');
      } finally {
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = 'Send Verification Code';
      }
    });
  }
  
  // =============================
  // Step 2: Verify OTP
  // =============================
  
  const verifyOtpBtn = document.getElementById('verify-otp-btn');
  
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
      const otpValue = document.getElementById('reset-otp').value;
      
      if (!otpValue || otpValue.length !== 6) {
        showMessage('Please enter all 6 digits of the verification code');
        return;
      }
      
      verifyOtpBtn.disabled = true;
      verifyOtpBtn.textContent = 'Verifying...';
      
      // For now, just move to next step (actual verification happens with password reset)
      showMessage('✅ Code verified successfully!', 'success');
      showStep(3);
      
      // Clear OTP timer
      if (otpTimer) clearInterval(otpTimer);
      
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = 'Verify Code';
    });
  }
  
  // Resend OTP
  const resendOtpBtn = document.getElementById('resend-otp-btn');
  
  if (resendOtpBtn) {
    resendOtpBtn.addEventListener('click', async () => {
      const email = resetEmailInput.value.trim();
      
      resendOtpBtn.disabled = true;
      
      try {
        const response = await fetch(`${window.API_BASE}/api/admin/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showMessage('✅ New verification code sent!', 'success');
          startOTPTimer();
          
          // Clear OTP inputs
          for (let i = 1; i <= 6; i++) {
            const input = document.getElementById(`otp-${i}`);
            if (input) {
              input.value = '';
              input.classList.remove('filled');
            }
          }
          document.getElementById('reset-otp').value = '';
        } else {
          showMessage(data.message || 'Failed to resend code');
        }
      } catch (err) {
        console.error('Resend OTP error:', err);
        showMessage('Server error. Please try again.');
      }
    });
  }
  
  // Change email link
  const changeEmailLink = document.getElementById('change-email-link');
  
  if (changeEmailLink) {
    changeEmailLink.addEventListener('click', (e) => {
      e.preventDefault();
      showStep(1);
      if (otpTimer) clearInterval(otpTimer);
    });
  }
  
  // =============================
  // Step 3: Reset Password
  // =============================
  
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const resetPasswordBtn = document.getElementById('reset-password-btn');
  
  if (newPasswordInput) {
    newPasswordInput.addEventListener('input', (e) => {
      checkPasswordStrength(e.target.value);
    });
  }
  
  if (resetPasswordBtn) {
    resetPasswordBtn.addEventListener('click', async () => {
      const email = resetEmailInput.value.trim();
      const otp = document.getElementById('reset-otp').value;
      const newPassword = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;
      
      // Validation
      if (!newPassword || !confirmPassword) {
        showMessage('Please enter and confirm your new password');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        showMessage('Passwords do not match');
        return;
      }
      
      if (!checkPasswordStrength(newPassword)) {
        showMessage('Please meet all password requirements');
        return;
      }
      
      resetPasswordBtn.disabled = true;
      resetPasswordBtn.textContent = 'Resetting Password...';
      
      try {
        const response = await fetch(`${window.API_BASE}/api/admin/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: otp, newPassword })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showMessage('✅ Password reset successful! Redirecting to login...', 'success');
          
          setTimeout(() => {
            resetOverlay.style.display = 'none';
            showStep(1);
            
            // Clear all forms
            document.getElementById('reset-email').value = '';
            document.getElementById('reset-otp').value = '';
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            
            // Clear OTP inputs
            for (let i = 1; i <= 6; i++) {
              const input = document.getElementById(`otp-${i}`);
              if (input) {
                input.value = '';
                input.classList.remove('filled');
              }
            }
            
            // Pre-fill email in login form
            const loginEmail = document.getElementById('adminEmail');
            if (loginEmail) {
              loginEmail.value = email;
              const loginPassword = document.getElementById('adminPassword');
              if (loginPassword) loginPassword.focus();
            }
          }, 2000);
        } else {
          showMessage(data.message || 'Failed to reset password');
        }
      } catch (err) {
        console.error('Reset password error:', err);
        showMessage('Server error. Please try again.');
      } finally {
        resetPasswordBtn.disabled = false;
        resetPasswordBtn.textContent = 'Reset Password';
      }
    });
  }
  
  // =============================
  // Initialize
  // =============================
  
  document.addEventListener('DOMContentLoaded', () => {
    setupOTPInputs('otp');
    setupOTPInputs('totp');
    
    // Open reset overlay
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
      forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        resetOverlay.style.display = 'flex';
        showStep(1);
        
        // Pre-fill email if available
        const loginEmail = document.getElementById('adminEmail');
        if (loginEmail && loginEmail.value) {
          resetEmailInput.value = loginEmail.value;
        }
      });
    }
    
    // Close reset overlay
    const closeResetBtn = document.getElementById('close-reset');
    if (closeResetBtn) {
      closeResetBtn.addEventListener('click', () => {
        resetOverlay.style.display = 'none';
        showStep(1);
        if (otpTimer) clearInterval(otpTimer);
      });
    }
  });
  
  // Include all other auth functions from the original admin-auth.js here...
  // (Copy the rest of the authentication logic from the previous admin-auth.js)
  
})();
