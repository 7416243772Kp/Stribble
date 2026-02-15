document.addEventListener("DOMContentLoaded", () => {
    // 1. Inject Modal and Styles immediately
    injectReviewModal();

    // 2. Set Year
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // 3. Check Session
    checkSession();
});

// Reuse API_BASE
const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

// --- 1. CORE RENDER LOGIC ---

async function checkSession() {
    try {
        const res = await fetch(`${API_BASE}/auth/me`);
        const data = await res.json();
        
        if (data.success && data.user) {

            renderPage(data.user);
        } else {
             window.location.href = "/?login=true";
        }
    } catch (e) {
        console.error("Session check failed", e);
        window.location.href = "/";
    }
}

function renderPage(user) {
    const authUI = document.getElementById("auth-ui");
    const grid = document.getElementById("courses-grid");
    const loading = document.getElementById("loading");
    const empty = document.getElementById("empty-state");
    const welcome = document.getElementById("user-welcome");

    // Header UI
    if (authUI) {
        authUI.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <a href="index.html" class="btn btn--ghost">Browse</a>
                <button id="btn-logout" class="btn btn--outline">Logout</button>
            </div>
        `;
        document.getElementById('btn-logout').addEventListener('click', logout);
    }

    if (welcome) welcome.textContent = `Logged in as ${user.name}`;
    if (loading) loading.style.display = "none";

    const courses = user.purchasedCourses || [];
    // Ensure reviewedCourses is an array of strings for comparison
    const reviewedIds = (user.reviewedCourses || []).map(r => (r._id || r).toString());

    if (courses.length === 0) {
        if (empty) empty.style.display = "block";
        if (grid) grid.style.display = "none";
    } else {
        if (empty) empty.style.display = "none";
        if (grid) {
            grid.style.display = "grid";
            
            // Generate HTML
            grid.innerHTML = courses.map(course => {
                if (typeof course !== 'object') return ''; 

                const thumb = course.thumbnail && (course.thumbnail.startsWith('http') || course.thumbnail.startsWith('//'))
                    ? course.thumbnail 
                    : (API_BASE + (course.thumbnail || '/images/placeholder-course.png'));

                const isReviewed = reviewedIds.includes(course._id.toString());
                
                // CSP FIX: No 'onclick'. We use a class 'js-open-review' and data-attribute.
                const reviewBtn = isReviewed 
                    ? `<span class="reviewed-badge">✓ Reviewed</span>` 
                    : `<button class="btn-write-review js-open-review" data-id="${course._id}" data-title="${(course.title || '').replace(/"/g, '&quot;')}">⭐ Write Review</button>`;

                // Progress from API totalPages + localStorage visited pages
                const visitedRaw = localStorage.getItem(`stribble_visited_${course._id}`);
                const total = course.totalPages || parseInt(localStorage.getItem(`stribble_total_pages_${course._id}`)) || 0;
                const visited = visitedRaw ? JSON.parse(visitedRaw).length : 0;
                let progressHtml = '';
                if (total > 0) {
                    const pct = Math.min(100, Math.round((visited / total) * 100));
                    const statusText = pct === 100 ? 'Completed' : pct === 0 ? 'Not started' : 'In Progress';
                    const statusClass = pct === 100 ? 'complete' : pct > 0 ? 'active' : 'idle';
                    progressHtml = `
                        <div class="course-progress">
                            <div class="course-progress-top">
                                <div class="course-progress-pct ${statusClass}">${pct}%</div>
                                <div class="course-progress-meta">
                                    <span class="course-progress-status ${statusClass}">${statusText}</span>
                                    <span class="course-progress-pages">${visited} of ${total} pages read</span>
                                </div>
                            </div>
                            <div class="course-progress-track">
                                <div class="course-progress-fill ${statusClass}" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    `;
                }

                return `
                <div class="my-course-item">
                    <img src="${thumb}" alt="${course.title}" loading="lazy" />
                    <div class="my-course-content">
                        <h3>${course.title}</h3>
                        ${progressHtml}
                        <div class="actions">
                            <a href="/read?id=${course._id}" class="btn-read">${visited > 0 ? '📖 Continue Reading' : '📖 Start Reading'}</a>
                            ${reviewBtn}
                        </div>
                    </div>
                </div>
                `;
            }).join('');

            // CSP FIX: Attach Event Listeners AFTER adding to DOM
            document.querySelectorAll('.js-open-review').forEach(btn => {

                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const courseId = e.currentTarget.getAttribute('data-id');
                    const courseTitle = e.currentTarget.getAttribute('data-title');

                    openReviewModal(courseId, courseTitle);
                });
            });
        }
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
        window.location.href = "/";
    } catch (e) {
        window.location.href = "/";
    }
}

// --- 2. REVIEW MODAL LOGIC & INJECTION ---

function injectReviewModal() {
    // 1. Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        .modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        }
        .modal-content {
            background: white; padding: 25px; border-radius: 12px;
            width: 90%; max-width: 400px; position: relative;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        }
        .close-modal {
            position: absolute; right: 15px; top: 10px; font-size: 24px; cursor: pointer; color: #64748b;
        }
        .close-modal:hover { color: #000; }
        .star-rating {
            display: flex; flex-direction: row-reverse; justify-content: flex-end; gap: 5px;
        }
        .star-rating input { display: none; }
        .star-rating label { font-size: 24px; color: #ccc; cursor: pointer; transition: color 0.2s; }
        .star-rating input:checked ~ label,
        .star-rating label:hover,
        .star-rating label:hover ~ label { color: #fbbf24; }
        .review-success-msg {
            display: none;
            align-items: center;
            gap: 10px;
            margin-top: 14px;
            padding: 12px 16px;
            background: #f0fdf4;
            border: 1px solid #86efac;
            border-radius: 8px;
            color: #166534;
            font-size: 14px;
            font-weight: 500;
            animation: fadeInMsg 0.3s ease;
        }
        .review-success-msg .success-check {
            width: 24px;
            height: 24px;
            background: #22c55e;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 14px;
            font-weight: 700;
            flex-shrink: 0;
        }
        @keyframes fadeInMsg {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
        }
        /* Course Progress Bar — Premium Design */
        .course-progress {
            margin: 10px 0 6px;
        }
        .course-progress-top {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 8px;
        }
        .course-progress-pct {
            font-size: 13px;
            font-weight: 800;
            min-width: 38px;
            height: 38px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            letter-spacing: -0.3px;
        }
        .course-progress-pct.idle {
            background: #f1f5f9;
            color: #94a3b8;
        }
        .course-progress-pct.active {
            background: linear-gradient(135deg, #eef2ff, #e0e7ff);
            color: #4f46e5;
        }
        .course-progress-pct.complete {
            background: linear-gradient(135deg, #ecfdf5, #d1fae5);
            color: #059669;
        }
        .course-progress-meta {
            display: flex;
            flex-direction: column;
            gap: 1px;
        }
        .course-progress-status {
            font-size: 12.5px;
            font-weight: 700;
            letter-spacing: 0.02em;
        }
        .course-progress-status.idle { color: #94a3b8; }
        .course-progress-status.active { color: #4f46e5; }
        .course-progress-status.complete { color: #059669; }
        .course-progress-pages {
            font-size: 11.5px;
            color: #94a3b8;
            font-weight: 500;
        }
        .course-progress-track {
            width: 100%;
            height: 4px;
            background: #f1f5f9;
            border-radius: 2px;
            overflow: hidden;
        }
        .course-progress-fill {
            height: 100%;
            border-radius: 2px;
            transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .course-progress-fill.idle {
            background: #cbd5e1;
        }
        .course-progress-fill.active {
            background: linear-gradient(90deg, #6366f1, #818cf8);
        }
        .course-progress-fill.complete {
            background: linear-gradient(90deg, #059669, #34d399);
        }
    `;
    document.head.appendChild(style);

    // 2. Inject HTML
    const modalDiv = document.createElement('div');
    modalDiv.id = 'review-modal';
    modalDiv.className = 'modal-overlay';
    modalDiv.style.display = 'none';
    modalDiv.innerHTML = `
        <div class="modal-content">
            <span class="close-modal" id="btn-close-modal">&times;</span>
            <h3 style="margin-top:0;">Write a Review</h3>
            <form id="review-form">
                <input type="hidden" id="review-course-id">
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display:block; font-weight:600; margin-bottom:5px;">Rate the Course</label>
                    <div class="star-rating">
                        <input type="radio" id="star5" name="rating" value="5" /><label for="star5" title="5 stars">★</label>
                        <input type="radio" id="star4" name="rating" value="4" /><label for="star4" title="4 stars">★</label>
                        <input type="radio" id="star3" name="rating" value="3" /><label for="star3" title="3 stars">★</label>
                        <input type="radio" id="star2" name="rating" value="2" /><label for="star2" title="2 stars">★</label>
                        <input type="radio" id="star1" name="rating" value="1" /><label for="star1" title="1 star">★</label>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label for="review-comment" style="display:block; font-weight:600; margin-bottom:5px;">Your Review about this Course</label>
                    <textarea id="review-comment" rows="4" placeholder="Share your experience with this course..." required style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px;"></textarea>
                </div>

                <button type="submit" class="btn btn--primary" style="width: 100%; padding: 10px; background: #0f172a; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Submit Review</button>
                <div class="review-success-msg" id="review-success-msg">
                    <span class="success-check">✓</span>
                    <span>Review submitted successfully! Thank you for your feedback.</span>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modalDiv);

    // 3. Attach Modal Event Listeners
    document.getElementById('btn-close-modal').addEventListener('click', closeReviewModal);
    
    // Close on clicking outside
    modalDiv.addEventListener('click', (e) => {
        if (e.target === modalDiv) closeReviewModal();
    });

    // Handle Form Submit
    document.getElementById('review-form').addEventListener('submit', submitReview);
}

function openReviewModal(courseId) {
    const courseIdInput = document.getElementById('review-course-id');
    const modal = document.getElementById('review-modal');
    
    if (courseIdInput && modal) {
        courseIdInput.value = courseId;
        modal.style.display = 'flex';
    }
}

function closeReviewModal() {
    document.getElementById('review-modal').style.display = 'none';
    document.getElementById('review-form').reset();
    // Reset success message
    const successMsg = document.getElementById('review-success-msg');
    if (successMsg) {
        successMsg.style.display = 'none';
        successMsg.style.background = '#f0fdf4';
        successMsg.style.borderColor = '#86efac';
        successMsg.style.color = '#166534';
        successMsg.querySelector('.success-check').style.background = '#22c55e';
        successMsg.querySelector('.success-check').textContent = '✓';
        successMsg.querySelector('span:last-child').textContent = 'Review submitted successfully! Thank you for your feedback.';
    }
    const submitBtn = document.querySelector('#review-form button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
}

async function submitReview(e) {
    e.preventDefault();
    const courseId = document.getElementById('review-course-id').value;
    const comment = document.getElementById('review-comment').value;
    
    // Get Rating
    const ratingEl = document.querySelector('input[name="rating"]:checked');
    if (!ratingEl) return alert("Please select a star rating");
    const rating = ratingEl.value;

    try {
        const res = await fetch(`${API_BASE}/api/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId, rating, comment })
        });
        
        const data = await res.json();
        
        if (data.success) {
            // Show inline success message
            const successMsg = document.getElementById('review-success-msg');
            if (successMsg) successMsg.style.display = 'flex';
            // Disable the submit button
            const submitBtn = document.querySelector('#review-form button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; }
            // Reload after a short delay so user sees the message
            setTimeout(() => { location.reload(); }, 2000);
        } else {
            // Show inline error instead of alert
            const successMsg = document.getElementById('review-success-msg');
            if (successMsg) {
                successMsg.style.display = 'flex';
                successMsg.style.background = '#fef2f2';
                successMsg.style.borderColor = '#fca5a5';
                successMsg.style.color = '#991b1b';
                successMsg.querySelector('.success-check').style.background = '#ef4444';
                successMsg.querySelector('.success-check').textContent = '✕';
                successMsg.querySelector('span:last-child').textContent = data.message || 'Failed to submit review';
            }
        }
    } catch (err) {
        console.error(err);
        const successMsg = document.getElementById('review-success-msg');
        if (successMsg) {
            successMsg.style.display = 'flex';
            successMsg.style.background = '#fef2f2';
            successMsg.style.borderColor = '#fca5a5';
            successMsg.style.color = '#991b1b';
            successMsg.querySelector('.success-check').style.background = '#ef4444';
            successMsg.querySelector('.success-check').textContent = '✕';
            successMsg.querySelector('span:last-child').textContent = 'Error submitting review';
        }
    }
}
