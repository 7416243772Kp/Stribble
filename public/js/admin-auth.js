//C:\Ebook\public\js\admin-auth.js
(function () {
  "use strict";
  
  const loginOverlay = document.getElementById("login-overlay");
  const loginForm = document.getElementById("adminLoginForm");
  const totpSetup = document.getElementById("totp-setup");
  const totpChallenge = document.getElementById("totp-challenge");
  const loginError = document.getElementById("login-error");

  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const totpTokenInput = document.getElementById("totp-token");
  const totpLoginTokenInput = document.getElementById("totp-login-token");

  const verifyTotpBtn = document.getElementById("verify-totp-btn");
  const verifyLoginTotpBtn = document.getElementById("verify-login-totp");

  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  const resetOverlay = document.getElementById("reset-overlay");
  const resetOtpInput = document.getElementById("reset-otp");
  const newPasswordInput = document.getElementById("new-password");
  const confirmPasswordInput = document.getElementById("confirm-password");
  const resetPasswordBtn = document.getElementById("reset-password-btn");
  const resendOtpBtn = document.getElementById("resend-otp-btn");
  const closeReset = document.getElementById("close-reset");
  const timerCountdown = document.getElementById("timer-countdown");

  let tempLoginToken = null;
  let otpTimer = null;
  let otpTimeLeft = 0;

  function toast(type, msg) {
    if (typeof showNotification === "function") {
      showNotification(type, msg);
    } else {
      if (type === "success") console.log("✅", msg);
      else console.warn("⚠️", msg);
    }
  }

  function showError(message) {
    if (!loginError) {
      console.warn("login error:", message);
      return;
    }
    loginError.textContent = message;
    loginError.classList.remove("hidden");
    setTimeout(() => loginError.classList.add("hidden"), 5000);
  }

  function hideAllSections() {
    if (loginForm) loginForm.style.display = "none";
    if (totpSetup) totpSetup.classList.add("hidden");
    if (totpChallenge) totpChallenge.classList.add("hidden");
  }

  function showLoginForm() {
    hideAllSections();
    if (loginForm) loginForm.style.display = "block";
  }

  function showTotpSetup(qrCodeUrl, secret) {
    hideAllSections();
    const qr = document.getElementById("totp-qr");
    const secretEl = document.getElementById("totp-secret");
    if (qr) qr.src = qrCodeUrl;
    if (secretEl) secretEl.textContent = secret;
    totpSetup && totpSetup.classList.remove("hidden");
  }

  function showTotpChallenge() {
    hideAllSections();
    totpChallenge && totpChallenge.classList.remove("hidden");
    const first = document.getElementById("totp-1");
    first && first.focus();
  }

  function wireOtpInputs(prefix, hiddenId) {
    const hidden = document.getElementById(hiddenId);
    if (!hidden) return;
    const inputs = [];
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById(`${prefix}-${i}`);
      if (!el) continue;
      inputs.push(el);

      el.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, 1);
        e.target.classList.toggle("filled", !!e.target.value);
        if (e.target.value && i < 6) {
          const next = document.getElementById(`${prefix}-${i + 1}`);
          next && next.focus();
        }
        hidden.value = inputs.map((x) => x.value || "").join("");
      });

      el.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !e.target.value && i > 1) {
          const prev = document.getElementById(`${prefix}-${i - 1}`);
          if (prev) {
            prev.focus();
            prev.value = "";
            prev.classList.remove("filled");
          }
          hidden.value = inputs.map((x) => x.value || "").join("");
        }
      });
    }
    // initialize hidden value
    hidden.value = inputs.map((x) => x.value || "").join("");
  }

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

  async function checkAuth() {
    try {
      const response = await fetch(`${window.API_BASE}/api/admin/auth/check`, {
        method: "GET",
        credentials: "include",
      });
      const data = await response.json();
      if (data.success && data.authenticated) {
        if (loginOverlay) loginOverlay.style.display = "none";
        if (typeof fetchDashboardStats === "function") fetchDashboardStats();
        if (typeof fetchCourses === "function") fetchCourses();
        if (typeof loadCoursesForCoupons === "function") {
          loadCoursesForCoupons();
          if (typeof loadCoupons === "function") loadCoupons();
        }
        if (typeof loadSalesDashboard === "function") loadSalesDashboard();
        if (typeof loadFailedEmails === "function") loadFailedEmails();
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

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput?.value?.trim() || "";
    const password = passwordInput?.value || "";

    if (!email || !password) return showError("Please enter both email and password");

    try {
      const response = await fetch(`${window.API_BASE}/api/admin/auth/login`, {
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
        loginOverlay && (loginOverlay.style.display = "none");
        location.reload();
      }
    } catch (err) {
      console.error("Login error:", err);
      showError("Server error. Please try again.");
    }
  });

  verifyTotpBtn?.addEventListener("click", async () => {
    const token = totpTokenInput?.value?.trim() || "";
    if (!token || token.length !== 6) return showError("Please enter a valid 6-digit code");

    try {
      const response = await fetch(`${window.API_BASE}/api/admin/auth/setup-totp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tempToken: tempLoginToken, token }),
      });
      const data = await response.json();
      if (!response.ok) return showError(data.message || "Invalid code");

      if (data.success) {
        toast("success", "2FA enabled successfully");
        loginOverlay && (loginOverlay.style.display = "none");
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
      const response = await fetch(`${window.API_BASE}/api/admin/auth/verify-totp`, {
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
        loginOverlay && (loginOverlay.style.display = "none");
        location.reload();
      }
    } catch (err) {
      console.error("TOTP verify error:", err);
      showError("Server error. Please try again.");
    }
  });

  wireOtpInputs("totp", "totp-login-token");

  forgotPasswordLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${window.API_BASE}/api/admin/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        if (resetOverlay) resetOverlay.style.display = "flex";
        startOtpTimer(600);
        toast("success", "OTP sent to admin email");
      } else {
        showError(data.message || "Failed to send OTP");
      }
    } catch (err) {
      console.error("Forgot password error:", err);
      showError("Server error. Please try again.");
    }
  });

  resendOtpBtn?.addEventListener("click", async () => {
    resendOtpBtn.disabled = true;
    try {
      const res = await fetch(`${window.API_BASE}/api/admin/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        startOtpTimer(600);
        toast("success", "OTP resent");
      } else {
        showError(data.message || "Failed to resend OTP");
      }
    } catch (err) {
      console.error("Resend OTP error:", err);
      showError("Server error. Please try again.");
    } finally {
      setTimeout(() => (resendOtpBtn.disabled = false), 60_000);
    }
  });

  resetPasswordBtn?.addEventListener("click", async () => {
    const code = (resetOtpInput?.value || "").trim();
    const newPassword = newPasswordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";

    if (!code || code.length !== 6) return showError("Enter a valid 6-digit OTP");
    if (!newPassword || newPassword.length < 8) return showError("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return showError("Passwords do not match");

    try {
      const res = await fetch(`${window.API_BASE}/api/admin/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return showError(data.message || "Failed to reset password");
      }

      if (resetOverlay) resetOverlay.style.display = "none";
      if (passwordInput) passwordInput.value = "";
      toast("success", "Password reset successful. Please log in with the new password.");
    } catch (err) {
      console.error("Reset password error", err);
      showError("Server error. Please try again.");
    }
  });

  closeReset?.addEventListener("click", () => {
    if (resetOverlay) resetOverlay.style.display = "none";
  });

  document.addEventListener("DOMContentLoaded", () => {
    checkAuth();
  });
  setInterval(checkAuth, 5 * 60 * 1000);
})();