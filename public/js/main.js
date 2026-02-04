// C:\Ebook\public\js\main.js
document.addEventListener("DOMContentLoaded", () => {
    const wrap = document.getElementById("courses");
    const empty = document.getElementById("emptyState");
    const searchInput = document.getElementById("searchInput");
    const INR = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v || 0);

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

    async function loadReviews() {
        try {
            const marquee = document.getElementById("reviewsMarquee");
            if (!marquee) return;

            const apiBase = window.API_BASE || '';
            const res = await fetch(`${apiBase}/api/reviews/top`);
            const data = await res.json();

            if (!data.success || !data.reviews || data.reviews.length === 0) {
                const section = document.querySelector(".reviews-section");
                if (section) section.style.display = "none";
                return;
            }

            const reviews = data.reviews;

            // Generate Cards
            const cardsHtml = reviews.map(r => {
                const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
                return `
                <div class="review-card">
                    <div class="review-header">
                        <div>
                            <div class="review-user">${r.userName || 'Student'}</div>
                            <div class="review-course">${r.courseId?.title || 'Verified Course'}</div>
                        </div>
                        <div class="review-stars" style="color:#fbbf24; letter-spacing:2px;">${stars}</div>
                    </div>
                    <p class="review-text">"${r.comment}"</p>
                </div>
            `}).join('');

            // Inject (No duplication for regular scroll)
            marquee.innerHTML = cardsHtml;

        } catch (e) {
            console.error("Failed to load reviews:", e);
            const section = document.querySelector(".reviews-section");
            if (section) section.style.display = "none";
        }
    }

    // Mobile Nav Logic
    loadCourses();
    loadReviews();

    const navToggle = document.getElementById('navToggle');
    const links = document.querySelector('.nav__links');

    if (navToggle && links) {
        navToggle.addEventListener('click', () => {
            const isFlex = links.style.display === 'flex';
            links.style.display = isFlex ? 'none' : 'flex';
            navToggle.setAttribute('aria-expanded', String(!isFlex));
        });
    }
});
// ===============================
// AUTHENTICATION & DASHBOARD LOGIC
// ===============================

let currentUser = null;
let allCourses = [];

// Helper to render catalog with filtering
function renderCatalog(courses) {
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
                  <h3 style="margin-bottom: 0.5rem;">All courses purchased! 🚀</h3>
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
            <a href="/my-courses" class="btn btn--ghost" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">📚 My Courses</a>
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
        <div class="card course-card" style="border-left: 4px solid #10b981;">
            <div class="card__media">
                <img src="${course.thumbnail}" alt="${course.title}" loading="lazy" />
            </div>
            <div class="card__body">
                <span style="font-size:0.7rem; text-transform:uppercase; color:#10b981; font-weight:700; letter-spacing:0.5px; margin-bottom:6px; display:inline-block;">Owned</span>
                <h3 class="card__title">${course.title}</h3>
                <div class="card__actions" style="margin-top:10px; display:flex; gap:10px;">
                    <a href="/read?id=${course._id}" class="btn btn--primary" style="flex:1; text-align:center;">📖 Read Now</a>
                    <button onclick="openReviewModal('${course._id}', '${course.title.replace(/'/g, "\\'")}')" class="btn btn--outline" style="padding: 0.5rem;">⭐ Rate</button>
                </div>
            </div>
        </div>
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
                  <h3 style="margin-bottom: 0.5rem;">All courses purchased! 🚀</h3>
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
             div.innerHTML = `
                <div class="card__media">
                  <img src="${thumb}" alt="${(c.title || '').replace(/\"/g, '')}" loading="lazy" style="width:100%; height:auto; display:block;" />
                </div>
                <div class="card__body">
                  <h3 class="card__title">${c.title || 'Untitled'}</h3>
                  <p class="card__desc">${(c.description || "").slice(0, 96)}${c.description && c.description.length > 96 ? "…" : ""}</p>
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

// === MODAL TABS === //
window.switchAuthTab = function(tab) { // Make global
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');

    if (tab === 'login') {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
        tabLogin.classList.add('active-tab');
        tabSignup.classList.remove('active-tab');
    } else {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
        tabLogin.classList.remove('active-tab');
        tabSignup.classList.add('active-tab');
    }
}

// === FORM HANDLERS === //
document.addEventListener('DOMContentLoaded', () => {
    checkSession();

    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(loginForm);
            const payload = Object.fromEntries(formData);
            
            try {
                const res = await fetch('/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                
                if (data.success) {
                    window.location.reload();
                } else {
                    alert(data.message || 'Login failed');
                }
            } catch (err) { alert('Server error'); }
        });
    }

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
                    document.getElementById('tab-signup').style.display = 'none';
                    document.getElementById('tab-login').style.display = 'none';
                    document.querySelector('.auth-tab').parentElement.style.display = 'none'; // Hide tabs
                } else {
                    alert(data.message || 'Signup failed');
                }
            } catch (err) { alert('Server error'); }
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

                if (data.success) {
                    window.location.reload();
                } else {
                    alert(data.message || 'Verification failed');
                }
            } catch(e) { alert('Verification error'); }
            finally {
                 submitBtn.disabled = false;
                 submitBtn.textContent = "Verify & Login";
            }
        });
    }
});

// Toggle Student Login Modal
window.toggleLoginModal = function() {
  const modal = document.getElementById('student-login-overlay');
  if (modal.style.display === 'none' || !modal.style.display) {
    modal.style.display = 'flex';
  } else {
    modal.style.display = 'none';
  }
}

// Close modal if clicking outside the box
const overlay = document.getElementById('student-login-overlay');
if(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) toggleLoginModal();
    });
}

// ===============================
// REVIEW MODAL LOGIC
// ===============================
window.toggleReviewModal = function() {
    const modal = document.getElementById('review-modal');
    if (modal) {
        const isHidden = modal.style.display === 'none';
        modal.style.display = isHidden ? 'flex' : 'none';
    }
}

window.openReviewModal = function(courseId, courseTitle) {
    const modal = document.getElementById('review-modal');
    const titleEl = document.getElementById('review-course-title');
    const idInput = document.getElementById('review-course-id');
    
    if (modal && titleEl && idInput) {
        titleEl.textContent = `Reviewing: ${courseTitle}`;
        idInput.value = courseId;
        modal.style.display = 'flex';
    }
}

// Handle Global Review Submission
const reviewForm = document.getElementById('global-review-form');
if (reviewForm) {
    reviewForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = reviewForm.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Submitting...";

        const formData = new FormData(reviewForm);
        const payload = Object.fromEntries(formData);
        
        // API_BASE Check
        const apiBase = window.API_BASE || '';

        try {
            const res = await fetch(`${apiBase}/api/reviews`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                alert("Review submitted successfully!");
                toggleReviewModal();
                reviewForm.reset();
            } else {
                alert(data.message || "Failed to submit review");
            }
        } catch (err) {
            console.error(err);
            alert("Error submitting review");
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}
