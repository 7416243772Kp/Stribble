// Ensure API_BASE is available
const API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

document.addEventListener("DOMContentLoaded", () => {
  // 1. Setup Year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // 2. Get Course ID from URL
  // 2. Get Course ID from URL
  const params = new URLSearchParams(window.location.search);
  let courseId = params.get("id");

  // Fallback: Try to get ID from path "/course/:id"
  if (!courseId) {
    const pathParts = window.location.pathname.split('/');
    // Filter out empty strings to handle trailing slashes
    const segments = pathParts.filter(p => p.trim() !== "");
    // If the path is like /course/123, the last segment should be the ID
    if (segments.length >= 2 && segments[segments.length - 2] === 'course') {
       courseId = segments[segments.length - 1];
    }
  }

  // 3. Initialize Page
  if (courseId) {
    loadCourseDetails(courseId);
    initReviews(courseId); // Initialize reviews
  } else {
    const container = document.getElementById("course-details");
    if (container) {
      container.innerHTML = "<p style='text-align:center; color:#666; margin-top:50px;'>⚠️ No course selected. URL needs ?id=...</p>";
    }
  }

  // 4. Mobile Nav Logic
  const navToggle = document.getElementById('navToggle');
  if (navToggle) {
    navToggle.addEventListener('click', () => {
      alert('Open menu (mobile)');
    });
  }
});

// ==========================================
// CORE: LOAD COURSE DETAILS
// ==========================================
async function loadCourseDetails(courseId) {
  const courseDetailsContainer = document.getElementById("course-details");
  if (!courseDetailsContainer) return;

  try {
    // Parallel fetch: Course Details + User Session
    const [courseRes, userRes] = await Promise.all([
      fetch(`${API_BASE}/api/courses/${courseId}`),
      fetch(`${API_BASE}/auth/me`)
    ]);

    if (!courseRes.ok) throw new Error(`Course fetch failed: ${courseRes.status}`);

    const courseData = await courseRes.json();
    const course = courseData.course || courseData;

    let user = null;
    try {
        const userData = await userRes.json();
        if (userData.success) user = userData.user;
    } catch (e) { console.log("User not logged in"); }

    // Check ownership
    const isOwned = user && user.purchasedCourses && user.purchasedCourses.some(c => (c._id || c) === course._id);
    const thumb = (course.thumbnail && (course.thumbnail.startsWith('http') || course.thumbnail.startsWith('//'))) 
                  ? course.thumbnail 
                  : (API_BASE + (course.thumbnail || '/images/placeholder-course.png'));

    // 1. Render Premium Layout
    courseDetailsContainer.innerHTML = `
      <!-- HERO SECTION -->
      <div class="course-hero">
        <div class="course-hero__inner">
            <div class="course-breadcrumb">Courses &nbsp;/&nbsp; ${course.title}</div>
            <h1>${course.title}</h1>
            <p class="course-hero__desc">${course.description.slice(0, 150)}${course.description.length > 150 ? '...' : ''}</p>
        </div>
      </div>

      <!-- MAIN GRID -->
      <div class="course-container">
        <div class="course-grid-layout">
            
            <!-- LEFT COLUMN (Content) -->
            <div class="course-content" id="course-content-area">
                <div class="course-tabs">
                    <div class="course-tab active">About Course</div>
                    <div class="course-tab">Reviews</div>
                </div>
                
                <div style="font-size:1.05rem; line-height:1.7; color:var(--text-main); margin-bottom:40px;">
                    <p>${course.description.replace(/\n/g, '<br>')}</p>
                </div>

                <!-- Reviews and Share will be moved here -->
            </div>

            <!-- RIGHT COLUMN (Sidebar) -->
            <div class="course-sidebar">
                <div class="pricing-card">
                    <img src="${thumb}" alt="${course.title}">
                    
                    <div class="pricing-price">₹${course.price}</div>
                    
                    <div class="pricing-features">
                        <div class="pricing-feature-item">
                            <span style="color:#10b981;">✔</span> <span>Lifetime Access</span>
                        </div>
                        <div class="pricing-feature-item">
                            <span style="color:#10b981;">✔</span> <span>Certificate of Completion</span>
                        </div>
                        <div class="pricing-feature-item">
                             <span style="color:#10b981;">✔</span> <span>Premium Support</span>
                        </div>
                    </div>

                    ${isOwned 
                        ? `<a href="/read?id=${course._id}" class="btn btn--primary btn--block" style="padding:1rem; font-size:1rem; background-color:#10b981;">📖 Read Now</a>`
                        : `<button id="buy-btn" class="btn btn--primary btn--block" style="padding:1rem; font-size:1rem;">Buy Now</button>`
                    }
                </div>
            </div>

        </div>
      </div>
    `;

    // 2. Move Reviews & Share into Left Column
    const contentArea = document.getElementById("course-content-area");
    const reviewsSection = document.getElementById("reviews-section");
    const shareBar = document.getElementById("share-bar");

    if (contentArea) {
        if (reviewsSection) contentArea.appendChild(reviewsSection); // Reviews first
        if (shareBar) contentArea.appendChild(shareBar); // Share below reviews
    }

    // Update Share Links
    updateShareLinks(course, window.location.href);

    // Attach Buy Button Listener (Only if not owned)
    if (!isOwned) {
        const buyBtn = document.getElementById('buy-btn');
        if (buyBtn) {
          buyBtn.onclick = () => {
             // Store selection locally
             localStorage.setItem("selectedCourse", JSON.stringify(course));
             window.location.href = `/checkout/${course._id}`;
          };
        }
    }

  } catch (err) {
    console.error("Error loading course:", err);
    courseDetailsContainer.innerHTML = "<p style='text-align:center; color:red;'>Failed to load course details.</p>";
  }
}

// ==========================================
// REVIEWS SYSTEM LOGIC
// ==========================================
function initReviews(courseId) {
  const listContainer = document.getElementById("reviews-list");
  const summaryContainer = document.getElementById("rating-summary");
  const form = document.getElementById("reviewForm");
  const msgDiv = document.getElementById("rev-msg");
  const listHeader = document.getElementById("reviews-list-header");
  const filterMsg = document.getElementById("reviews-filter-msg");
  const clearFilterBtn = document.getElementById("clear-filter-btn");

  let allReviews = []; 

  if (!listContainer || !form) return;

  // 1. Handle Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Check if user is logged in (using global checkSession logic usually)
    // Or just try to submit and handle 401
    
    const submitBtn = document.getElementById("btn-submit-review");
    const originalBtnText = submitBtn.textContent;
    
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting...";
    msgDiv.textContent = "";

    // We don't need name/email inputs anymore if we trust the account
    const payload = {
      courseId: courseId,
      rating: document.getElementById("rev-rating").value,
      comment: document.getElementById("rev-comment").value.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (res.status === 401) {
          msgDiv.innerHTML = `You need to <a href="#" onclick="toggleLoginModal(); return false;">Login</a> to review.`;
          msgDiv.style.color = "#ef4444";
          return;
      }
      
      if (res.status === 403) {
          msgDiv.textContent = "You must purchase this course to review it.";
          msgDiv.style.color = "#ef4444";
          return;
      }

      if (data.success) {
        msgDiv.textContent = "Review posted successfully!";
        msgDiv.style.color = "#10b981";
        form.reset();
        fetchReviews(); // Reload list
      } else {
        msgDiv.textContent = data.message || "Failed to post review.";
        msgDiv.style.color = "#ef4444";
      }
    } catch (err) {
      console.error("Review submit error:", err);
      msgDiv.textContent = "Server error. Please try again.";
      msgDiv.style.color = "#ef4444";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });

  // 2. Fetch Reviews
  async function fetchReviews() {
    try {
      const res = await fetch(`${API_BASE}/api/reviews/${courseId}`);
      const data = await res.json();
      
      if (data.success) {
        // allReviews = data.reviews || []; // FIXED: Removed debug line that forced empty array
        allReviews = data.reviews || [];
        
        if (allReviews.length > 0) {
          renderStats(allReviews);
          renderList(allReviews);
          summaryContainer.classList.remove("hidden");
        } else {
          listContainer.innerHTML = `<p style="color:#64748b; text-align:center; padding:20px; background:#f8fafc; border-radius:8px;">No reviews yet. Be the first to review!</p>`;
          summaryContainer.classList.add("hidden");
        }
      } else {
         // Handle explicit failure from API
         listContainer.innerHTML = `<p style="color:#ef4444; text-align:center;">${data.message || "Could not load reviews."}</p>`;
      }
    } catch (err) {
      console.error("Failed to load reviews", err);
      listContainer.innerHTML = `<p style="color:#ef4444; text-align:center;">Failed to load reviews.</p>`;
    }
  }

  // 3. Render Stats (Bars Left, Stats Right)
  function renderStats(reviews) {
    const total = reviews.length;
    const counts = { 5:0, 4:0, 3:0, 2:0, 1:0 };
    let sum = 0;

    reviews.forEach(r => {
      counts[r.rating] = (counts[r.rating] || 0) + 1;
      sum += r.rating;
    });

    const average = total ? (sum / total).toFixed(1) : "0.0";
    const avgStars = generateStars(Math.round(total ? sum / total : 0));

    // Generate Bars HTML
    let barsHTML = '';
    for (let i = 5; i >= 1; i--) {
      const count = counts[i];
      const percent = total ? Math.round((count / total) * 100) : 0;
      
      barsHTML += `
        <div class="rating-row" onclick="filterReviews(${i})">
          <div class="rating-label">${i} ★</div>
          <div class="progress-bg">
            <div class="progress-fill" style="width: ${percent}%"></div>
          </div>
          <div class="rating-percent">${percent}%</div>
        </div>
      `;
    }

    summaryContainer.innerHTML = `
      <div class="summary-bars">
        ${barsHTML}
      </div>
      
      <div class="summary-stats">
        <div class="summary-average">${average}</div>
        <div class="summary-stars">${avgStars}</div>
        <div class="summary-total">${total} global ratings</div>
      </div>
    `;
    
    // Make filter accessible
    window.filterReviews = (star) => {
      const filtered = allReviews.filter(r => r.rating === star);
      renderList(filtered);
      
      if(listHeader) listHeader.style.display = "flex";
      if(filterMsg) filterMsg.textContent = `Showing ${star} star reviews (${filtered.length})`;
      if(clearFilterBtn) {
          clearFilterBtn.style.display = "block";
          clearFilterBtn.onclick = () => {
            renderList(allReviews);
            listHeader.style.display = "none";
          };
      }
    };
  }

  // 4. Render List
  function renderList(reviews) {
    if (reviews.length === 0) {
      listContainer.innerHTML = `<p style="text-align:center; padding:20px; color:#64748b;">No reviews found for this filter.</p>`;
      return;
    }
    listContainer.innerHTML = reviews.map(renderReviewHTML).join("");
    attachReplyListeners();
  }

  // Helper: Generate HTML for one review
  function renderReviewHTML(review) {
    const date = new Date(review.createdAt).toLocaleDateString();
    const stars = generateStars(review.rating);
    // Use populated user name if available, fallback to stored name, then anonymous
    const displayName = (review.userId && review.userId.name) ? review.userId.name : (review.userName || "Anonymous User");
    
    const repliesHTML = (review.replies || []).map(r => `
      <div style="margin-top:10px; padding:10px; background:#f1f5f9; border-left:3px solid #cbd5e1; border-radius:0 4px 4px 0; margin-left:20px;">
        <div style="font-size:0.85rem; font-weight:600; color:#334155;">${escapeHtml(r.name || "Admin")} <span style="font-weight:400; color:#94a3b8;">• Reply</span></div>
        <div style="font-size:0.9rem; color:#475569;">${escapeHtml(r.content)}</div>
      </div>
    `).join("");

    return `
      <div class="review-card" style="background:#fff; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:15px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <div>
            <strong style="font-size:1rem; color:#0f172a;">${escapeHtml(displayName)}</strong>
            <span style="color:#10b981; font-size:0.75rem; font-weight:600; margin-left:6px; background:#ecfdf5; padding:2px 6px; border-radius:4px; border:1px solid #bbf7d0;">✓ Verified</span>
          </div>
          <span style="color:#64748b; font-size:0.85rem;">${date}</span>
        </div>
        <div style="margin-bottom:10px; color:#fbbf24; letter-spacing:2px;">${stars}</div>
        <p style="color:#334155; line-height:1.5; margin-bottom:15px;">${escapeHtml(review.comment)}</p>
        
        <button class="btn-reply" data-id="${review._id}" style="background:none; border:none; color:#3b82f6; font-size:0.85rem; cursor:pointer; padding:0; text-decoration:underline;">Reply to this review</button>
        
        <div id="reply-form-${review._id}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #e2e8f0;">
          <input type="text" id="reply-name-${review._id}" placeholder="Your Name" style="width:100%; margin-bottom:8px; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.9rem;">
          <textarea id="reply-content-${review._id}" placeholder="Write a reply..." style="width:100%; margin-bottom:8px; padding:8px; border:1px solid #e2e8f0; border-radius:6px; font-size:0.9rem;" rows="2"></textarea>
          <button class="btn-submit-reply btn btn--primary" data-id="${review._id}" style="padding:6px 12px; font-size:0.85rem;">Post Reply</button>
        </div>

        <div class="replies-container">${repliesHTML}</div>
      </div>
    `;
  }

  function generateStars(count) {
    return Array.from({length: 5}, (_, i) => i < count ? '★' : '☆').join('');
  }

  function attachReplyListeners() {
    document.querySelectorAll(".btn-reply").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const formDiv = document.getElementById(`reply-form-${id}`);
        if (formDiv) formDiv.style.display = formDiv.style.display === "none" ? "block" : "none";
      };
    });

    document.querySelectorAll(".btn-submit-reply").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const nameInput = document.getElementById(`reply-name-${id}`);
        const contentInput = document.getElementById(`reply-content-${id}`);
        const name = nameInput.value.trim();
        const content = contentInput.value.trim();

        if (!name || !content) return alert("Please fill name and content");

        const originalText = btn.textContent;
        btn.textContent = "Posting...";
        btn.disabled = true;

        try {
          const res = await fetch(`${API_BASE}/api/reviews/${id}/reply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, content })
          });
          const data = await res.json();
          if (data.success) {
            await fetchReviews(); // Reload list
          } else {
            alert(data.message || "Failed to reply");
          }
        } catch (err) {
          alert("Error posting reply");
        } finally {
          btn.textContent = originalText;
          btn.disabled = false;
        }
      };
    });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  fetchReviews();
}

// ==========================================
// SHARE LINKS UTILITY
// ==========================================
function updateShareLinks(course, currentUrl) {
  const copyBtn = document.getElementById('copy-link');
  const whatsapp = document.getElementById('whatsapp-link');
  const facebook = document.getElementById('facebook-link');
  const xlink = document.getElementById('x-link');
  const linkedin = document.getElementById('linkedin-link');

  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(currentUrl);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = originalText, 1500);
      } catch (e) {
        prompt('Copy this link', currentUrl);
      }
    };
  }

  const text = encodeURIComponent(course.title + ' — Learn on Stribble');
  const urlEncoded = encodeURIComponent(currentUrl);

  if (whatsapp) whatsapp.href = `https://wa.me/?text=${text}%20${urlEncoded}`;
  if (facebook) facebook.href = `https://www.facebook.com/sharer/sharer.php?u=${urlEncoded}`;
  if (xlink) xlink.href = `https://twitter.com/intent/tweet?text=${text}&url=${urlEncoded}`;
  if (linkedin) linkedin.href = `https://www.linkedin.com/sharing/share-offsite/?url=${urlEncoded}`;
}