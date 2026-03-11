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
                let certificateHtml = '';
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

                    if (pct === 100) {
                        certificateHtml = `
                            <div class="certificate-container" style="margin-top: 15px; padding: 15px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                                <h4 style="margin: 0 0 8px 0; color: #166534; font-size: 14px;"> Congratulations!</h4>
                                <p style="margin: 0 0 12px 0; color: #15803d; font-size: 13px;">You have successfully completed this course. Here is your certificate of completion.</p>
                                <a href="${API_BASE}/api/courses/${course._id}/certificate" target="_blank" class="btn btn--primary" style="display: inline-block; text-decoration: none; padding: 8px 16px; font-size: 13px; background: #16a34a; border-radius: 6px;"> Get Certificate</a>
                            </div>
                        `;
                    }
                }

                return `
                <div class="my-course-item">
                    <img src="${thumb}" alt="${course.title}" loading="lazy" />
                    <div class="my-course-content">
                        <h3>${course.title}</h3>
                        ${progressHtml}
                        ${certificateHtml}
                        <div class="actions" style="margin-top: 15px;">
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

            // Fetch and inject reviews for each course asynchronously
            courses.forEach(course => {
                const courseId = course._id;
                loadAndInjectPurchasedCourseReviews(courseId);
            });
        }
    }
}

async function loadAndInjectPurchasedCourseReviews(courseId) {
    try {
        const res = await fetch(`${API_BASE}/api/reviews/${courseId}?page=1`);
        const data = await res.json();
        if (data.success && data.reviews && data.reviews.length > 0) {
            // Find the item container in the DOM
            // We use the data-id from the review button or a container class if we added one,
            // but since we didn't add a specific ID to the container, we can find it by looking for the href in the read button.
            const readBtn = document.querySelector(`.my-course-item a[href="/read?id=${courseId}"]`);
            if (readBtn) {
                const itemContainer = readBtn.closest('.my-course-item');
                if (itemContainer) {
                    const reviewsListHtml = data.reviews.slice(0, 3).map(r => `
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e2e8f0;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                                <div style="color: #fbbf24; font-size: 0.95rem;">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</div>
                                <div style="font-size: 0.85rem; color: #64748b; font-weight: 500;">${r.userId?.name || r.userName || 'Learner'}</div>
                            </div>
                            <p style="margin: 0; color: #334155; font-size: 0.95rem; line-height: 1.5;">${r.comment}</p>
                        </div>
                    `).join('');
                    
                    const reviewsSection = document.createElement('div');
                    reviewsSection.style.marginTop = '24px';
                    reviewsSection.style.paddingTop = '20px';
                    reviewsSection.style.borderTop = '1px solid #e2e8f0';
                    reviewsSection.style.width = '100%';
                    reviewsSection.innerHTML = `
                        <h4 style="margin: 0 0 16px 0; font-size: 1.1rem; color: #0f172a;">Community Reviews</h4>
                        ${reviewsListHtml}
                        ${data.reviews.length > 3 ? `<a href="/course?id=${courseId}" style="display: block; font-size: 0.9rem; color: #3b82f6; text-decoration: none; margin-top: 10px; font-weight: 500;">See all ${data.pagination.totalReviews} reviews →</a>` : ''}
                    `;
                    
                    // We need to change the flex direction of the item to ensure it spans full width
                    itemContainer.style.flexDirection = 'column';
                    
                    // Or keep the side-by-side but append reviews to the content side
                    const contentContainer = itemContainer.querySelector('.my-course-content');
                    if (contentContainer) {
                        contentContainer.appendChild(reviewsSection);
                    }
                }
            }
        }
    } catch (e) {
        console.error("Failed to load reviews for course " + courseId, e);
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
            background: rgba(15, 23, 42, 0.6); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
            backdrop-filter: blur(4px);
            opacity: 0; visibility: hidden; transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .modal-overlay.show { opacity: 1; visibility: visible; }
        
        .modal-content {
            background: #ffffff; padding: 32px; border-radius: 16px;
            width: 90%; max-width: 480px; position: relative;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            transform: translateY(20px) scale(0.95);
            transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .modal-overlay.show .modal-content { transform: translateY(0) scale(1); }
        
        .close-modal {
            position: absolute; right: 20px; top: 20px; font-size: 28px; cursor: pointer; color: #94a3b8;
            width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
            border-radius: 50%; transition: all 0.2s; line-height: 1;
        }
        .close-modal:hover { color: #0f172a; background: #f1f5f9; }
        
        h3.modal-title { margin: 0 0 24px 0; font-size: 1.5rem; font-weight: 700; color: #0f172a; letter-spacing: -0.02em; }
        
        .form-group-label { display:block; font-size: 0.95rem; font-weight: 600; color: #334155; margin-bottom: 8px; }
        
        .star-rating {
            display: flex; flex-direction: row-reverse; justify-content: flex-end; gap: 8px;
            background: #f8fafc; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0;
        }
        .star-rating input { display: none; }
        .star-rating label { font-size: 32px; color: #cbd5e1; cursor: pointer; transition: color 0.2s, transform 0.1s; line-height: 1; }
        .star-rating input:checked ~ label,
        .star-rating label:hover,
        .star-rating label:hover ~ label { color: #fbbf24; }
        .star-rating label:hover { transform: scale(1.1); }
        
        .review-textarea {
            width: 100%; padding: 16px; border: 1px solid #cbd5e1; border-radius: 12px; font-family: inherit;
            font-size: 0.95rem; line-height: 1.5; color: #334155; background: #fff; resize: vertical; min-height: 120px;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .review-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
        .review-textarea::placeholder { color: #94a3b8; }
        
        .btn-submit-review {
            width: 100%; padding: 14px; background: #4f46e5; color: white; border: none; border-radius: 12px;
            font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s, transform 0.1s;
            margin-top: 10px; display: flex; justify-content: center; align-items: center; gap: 8px;
        }
        .btn-submit-review:hover { background: #4338ca; }
        .btn-submit-review:active { transform: scale(0.98); }
        .btn-submit-review:disabled { background: #94a3b8; cursor: not-allowed; transform: none; }
        
        .review-success-msg {
            display: none;
            align-items: center;
            gap: 12px;
            margin-top: 16px;
            padding: 14px 16px;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 12px;
            color: #166534;
            font-size: 0.95rem;
            font-weight: 500;
            animation: fadeInMsg 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .review-success-msg .success-check {
            width: 28px;
            height: 28px;
            background: #22c55e;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
            font-weight: 700;
            flex-shrink: 0;
            box-shadow: 0 2px 4px rgba(34, 197, 94, 0.2);
        }
        @keyframes fadeInMsg {
            from { opacity: 0; transform: translateY(10px); }
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
            <h3 class="modal-title">Write a Review</h3>
            <form id="review-form">
                <input type="hidden" id="review-course-id">
                
                <div class="form-group" style="margin-bottom: 20px;">
                    <label class="form-group-label">Rate the Course</label>
                    <div class="star-rating">
                        <input type="radio" id="star5" name="rating" value="5" /><label for="star5" title="5 stars">★</label>
                        <input type="radio" id="star4" name="rating" value="4" /><label for="star4" title="4 stars">★</label>
                        <input type="radio" id="star3" name="rating" value="3" /><label for="star3" title="3 stars">★</label>
                        <input type="radio" id="star2" name="rating" value="2" /><label for="star2" title="2 stars">★</label>
                        <input type="radio" id="star1" name="rating" value="1" /><label for="star1" title="1 star">★</label>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 24px;">
                    <label for="review-comment" class="form-group-label">Your Review about this Course</label>
                    <textarea id="review-comment" class="review-textarea" placeholder="Share your experience with this course... What did you like? What could be improved?" required></textarea>
                </div>

                <button type="submit" class="btn-submit-review"><span>Submit Review</span></button>
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
        // Small delay to allow display to apply before triggering fade in
        modal.style.display = 'flex';
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
    }
}

function closeReviewModal() {
    const modal = document.getElementById('review-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            document.getElementById('review-form').reset();
            // Reset success message
            resetReviewMsg();
        }, 300); // Wait for transition
    }
}

function resetReviewMsg() {
    const successMsg = document.getElementById('review-success-msg');
    if (successMsg) {
        successMsg.style.display = 'none';
        successMsg.style.background = '#f0fdf4';
        successMsg.style.borderColor = '#bbf7d0';
        successMsg.style.color = '#166534';
        const icon = successMsg.querySelector('.success-check');
        if (icon) {
            icon.style.background = '#22c55e';
            icon.textContent = '✓';
            icon.style.boxShadow = '0 2px 4px rgba(34, 197, 94, 0.2)';
        }
        const text = successMsg.querySelector('span:last-child');
        if (text) text.textContent = 'Review submitted successfully! Thank you for your feedback.';
    }
    const submitBtn = document.querySelector('.btn-submit-review');
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
            const submitBtn = document.querySelector('.btn-submit-review');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; }
            // Reload after a short delay so user sees the message
            setTimeout(() => { location.reload(); }, 2000);
        } else {
            // Show inline error instead of alert
            const successMsg = document.getElementById('review-success-msg');
            if (successMsg) {
                successMsg.style.display = 'flex';
                successMsg.style.background = '#fef2f2';
                successMsg.style.borderColor = '#fecaca';
                successMsg.style.color = '#991b1b';
                successMsg.querySelector('.success-check').style.background = '#ef4444';
                successMsg.querySelector('.success-check').style.boxShadow = '0 2px 4px rgba(239, 68, 68, 0.2)';
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
            successMsg.style.borderColor = '#fecaca';
            successMsg.style.color = '#991b1b';
            successMsg.querySelector('.success-check').style.background = '#ef4444';
            successMsg.querySelector('.success-check').style.boxShadow = '0 2px 4px rgba(239, 68, 68, 0.2)';
            successMsg.querySelector('.success-check').textContent = '✕';
            successMsg.querySelector('span:last-child').textContent = 'Error submitting review';
        }
    }
}
