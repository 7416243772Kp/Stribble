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
                    <div class="course-tab active" onclick="switchTab('about')">About Course</div>
                    <div class="course-tab" onclick="switchTab('reviews')">Reviews</div>
                </div>
                
                <div id="tab-about" class="tab-content" style="font-size:1.05rem; line-height:1.7; color:var(--text-main); margin-bottom:40px;">
                    <p>${course.description.replace(/\n/g, '<br>')}</p>
                </div>

                <div id="tab-reviews" class="tab-content hidden">
                    <div id="reviews-container">
                        <p style="text-align:center; padding:40px; color:#64748b;">Loading reviews...</p>
                    </div>
                </div>

                <div id="share-bar" style="margin-top: 40px; margin-bottom: 40px;">
                  <h4 style="display:inline-block; margin-right:10px;">Share this course:</h4>
                  <button id="copy-link">Copy Link</button>
                  <a id="whatsapp-link" target="_blank" rel="noopener" href="#">WhatsApp</a>
                  <a id="facebook-link" target="_blank" rel="noopener" href="#">Facebook</a>
                  <a id="x-link" target="_blank" rel="noopener" href="#">X</a>
                  <a id="linkedin-link" target="_blank" rel="noopener" href="#">LinkedIn</a>
                </div>
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

    // Initialize Reviews Logic immediately
    loadCourseReviews(courseId);

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

// Tab Switcher
window.switchTab = function(tabName) {
    document.querySelectorAll('.course-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    
    // Find index to set active class
    const tabs = document.querySelectorAll('.course-tab');
    if(tabName === 'about') {
        tabs[0].classList.add('active');
        document.getElementById('tab-about').classList.remove('hidden');
    } else {
        tabs[1].classList.add('active');
        document.getElementById('tab-reviews').classList.remove('hidden');
    }
}

// Fetch and Render Reviews
async function loadCourseReviews(courseId) {
    const container = document.getElementById('reviews-container');
    if(!container) return;

    try {
        const res = await fetch(`/api/reviews/${courseId}`);
        const data = await res.json();
        
        if(data.success) {
            const reviews = data.reviews || [];
            
            if(reviews.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:60px 0;">
                        <span style="font-size:3rem;">📝</span>
                        <h3 style="margin-top:10px; color:#1e293b;">No reviews yet</h3>
                        <p style="color:#64748b;">Be the first to share your thoughts on this course!</p>
                    </div>
                `;
                return;
            }

            // Calculate Stats
            let sum = 0;
            const counts = { 5:0, 4:0, 3:0, 2:0, 1:0 };
            reviews.forEach(r => {
                sum += r.rating;
                counts[r.rating] = (counts[r.rating] || 0) + 1;
            });
            const avg = (sum / reviews.length).toFixed(1);
            
            // Render Review List
            const listHtml = reviews.map(r => `
                <div class="review-list-item">
                    <div class="reviewer-info">
                        <div class="reviewer-avatar">${r.userId.name ? r.userId.name.charAt(0) : (r.userName.charAt(0) || 'U')}</div>
                        <div class="reviewer-meta">
                            <h4>${r.userId.name || r.userName || 'Learner'}</h4>
                            <span>${new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div style="color:#fbbf24; margin-bottom:10px; font-size:1.1rem;">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</div>
                    <p style="color:#334155; line-height:1.6;">${r.comment}</p>
                </div>
            `).join('');

            // Render Full UI
            container.innerHTML = `
                <div class="rating-snapshot">
                    <div class="rating-big-score">
                        <div class="big-rating">${avg}</div>
                        <div class="big-stars">${"★".repeat(Math.round(avg))}${"☆".repeat(5-Math.round(avg))}</div>
                        <div style="color:#64748b; font-weight:500;">${reviews.length} Ratings</div>
                    </div>
                    <div class="rating-bars">
                        ${[5,4,3,2,1].map(star => {
                            const percent = ((counts[star] / reviews.length) * 100).toFixed(0);
                            return `
                                <div class="bar-row">
                                    <div class="bar-label">${star} ★</div>
                                    <div class="bar-bg"><div class="bar-fill" style="width:${percent}%"></div></div>
                                    <div class="bar-percent">${percent}%</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <h3 style="margin-bottom:20px;">Reviews</h3>
                <div class="reviews-list">
                    ${listHtml}
                </div>
            `;

        } else {
             container.innerHTML = "<p>Failed to load reviews.</p>";
        }
    } catch(err) {
        console.error("Review fetch error", err);
        container.innerHTML = "<p>Error loading reviews.</p>";
    }
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