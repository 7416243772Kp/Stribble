// C:\Ebook\public\js\main.js
document.addEventListener("DOMContentLoaded", () => {
    const wrap = document.getElementById("courses");
    const empty = document.getElementById("emptyState");
    const searchInput = document.getElementById("searchInput");
    const INR = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v || 0);

window.showAuthError = function(message) {
    const errorDiv = document.getElementById('auth-error');
    if (!errorDiv) return;

    errorDiv.innerText = message;
    errorDiv.style.display = 'block';

    // Find active form to highlight its inputs
    const activeForm = [
        document.getElementById('login-form'),
        document.getElementById('signup-form'),
        document.getElementById('otp-form'),
        document.getElementById('forgot-form'),
        document.getElementById('reset-form')
    ].find(f => f && f.style.display !== 'none');

    if (activeForm) {
        activeForm.querySelectorAll('input').forEach(input => {
            input.classList.add('input-error', 'shake');
            input.addEventListener('input', () => {
                input.classList.remove('input-error', 'shake');
                errorDiv.style.display = 'none';
            }, { once: true });
        });
    }
};



    function setYear() {
        const yearEl = document.getElementById("year");
        if (yearEl) yearEl.textContent = new Date().getFullYear();
    }

    function skeleton(count = 8) {
        wrap.innerHTML = "";
        for (let i = 0; i < count; i++) {
            const s = document.createElement("div");
            s.className = "card skeleton";
            s.innerHTML = `
          <div class="card__media skeleton__block"></div>
          <div class="card__body">
            <div class="skeleton__line w-70"></div>
            <div class="skeleton__line"></div>
            <div class="card__footer">
              <div class="skeleton__chip"></div>
              <div class="skeleton__btn"></div>
            </div>
          </div>`;
            wrap.appendChild(s);
        }
    }

    function card(course) {
        const a = document.createElement("a");
        a.className = "card hover-lift";
        a.href = `/course/${course._id}`;
        a.setAttribute("data-title", (course.title || "").toLowerCase());
        a.setAttribute("data-desc", (course.description || "").toLowerCase());

        // API_BASE logic from previous fix
        const apiBase = window.API_BASE || '';
        let thumb = course.thumbnail || '/images/placeholder-course.png';
        if (thumb.startsWith('/') && !thumb.startsWith('//')) {
            thumb = apiBase + thumb;
        }

        a.innerHTML = `
        <div class="card__media">
          <img src="${thumb}" alt="${(course.title || '').replace(/\"/g, '')}" loading="lazy" style="width:100%; height:auto; display:block;" />
        </div>
        <div class="card__body">
          <h3 class="card__title">${course.title || 'Untitled'}</h3>
          <p class="card__desc">${(course.description || "").slice(0, 96)}${course.description && course.description.length > 96 ? "…" : ""}</p>
          <div style="font-size: 0.9rem; margin-top: 8px; margin-bottom: 12px; color: #64748b; font-weight: 500;">
              ${course.reviewCount > 0 ? `<span style="color: #fbbf24; font-size: 1.1rem;">&#9733;</span> <span style="font-weight: 600; color: #334155;">${course.averageRating}</span> (${course.reviewCount} reviews)` : `<span>No reviews yet</span>`}
          </div>
          <div class="card__footer">
            <span class="price">${INR(course.price)}</span>
            <span class="cta">View</span>
          </div>
        </div>`;
        return a;
    }

    function applySearch() {
        const q = (searchInput.value || "").toLowerCase().trim();
        let shown = 0;
        document.querySelectorAll(".grid .card").forEach(c => {
            if (c.classList.contains('skeleton')) return;
            const t = c.getAttribute("data-title") || "";
            const d = c.getAttribute("data-desc") || "";
            const visible = !q || t.includes(q) || d.includes(q);
            c.style.display = visible ? "" : "none";
            if (visible) shown++;
        });

        if (!wrap.querySelector('.skeleton')) {
            empty.classList.toggle("hidden", shown !== 0);
        }
    }

    if (searchInput) searchInput.addEventListener("input", applySearch);

    if (new URLSearchParams(window.location.search).get('openLogin') === '1') {
        window.openLoginModal();
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }

    async function loadCourses() {
        try {
            setYear();
            skeleton(8);

            const apiBase = window.API_BASE || '';
            const res = await fetch(`${apiBase}/api/courses`);

            if (!res.ok) throw new Error("Failed to fetch");

            const data = await res.json();
            const courses = Array.isArray(data) ? data : (data.courses || []);
            
            // Store globally and render
            allCourses = courses;
            renderCatalog(allCourses);

        } catch (err) {
            console.error(err);
            wrap.innerHTML = `<p style="color:red; text-align:center; width:100%;">Failed to load courses.</p>`;
        }
    }



    // Mobile Nav Logic
    loadCourses();
    checkSession();


    const navToggle = document.getElementById('navToggle');
    const links = document.querySelector('.nav__links');

    if (navToggle && links) {
        navToggle.addEventListener('click', () => {
            links.classList.toggle('active');
            navToggle.setAttribute('aria-expanded', String(links.classList.contains('active')));
        });

        // Close menu when a link inside is clicked
        links.querySelectorAll('a, button').forEach(el => {
            el.addEventListener('click', () => {
                links.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
});
// ===============================
// AUTHENTICATION & DASHBOARD LOGIC
// ===============================

let currentUser = null;
let allCourses = [];

function requireLoginForCourse(event) {
    if (currentUser) return true;

    event.preventDefault();
    window.openLoginModal();
    return false;
}

// Helper to render catalog with filtering
function renderCatalogLegacy(courses) {
    const wrap = document.getElementById("courses");
    const empty = document.getElementById("emptyState");
    if(!wrap || !empty) return;

    wrap.innerHTML = "";

    // IDs of purchased courses
    const ownedIds = (currentUser && currentUser.purchasedCourses) 
        ? currentUser.purchasedCourses.map(c => (c._id || c)) 
        : [];

    const availableCourses = courses.filter(c => !ownedIds.includes(c._id));

    if (availableCourses.length === 0) {
         empty.classList.remove("hidden");
         if(ownedIds.length > 0 && courses.length > 0) {
             empty.innerHTML = `
                <div class="empty__card">
                  <h3 style="margin-bottom: 0.5rem;">All courses purchased!</h3>
                  <p>Check your library above.</p>
                </div>
            `;
         }
    } else {
        availableCourses.forEach(c => {
             const apiBase = window.API_BASE || '';
             let thumb = c.thumbnail || '/images/placeholder-course.png';
             if (thumb.startsWith('/') && !thumb.startsWith('//')) {
                thumb = apiBase + thumb;
             }
             
             const div = document.createElement('a');
             div.className = "card hover-lift";
             div.href = `/course/${c._id}`;
             
             // Formatting helper
             const priceFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(c.price || 0);

             div.innerHTML = `
                <div class="card__media">
                  <img src="${thumb}" alt="${(c.title || '').replace(/\"/g, '')}" loading="lazy" style="width:100%; height:auto; display:block;" />
                </div>
                <div class="card__body">
                  <h3 class="card__title">${c.title || 'Untitled'}</h3>
                  <p class="card__desc">${(c.description || "").slice(0, 96)}${c.description && c.description.length > 96 ? "…" : ""}</p>
                  <div style="font-size: 0.9rem; margin-top: 8px; margin-bottom: 12px; color: #64748b; font-weight: 500;">
                      ${c.reviewCount > 0 ? `<span style="color: #fbbf24; font-size: 1.1rem;">&#9733;</span> <span style="font-weight: 600; color: #334155;">${c.averageRating}</span> (${c.reviewCount} reviews)` : `<span>No reviews yet</span>`}
                  </div>
                  <div class="card__footer">
                    <span class="price">${priceFmt}</span>
                    <span class="cta">View</span>
                  </div>
                </div>
             `;
             wrap.appendChild(div);
        });
        empty.classList.add("hidden");
    }
}

async function checkSession() {
    try {
        const res = await fetch('/auth/me');
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            renderAuthUI();
            renderMyCourses();
            
            // Filter catalog
            if(allCourses.length > 0) renderCatalog(allCourses);
        } else {
            currentUser = null; // Ensure null if not logged in
            document.getElementById('auth-ui').innerHTML = `
                <button onclick="toggleLoginModal()" class="btn btn--primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Login / Signup</button>
            `;
            document.getElementById('my-courses-section').classList.add('hidden');
        }
    } catch (e) {
        console.error("Session check failed", e);
    }
}

function renderAuthUI() {
    const authUI = document.getElementById('auth-ui');
    authUI.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <a href="/my-courses" class="btn btn--ghost" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">My Courses</a>
            <span style="font-weight:500; font-size:0.9rem; margin-left:5px;">Hi, ${currentUser.name.split(' ')[0]}</span>
            <button onclick="logout()" class="btn btn--outline" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; border-color:#ef4444; color:#ef4444;">Logout</button>
        </div>
    `;
    // Close modal if open
    document.getElementById('student-login-overlay').style.display = 'none';
}

function renderMyCourses() {
    const section = document.getElementById('my-courses-section');
    const grid = document.getElementById('my-courses-grid');
    
    if (!currentUser.purchasedCourses || currentUser.purchasedCourses.length === 0) {
        section.classList.add('hidden'); // Hide if no courses
        return;
    }

    section.classList.remove('hidden');
    grid.innerHTML = currentUser.purchasedCourses.map(course => {
        // Handle case where course might be populated or just ID
        if (typeof course !== 'object') return ''; 

        return `
        <a href="/my-courses" class="purchased-course-item" style="display: flex; align-items: flex-start; gap: 16px; text-decoration: none; color: inherit; padding: 16px; border-radius: 12px; transition: background 0.2s; cursor: pointer;">
            <img src="${course.thumbnail}" alt="${course.title}" style="width: auto; max-width: 120px; height: auto; border-radius: 8px; display: block;" />
            <div>
                <span style="font-size:0.7rem; text-transform:uppercase; color:#10b981; font-weight:700; letter-spacing:0.5px; display:block; margin-bottom:6px;">Owned</span>
                <h3 style="font-size: 1rem; font-weight: 600; color: #0f172a; margin: 0; line-height: 1.4;">${course.title}</h3>
            </div>
        </a>
        `;
    }).join('');
}

// Render Catalog (Filtered)
function renderCatalog(courses) {
    const wrap = document.getElementById("courses");
    const empty = document.getElementById("emptyState");
    wrap.innerHTML = "";

    // IDs of purchased courses
    const ownedIds = (currentUser && currentUser.purchasedCourses) 
        ? currentUser.purchasedCourses.map(c => (c._id || c)) 
        : [];

    const availableCourses = courses.filter(c => !ownedIds.includes(c._id));

    if (availableCourses.length === 0) {
        if(ownedIds.length > 0) {
            empty.innerHTML = `
                <div class="empty__card">
                  <h3 style="margin-bottom: 0.5rem;">All courses purchased!</h3>
                  <p>Check your library above.</p>
                </div>
            `;
            empty.classList.remove("hidden");
        } else {
             empty.classList.remove("hidden");
        }
    } else {
        availableCourses.forEach(c => {
             // Re-use card function wrapper or just inline card logic?
             // Since 'card()' function is defined inside DOMContentLoaded scope but NOT available here easily unless I move it out or use 'window'. 
             // Actually, I am modifying 'checkSession' which is outside DOMContentLoaded scope in the file structure I see.
             // Wait, `card` function is defined INSIDE `DOMContentLoaded`.
             // I need to be careful. The `checkSession` and `renderMyCourses` are OUTSIDE.
             // I should move `card()` to global scope or duplicate logic.
             // Duplicating logic is cleaner for now to avoid refactoring the whole file. 
             
             const apiBase = window.API_BASE || '';
             let thumb = c.thumbnail || '/images/placeholder-course.png';
             if (thumb.startsWith('/') && !thumb.startsWith('//')) {
                thumb = apiBase + thumb;
             }
             
             const div = document.createElement('a'); // Using 'a' tag as card
             div.className = "card hover-lift";
             div.href = `/course/${c._id}`;
             div.addEventListener('click', requireLoginForCourse);
             div.innerHTML = `
                <div class="card__media">
                  <img src="${thumb}" alt="${(c.title || '').replace(/\"/g, '')}" loading="lazy" style="width:100%; height:auto; display:block;" />
                </div>
                <div class="card__body">
                  <h3 class="card__title">${c.title || 'Untitled'}</h3>
                  <p class="card__desc">${(c.description || "").slice(0, 96)}${c.description && c.description.length > 96 ? "…" : ""}</p>
                  <div style="font-size: 0.9rem; margin-top: 8px; margin-bottom: 12px; color: #64748b; font-weight: 500;">
                      ${c.reviewCount > 0 ? `<span style="color: #fbbf24; font-size: 1.1rem;">&#9733;</span> <span style="font-weight: 600; color: #334155;">${c.averageRating}</span> (${c.reviewCount} reviews)` : `<span>No reviews yet</span>`}
                  </div>
                  <div class="card__footer">
                    <span class="price">${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(c.price || 0)}</span>
                    <span class="cta">View</span>
                  </div>
                </div>
             `;
             wrap.appendChild(div);
        });
        empty.classList.add("hidden");
    }
}

async function logout() {
    try {
        await fetch('/auth/logout', { method: 'POST' });
        window.location.reload();
    } catch (e) {
        window.location.reload();
    }
}

// Toast Notification Helper
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'i';
    if(type === 'success') icon = 'OK';
    if(type === 'error') icon = '!';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    // Remove after 3s (animation handles fade out)
    setTimeout(() => toast.remove(), 3000);
};

// Toggle Student Login Modal
window.toggleLoginModal = function() {
  const modal = document.getElementById('student-login-overlay');
  if (modal.style.display === 'none' || !modal.style.display) {
    modal.style.display = 'flex';
    // Reset to Signup by default when opening
    switchAuthMode('signup');
  } else {
    modal.style.display = 'none';
  }
}

window.openLoginModal = function() {
  const modal = document.getElementById('student-login-overlay');
  if (!modal) return;

  modal.style.display = 'flex';
  switchAuthMode('login');
}

window.showForgotForm = function() {
   // Hide all main forms
   document.getElementById('login-form').style.display = 'none';
   document.getElementById('signup-form').style.display = 'none';
   document.getElementById('forgot-form').style.display = 'block';
   
   // Hide Footer specific elements if needed
   document.getElementById('auth-title').innerText = "Reset Password";
}

window.switchAuthMode = function(mode) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const forgotForm = document.getElementById('forgot-form');
    const resetForm = document.getElementById('reset-form');
    const otpForm = document.getElementById('otp-form');
    
    // Footers
    const signupFooter = document.getElementById('signup-footer');
    const loginFooter = document.getElementById('login-footer');
    const title = document.getElementById('auth-title');

    // Reset visibility
    [loginForm, signupForm, forgotForm, resetForm, otpForm].forEach(f => {
        if(f) f.style.display = 'none';
    });

    if (mode === 'login') {
        loginForm.style.display = 'block';
        if(title) title.innerText = "Log In";
        if(loginFooter) loginFooter.style.display = 'flex';
        if(signupFooter) signupFooter.style.display = 'none';
    } else if (mode === 'signup') {
        signupForm.style.display = 'block';
        if(title) title.innerText = "Create Account";
        if(loginFooter) loginFooter.style.display = 'none';
        if(signupFooter) signupFooter.style.display = 'block';
    }
}

// === FORM HANDLERS === //
document.addEventListener('DOMContentLoaded', () => {
    checkSession();

    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const forgotForm = document.getElementById('forgot-form');
    const resetForm = document.getElementById('reset-form');
    
    let resetEmail = ""; // Store for reset flow

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(loginForm);
            const payload = Object.fromEntries(formData);
            
            // DEBUG: Log what we're sending
            console.log("[Login] Form data:", formData);
            console.log("[Login] Payload being sent:", payload);
            console.log("[Login] Email:", payload.email, "Password length:", payload.password?.length);
            
            try {
                const res = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                // DEBUG: Log response
                console.log("[Login] Server response status:", res.status);
                console.log("[Login] Server response data:", data);
                
                if (data.success) {
                    showToast("Login successful!", "success");
                    window.location.reload();
                } else {
                    showAuthError(data.message || 'Login failed');
                }
            } catch (err) { 
                console.error("[Login] Error:", err);
                showAuthError('Server error'); 
            }

        });
    }

    // Signup & OTP Logic (Simplified for brevity, ensuring existing vars match)
    const otpForm = document.getElementById('otp-form');
    let pendingEmail = "";

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = signupForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = "Sending Code...";
            
            const formData = new FormData(signupForm);
            const payload = Object.fromEntries(formData);

            try {
                const res = await fetch('/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (data.success && data.step === 'otp') {
                    // Show OTP Form
                    pendingEmail = payload.email;
                    document.getElementById('otp-email').textContent = pendingEmail;
                    
                    signupForm.style.display = 'none';
                    otpForm.style.display = 'block';
                    
                    // Update Title
                    const title = document.getElementById('auth-title');
                    if(title) title.innerText = "Verify Email";
                    
                    // Hide Footer
                    const footer = document.getElementById('auth-footer');
                    if(footer) footer.style.display = 'none';
                    
                 } else {
                     showAuthError(data.message || 'Signup failed');
                 }
             } catch (err) { showAuthError('Server error'); }

            finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Sign Up";
            }
        });
    }

    if (otpForm) {
        otpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = otpForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = "Verifying...";
            const otp = otpForm.querySelector('input[name="otp"]').value;

            try {
                const res = await fetch('/auth/verify-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: pendingEmail, otp })
                });
                const data = await res.json();
                if (data.success) window.location.reload();
                else showAuthError(data.message || 'Verification failed');
            } catch(e) { showAuthError('Verification error'); }
            finally {
                submitBtn.disabled = false;
                submitBtn.textContent = "Verify & Login";
            }
        });
    }
    
    // FORGOT PASSWORD HANDLERS
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = forgotForm.querySelector('button[type="submit"]');
            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = "Sending...";
            
            const email = forgotForm.querySelector('input[name="email"]').value;
            
            try {
                const res = await fetch('/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                
                if (data.success) {
                    resetEmail = email;
                    document.getElementById('reset-email-display').textContent = `Code sent to ${email}`;
                    forgotForm.style.display = 'none';
                    resetForm.style.display = 'block';
                } else {
                    showAuthError(data.message || "Failed to send code");
                }
            } catch(e) { showAuthError("Server error"); }
            finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });
    }
    
    if (resetForm) {
         resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = resetForm.querySelector('button[type="submit"]');
            btn.disabled = true;
            
            const otp = resetForm.querySelector('input[name="otp"]').value;
            const newPassword = resetForm.querySelector('input[name="newPassword"]').value;
            
            try {
                 const res = await fetch('/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: resetEmail, otp, newPassword })
                });
                const data = await res.json();
                
                if (data.success) {
                    showToast("Password reset! Please login.", "success");
                    switchAuthMode('login');
                } else {
                    showAuthError(data.message || "Reset failed");
                }
            } catch (e) { showAuthError("Server error"); }
            finally { btn.disabled = false; }
         });
    }
});

// Close modal if clicking outside the box
const overlay = document.getElementById('student-login-overlay');
if(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) toggleLoginModal();
    });
}


// ===============================
// REVIEW MODAL LOGIC REMOVED
// ===============================



// Toast Notification Helper
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'i';
    if(type === 'success') icon = 'OK';
    if(type === 'error') icon = '!';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    // Remove after 3s (animation handles fade out)
    setTimeout(() => toast.remove(), 3000);
};

// ==========================================
// REVIEW SYSTEM & HOMEPAGE MARQUEE
// ==========================================

// 1. Ensure the function is globally accessible (Fixes "is not defined" error)
window.toggleReviewModal = function(courseId = null) {
    console.log("[Frontend] Review button clicked or toggled. Course ID:", courseId);

    const modal = document.getElementById('review-modal-overlay');
    // Also try checking for just 'review-modal' if the overlay logic differs per page
    const modalAlt = document.getElementById('review-modal');
    
    // Determine which modal element we found
    const targetModal = modal || modalAlt;
    const isActive = targetModal && targetModal.classList.contains('active');

    if (targetModal) {
        if (isActive && !courseId) {
             console.log("[Frontend] Closing modal");
             targetModal.classList.remove('active');
        } else {
             // Only open if we have a modal to show
             console.log("[Frontend] Opening modal");
             targetModal.classList.add('active');
        }
    } else {
        console.error("[Frontend] Modal overlay element not found!");
    }
};

window.openReviewModal = function(courseId, courseTitle) {
    console.log("[Frontend] openReviewModal called with:", courseId, courseTitle);
    
    const modal = document.getElementById('review-modal-overlay');
    const titleEl = document.getElementById('modal-course-title');
    const idInput = document.getElementById('modal-course-id');
    const form = document.getElementById('review-form');

    if (modal && titleEl && idInput) {
        titleEl.textContent = `Reviewing: ${courseTitle}`;
        idInput.value = courseId;
        modal.classList.add('active'); // Use active class for CSS transitions
        
        // Reset form
        if(form) form.reset();
        resetStars();
    } else {
        console.error("[Frontend] One or more modal elements missing in openReviewModal");
        console.log("modal:", modal, "titleEl:", titleEl, "idInput:", idInput);
    }
};

function resetStars() {
    const stars = document.querySelectorAll('.star-rating-widget .star');
    stars.forEach(s => s.classList.remove('active'));
    const ratingInput = document.getElementById('review-rating');
    const ratingLabel = document.getElementById('rating-label');
    if(ratingInput) ratingInput.value = 0;
    if(ratingLabel) ratingLabel.textContent = 'Select a rating';
    
    // Reset star colors visually
    stars.forEach(s => {
        s.style.color = '#e2e8f0'; 
        s.classList.remove('active');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Star Hover and Click
    const stars = document.querySelectorAll('.star-rating-widget .star');
    const ratingInput = document.getElementById('review-rating');
    const ratingLabel = document.getElementById('rating-label');

    if(stars.length > 0 && ratingInput) {
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.getAttribute('data-value'));
                ratingInput.value = val;
                
                // Highlight stars
                stars.forEach(s => {
                    const sVal = parseInt(s.getAttribute('data-value'));
                    if (sVal <= val) {
                        s.classList.add('active');
                        s.style.color = '#fbbf24'; // Force color
                    } else {
                        s.classList.remove('active');
                        s.style.color = '#e2e8f0'; // Force empty
                    }
                });
                
                const labels = ["Poor", "Fair", "Good", "Very Good", "Excellent"];
                if(ratingLabel) ratingLabel.textContent = labels[val - 1] || "Select a rating";
            });
        });
    }

    // Form Submission
    const reviewForm = document.getElementById('review-form');
    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log("[Frontend] Submitting review...");
            
            const formData = new FormData(reviewForm);
            const data = Object.fromEntries(formData.entries());
            console.log("[Frontend] Payload:", data);
            
            if(!data.rating || data.rating == "0") {
                showToast("Please select a star rating", "error");
                return;
            }

            try {
                const res = await fetch('/api/reviews', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include', // CRITICAL: Send session cookies for authentication
                    body: JSON.stringify(data)
                });
                const json = await res.json();
                console.log("[Frontend] Server Response:", json);
                
                if (json.success) {
                    showToast("Review submitted successfully!", "success");
                    toggleReviewModal();
                    // Update homepage reviews if marquee exists
                    loadHomepageReviews(); 
                     // Update currentUser.reviewedCourses to hide button immediately if possible
                    if(typeof checkSession === 'function') checkSession();
                } else {
                    showToast(json.message || "Failed to submit review", "error");
                }
            } catch (err) {
                console.error("[Frontend] Network/Script Error:", err);
                showToast("An error occurred", "error");
            }
        });
    } else {
        console.warn("[Frontend] Review form not found in DOM");
    }
    
    // CSP FIX: Attach event listener for close button instead of inline onclick
    const closeReviewBtn = document.getElementById('btn-close-review-modal');
    if (closeReviewBtn) {
        closeReviewBtn.addEventListener('click', () => {
            toggleReviewModal();
        });
    }
    
    // Click outside modal to close
    const reviewOverlay = document.getElementById('review-modal-overlay');
    if (reviewOverlay) {
        reviewOverlay.addEventListener('click', (e) => {
            if (e.target === reviewOverlay) {
                toggleReviewModal();
            }
        });
    }
    
    // Load Homepage Marquee
    loadHomepageReviews();
});

// 2. Homepage Reviews Marquee
async function loadHomepageReviews() {
    const track = document.getElementById('reviews-track');
    if(!track) return; // Not on homepage

    try {
        const res = await fetch('/api/reviews/top');
        const data = await res.json();

        if(data.success && data.reviews.length > 0) {
            const reviews = data.reviews;
            // Duplicate for infinite scroll smoothness
            const allReviews = [...reviews, ...reviews]; 
            
            track.innerHTML = allReviews.map(r => `
                <div class="review-card">
                    <div class="review-header">
                        <div class="review-avatar">${r.userName.charAt(0)}</div>
                        <div>
                            <div class="review-author">${r.userName}</div>
                            <div class="review-course">${r.courseId ? r.courseId.title : 'Course'}</div>
                        </div>
                    </div>
                    <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
                    <p class="review-text">"${r.comment}"</p>
                </div>
            `).join('');
        } else {
             const section = document.querySelector('.reviews-section');
             if(section) section.style.display = 'none';
        }
    } catch(e) {
        console.error("Failed to load reviews", e);
    }
}


