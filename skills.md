# UNIVERSAL SKILLS.MD

## PURPOSE

This file defines the mandatory product, design, UX, UI, architecture, responsiveness, accessibility, and software standards that must be followed for every project.

Before generating any code, analyze the project type and automatically implement industry-standard features, layouts, workflows, and user expectations without requiring explicit instructions.

Never generate MVP-quality interfaces unless specifically requested.

Generate production-quality software by default.

---

# CORE PHILOSOPHY

Users should feel:

* Familiarity
* Trust
* Clarity
* Simplicity
* Professionalism

If a feature exists in most successful products of that category, include it automatically.

Do not wait for the user to ask.

---

# DESIGN PHILOSOPHY

Design must feel:

* Human-made
* Professional
* Premium
* Modern
* Clean
* Trustworthy

Avoid:

* AI-generated appearance
* Excessive colors
* Random layouts
* Overdesigned interfaces
* Fancy effects
* Unnecessary animations

---

# COLOR RULES

Use solid colors only.

Avoid:

* Gradients
* Glassmorphism
* Neon effects
* Rainbow palettes
* Excessive shadows

Use:

* Neutral colors
* Strong contrast
* Professional color hierarchy

Maximum:

* 1 primary color
* 1 accent color
* 1 success color
* 1 warning color
* 1 danger color

---

# MOBILE FIRST DESIGN

Every project must be mobile-first.

Never create desktop-first interfaces.

Design order:

1. Mobile
2. Tablet
3. Desktop
4. Large Desktop

---

# RESPONSIVE BREAKPOINTS

Mobile:
320px+

Tablet:
768px+

Desktop:
1024px+

Large Desktop:
1440px+

---

# RESPONSIVE REQUIREMENTS

All pages must work correctly on:

* Phones
* Tablets
* Laptops
* Desktop monitors

No horizontal scrolling.

No broken layouts.

No overlapping content.

No desktop-only components.

---

# NAVIGATION RULES

Navigation should follow industry standards.

Do not invent navigation locations.

Use familiar placements users already expect.

Examples:

E-commerce:

* Logo top left
* Search center
* Cart top right
* Profile top right
* Wishlist near cart
* Categories below navbar

Dashboard:

* Sidebar left
* User menu top right

Social Platform:

* Feed center
* Notifications top right
* Profile top right

Always follow industry conventions.

---

# HOVER EFFECT RULES

Do NOT create:

* Floating buttons
* Moving buttons
* Jumping buttons
* Enlarging buttons

Default hover behavior:

* Slightly darker color
* Slight border change
* Slight shadow change

Nothing distracting.

---

# TYPOGRAPHY

Font:

Inter

Fallback:

system-ui

Maintain proper hierarchy:

* H1
* H2
* H3
* H4
* Body
* Caption

Never use inconsistent font sizes.

---

# SPACING SYSTEM

Use:

4
8
12
16
24
32
48
64

Maintain consistency throughout the application.

---

# FEEDBACK RULES

Never use browser alerts.

Forbidden:

alert("Success")

alert("Error")

alert("Message")

Never display:

"mydomain.com says..."

Use:

* Toast notifications
* Snackbars
* Inline messages
* Success banners

---

# FORM RULES

All forms must contain:

* Labels
* Validation
* Error handling
* Loading states

Never rely only on placeholders.

---

# AUTHENTICATION RULES

Whenever authentication exists, automatically include:

Login

* Email
* Password
* Show Password
* Remember Me
* Forgot Password

Signup

* Name
* Email
* Password
* Confirm Password

---

# PASSWORD EXPERIENCE

Password requirements should display live.

Requirements:

✓ Minimum length

✓ One uppercase letter

✓ One lowercase letter

✓ One number

✓ One special character

Invalid:

Red cross

Valid:

Green tick

Buttons remain disabled until requirements are met.

---

# RESET PASSWORD FLOW

Use multi-step process.

Step 1:

Enter Email

Step 2:

Verify OTP

Step 3:

Reset Password

Step 4:

Success Confirmation

---

# MULTI STEP WORKFLOW DESIGN

Every multi-step process must contain:

Progress indicator

Example:

[✓]
Account

.............

[✓]
Verify

.............

[3]
Reset

Completed:

* Green
* Tick icon

Current:

* Highlighted

Future:

* Muted

---

# LOADING STATES

Every async action requires:

* Skeleton loader
* Spinner
* Progress state

Never show blank screens.

---

# EMPTY STATES

Every list page requires empty state.

Include:

* Illustration or icon
* Helpful message
* Primary action button

---

# ERROR STATES

Use human-readable messages.

Bad:

Error 500

Good:

Unable to load products. Please try again.

---

# TABLES

Desktop:

Table layout

Mobile:

Card layout

Include:

* Search
* Sort
* Filter
* Pagination

---

# SEARCH EXPERIENCE

Whenever searchable content exists:

Automatically include:

* Search
* Filters
* Sorting

Do not require explicit request.

---

# DASHBOARD RULES

Every dashboard should include:

* Statistics
* Recent Activity
* Quick Actions
* Overview Cards

Avoid empty dashboards.

---

# NOTIFICATION SYSTEM

Use professional notification patterns.

Allowed:

* Toast
* Notification Center
* Notification Dropdown

Not Allowed:

Browser alert dialogs.

---

# MODAL RULES

Support:

* ESC close
* Click outside close
* Close icon

---

# BUTTON STATES

Every button requires:

* Default
* Hover
* Focus
* Disabled
* Loading

---

# FOOTER RULES

Every public website must include:

* About
* Contact
* Privacy Policy
* Terms & Conditions
* Cookie Policy
* Refund Policy (if applicable)
* Shipping Policy (if applicable)

Include:

* Company information
* Physical address
* Contact email

---

# ACCESSIBILITY

Mandatory:

* Keyboard navigation
* Focus states
* Screen reader support
* Proper contrast ratio
* ARIA labels

---

# SECURITY

Implement:

* Input validation
* Sanitization
* Rate limiting
* Secure authentication
* Password hashing
* CSRF protection
* XSS protection

---

# CODE QUALITY

Generate:

* Reusable components
* Modular architecture
* Clean code
* Maintainable code

Avoid:

* Duplicate code
* Massive files
* Hardcoded values

---

# PROJECT TYPE DETECTION

Automatically determine the project category.

Then implement industry-standard features.

---

# E-COMMERCE WEBSITE RULES

Automatically include:

Homepage

* Hero section
* Featured products
* Trending products
* Best sellers
* Categories
* Offers
* New arrivals

Navigation

* Search bar
* Cart
* Wishlist
* Profile
* Orders

Product Listing

* Filters
* Sort
* Search
* Pagination

Product Page

* Images
* Gallery
* Description
* Specifications
* Reviews
* Ratings
* Related Products

Reviews

* Text reviews
* Star ratings
* Photo uploads

Cart

* Quantity controls
* Remove item
* Price summary

Checkout

* Address management
* Shipping options
* Payment methods
* Order summary

User Account

* Profile
* Orders
* Addresses
* Wishlist
* Saved Payments

Seller Features

If marketplace:

* Seller dashboard
* Product management
* Inventory management
* Order management
* Analytics

Legal Pages

Automatically create:

* Privacy Policy
* Terms
* Refund Policy
* Shipping Policy
* Contact Page

---

# SAAS RULES

Automatically include:

* Dashboard
* Billing
* Subscription Management
* Profile
* Notifications
* Settings

---

# SOCIAL PLATFORM RULES

Automatically include:

* Feed
* Profile
* Notifications
* Search
* Settings
* Follow System

---

# ADMIN PANEL RULES

Automatically include:

* Dashboard
* User Management
* Content Management
* Analytics
* Audit Logs

---

# FINAL RULE

Do not build only what is requested.

Build what professional software in that category is expected to contain.

Always follow industry-standard UI placement, UX patterns, workflows, accessibility, responsiveness, security practices, and legal requirements unless explicitly instructed otherwise.
