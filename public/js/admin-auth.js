(function () {
  "use strict";

  // --- DOM Elements ---
  const loginOverlay = document.getElementById("login-overlay");
  const loginForm = document.getElementById("adminLoginForm");
  const loginContainer = document.getElementById("login-form-container");
  const loginError = document.getElementById("login-error");

  // Login & 2FA Inputs
  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const totpSetup = document.getElementById("totp-setup");
  const totpChallenge = document.getElementById("totp-challenge");
  const totpTokenInput = document.getElementById("totp-token");
  const totpLoginTokenInput = document.getElementById("totp-login-token");
  const verifyTotpBtn = document.getElementById("verify-totp-btn");
  const verifyLoginTotpBtn = document.getElementById("verify-login-totp");

  // Forgot / Reset Password Elements
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const resetOverlay = document.getElementById("reset-overlay");
  const resetOtpInput = document.getElementById("reset-otp"); // Fallback single input
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const resetPasswordBtn = document.getElementById("reset-password-btn");
  const resendOtpBtn = document.getElementById("resend-otp-btn");
  const closeReset = document.getElementById("close-reset");
  const timerCountdown = document.getElementById("timer-countdown");

  // Main content to hide for accessibility
  const mainContent =
    document.querySelector("main") ||
    document.querySelector(".admin-root") ||
    document.getElementById("app") ||
    document.body;

  // --- State ---
  let tempLoginToken = null;
  let otpTimer = null;
  let otpTimeLeft = 0;

  // --- Helpers ---

  function toast(type, msg) {
    if (typeof showNotification === "function") {
      showNotification(type, msg);
    } else {
      console.log(`[${type}] ${msg}`);
      if (type === "error") alert(msg);
    }
  }

  function showError(message) {
    if (!loginError) {
      console.warn("login error:", message);
      alert(message);
      return;
    }
    loginError.textContent = message;
    loginError.classList.remove("hidden");
    loginError.style.display = "block";
    setTimeout(() => {
      loginError.classList.add("hidden");
      loginError.style.display = "none";
    }, 5000);
  }

  function hideAllSections() {
    if (loginContainer) loginContainer.style.display = "none";
    if (totpSetup) totpSetup.classList.add("hidden");
    if (totpChallenge) totpChallenge.classList.add("hidden");
  }

  function showLoginForm() {
    hideAllSections();
    // Ensure the parent overlay is visible
    if (loginOverlay) loginOverlay.style.display = "flex";
    // Ensure the form container is visible
    if (loginContainer) loginContainer.style.display = "block";
    if (loginForm) loginForm.style.display = "block";
  }

  function showTotpSetup(qrCodeUrl, secret) {
    hideAllSections();
    const qr = document.getElementById("totp-qr");
    const secretEl = document.getElementById("totp-secret");
    if (qr) qr.src = qrCodeUrl;
    if (secretEl) secretEl.textContent = secret;
    if (totpSetup) totpSetup.classList.remove("hidden");
  }

  function showTotpChallenge() {
    hideAllSections();
    if (totpChallenge) totpChallenge.classList.remove("hidden");
    const first = document.getElementById("totp-1");
    if (first) first.focus();
  }

  // --- FIXED OTP INPUT WIRING ---
  function wireOtpInputs(prefix, hiddenId) {
    // If hiddenId is provided, try to find it. If not, hidden is null (which is fine).
    const hidden = hiddenId ? document.getElementById(hiddenId) : null;

    const inputs = [];
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById(`${prefix}-${i}`);
      if (!el) continue;
      inputs.push(el);

      el.addEventListener("input", (e) => {
        // Allow only numbers
        e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 1);
        e.target.classList.toggle("filled", !!e.target.value);

        // Auto-focus next input
        if (e.target.value && i < 6) {
          const next = document.getElementById(`${prefix}-${i + 1}`);
          if (next) next.focus();
        }

        // Update hidden input if it exists
        if (hidden) hidden.value = inputs.map((x) => x.value || "").join("");
      });

      el.addEventListener("keydown", (e) => {
        // Backspace logic to focus previous
        if (e.key === "Backspace" && !e.target.value && i > 1) {
          const prev = document.getElementById(`${prefix}-${i - 1}`);
          if (prev) {
            prev.focus();
            prev.value = "";
            prev.classList.remove("filled");
          }
          if (hidden) hidden.value = inputs.map((x) => x.value || "").join("");
        }
      });
    }

    // Initialize hidden value if it exists
    if (hidden) hidden.value = inputs.map((x) => x.value || "").join("");
  }

  // --- Timer Logic ---
  function startOtpTimer(seconds = 600) {
    otpTimeLeft = seconds;
    updateTimerText();
    if (otpTimer) clearInterval(otpTimer);
    otpTimer = setInterval(() => {
      otpTimeLeft--;
      updateTimerText();
      if (otpTimeLeft <= 0) {
        clearInterval(otpTimer);
        otpTimer = null;
      }
    }, 1000);
  }

  function updateTimerText() {
    if (!timerCountdown) return;
    const m = Math.floor(otpTimeLeft / 60);
    const s = String(otpTimeLeft % 60).padStart(2, "0");
    timerCountdown.textContent = `${m}:${s}`;
  }

  // --- Overlay Management ---
  function openResetOverlay() {
    if (!resetOverlay) return;
    resetOverlay.classList.remove("hidden");
    resetOverlay.style.display = "flex"; // Ensure it is visible
    resetOverlay.setAttribute("aria-hidden", "false");

    if (mainContent) mainContent.setAttribute("aria-hidden", "true");

    // Focus first available input
    const firstOtp =
      document.getElementById("otp-1") ||
      document.getElementById("reset-otp") ||
      document.getElementById("new-password");
    if (firstOtp) setTimeout(() => firstOtp.focus(), 50);
  }

  function closeResetOverlay() {
    if (!resetOverlay) return;
    resetOverlay.classList.add("hidden");
    resetOverlay.style.display = "none";
    resetOverlay.setAttribute("aria-hidden", "true");

    if (mainContent) mainContent.setAttribute("aria-hidden", "false");
  }

  // --- Auth Check ---
  async function checkAuth() {
    try {
      const response = await fetch(`${window.API_BASE || ""}/api/admin/auth/check`, {
        method: "GET",
        credentials: "include",
      });
      const data = await response.json();
      if (data.success && data.authenticated) {
        if (loginOverlay) loginOverlay.style.display = "none";
        // Initialize Dashboard functions if they exist
        if (typeof fetchDashboardStats === "function") fetchDashboardStats();
        if (typeof fetchCourses === "function") fetchCourses();
      } else {
        if (loginOverlay) loginOverlay.style.display = "flex";
        showLoginForm();
      }
    } catch (err) {
      console.error("Auth check error:", err);
      if (loginOverlay) loginOverlay.style.display = "flex";
      showLoginForm();
    }
  }

  // --- Event Listeners ---

  // 1. Login Submit
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput?.value?.trim() || "";
    const password = passwordInput?.value || "";

    if (!email || !password) return showError("Please enter both email and password");

    try {
      const response = await fetch(`${window.API_BASE || ""}/api/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) return showError(data.message || "Login failed");

      if (data.requireTotp) {
        tempLoginToken = data.tempToken;
        showTotpChallenge();
      } else if (data.setupTotp) {
        tempLoginToken = data.tempToken;
        showTotpSetup(data.qrCode, data.secret);
      } else if (data.success) {
        if (loginOverlay) loginOverlay.style.display = "none";
        location.reload();
      }
    } catch (err) {
      console.error("Login error:", err);
      showError("Server error. Please try again.");
    }
  });

  // 2. TOTP Verification
  verifyTotpBtn?.addEventListener("click", async () => {
    const token = totpTokenInput?.value?.trim() || "";
    if (!token || token.length !== 6) return showError("Please enter a valid 6-digit code");

    try {
      const response = await fetch(`${window.API_BASE || ""}/api/admin/auth/setup-totp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tempToken: tempLoginToken, token }),
      });
      const data = await response.json();
      if (!response.ok) return showError(data.message || "Invalid code");

      if (data.success) {
        toast("success", "2FA enabled successfully");
        if (loginOverlay) loginOverlay.style.display = "none";
        location.reload();
      }
    } catch (err) {
      console.error("TOTP setup error:", err);
      showError("Server error. Please try again.");
    }
  });

  verifyLoginTotpBtn?.addEventListener("click", async () => {
    const token = (totpLoginTokenInput?.value || "").trim();
    if (!token || token.length !== 6) return showError("Please enter a valid 6-digit code");

    try {
      const response = await fetch(`${window.API_BASE || ""}/api/admin/auth/verify-totp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tempToken: tempLoginToken, token }),
      });
      const data = await response.json();
      if (!response.ok) {
        showError(data.message || "Invalid code");
        if (totpLoginTokenInput) totpLoginTokenInput.value = "";
        return;
      }
      if (data.success) {
        toast("success", "Logged in successfully");
        if (loginOverlay) loginOverlay.style.display = "none";
        location.reload();
      }
    } catch (err) {
      console.error("TOTP verify error:", err);
      showError("Server error. Please try again.");
    }
  });

  // 3. Forgot Password Link
  forgotPasswordLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    const originalText = forgotPasswordLink.textContent;
    forgotPasswordLink.textContent = "Sending...";
    forgotPasswordLink.style.pointerEvents = "none";
    forgotPasswordLink.style.opacity = "0.7";

    try {
      const res = await fetch(`${window.API_BASE || ""}/api/admin/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast("success", "OTP sent to admin email");
        // Open reset overlay
        openResetOverlay();
        // Hide the Login Form Container (but keep login-overlay visible behind reset-overlay if needed)
        if (loginContainer) loginContainer.style.display = "none";
        
        startOtpTimer(600);
      } else {
        showError(data.message || "Failed to send OTP");
      }
    } catch (err) {
      console.error("Forgot password error:", err);
      showError("Server error. Please try again.");
    } finally {
      forgotPasswordLink.textContent = originalText;
      forgotPasswordLink.style.pointerEvents = "auto";
      forgotPasswordLink.style.opacity = "1";
    }
  });

  // 4. Resend OTP
  resendOtpBtn?.addEventListener("click", async () => {
    resendOtpBtn.disabled = true;
    try {
      const res = await fetch(`${window.API_BASE || ""}/api/admin/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        startOtpTimer(600);
        toast("success", "OTP resent");
      } else {
        showError(data.message || "Failed to resend OTP");
      }
    } catch (err) {
      showError("Server error.");
    } finally {
      setTimeout(() => (resendOtpBtn.disabled = false), 60000);
    }
  });

  // 5. Reset Password Submit
  resetPasswordBtn?.addEventListener("click", async () => {
    // Collect OTP (split or single)
    let code = "";
    const split = [];
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById(`otp-${i}`);
      if (el) split.push(el.value || "");
    }
    if (split.length === 6 && split.every((x) => x !== "")) {
      code = split.join("");
    } else {
      code = (resetOtpInput?.value || "").trim();
    }

    const newPassword = newPasswordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";

    if (!code || code.length !== 6) return alert("Enter a valid 6-digit OTP");
    if (!newPassword || newPassword.length < 8) return alert("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return alert("Passwords do not match");

    try {
      resetPasswordBtn.disabled = true;
      resetPasswordBtn.textContent = "Resetting...";

      const res = await fetch(`${window.API_BASE || ""}/api/admin/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, newPassword }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.message || "Failed to reset password");
        return;
      }

      // --- SUCCESS: UNFREEZE SCREEN ---
      closeResetOverlay(); // Close the reset modal
      showLoginForm();     // Show the login form again
      
      // Clear fields
      if (passwordInput) passwordInput.value = "";
      if (newPasswordInput) newPasswordInput.value = "";
      if (confirmPasswordInput) confirmPasswordInput.value = "";
      // Clear OTP inputs
      for (let i = 1; i <= 6; i++) {
        const el = document.getElementById(`otp-${i}`);
        if (el) { el.value = ""; el.classList.remove("filled"); }
      }

      toast("success", "Password reset successful. Please log in.");

    } catch (err) {
      console.error("Reset password error", err);
      alert("Server error. Please try again.");
    } finally {
      resetPasswordBtn.disabled = false;
      resetPasswordBtn.textContent = "Set New Password";
    }
  });

  // 6. Close Reset Overlay Button
  closeReset?.addEventListener("click", () => {
    closeResetOverlay();
    // When closing manually, also show login form so user isn't stuck
    showLoginForm();
  });

  // --- Initialization ---
  document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
    // Enable auto-focus for Login 2FA (hidden input exists)
    wireOtpInputs("totp", "totp-login-token");
    // Enable auto-focus for Reset Password (hidden input does NOT exist)
    wireOtpInputs("otp", null);
  });
  
  setInterval(checkAuth, 5 * 60 * 1000);
})();