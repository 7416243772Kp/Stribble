# ANTI-PATTERNS.MD

## PURPOSE

This file defines design, UX, UI, frontend, backend, architecture, and code patterns that are forbidden.

If any rule in this file conflicts with generated code, this file takes priority.

---

# NEVER BUILD MVP QUALITY INTERFACES

Forbidden:

* Bare minimum features
* Placeholder implementations
* Half-finished workflows
* Dummy functionality when real functionality can be implemented

Always generate production-quality solutions.

---

# NEVER GENERATE AI-LOOKING WEBSITES

Avoid:

* Generic AI generated layouts
* Cookie-cutter templates
* Repetitive sections
* Obvious AI generated styling

The website should look professionally designed by a human.

---

# NO GRADIENTS

Do not use:

* Background gradients
* Text gradients
* Button gradients
* Card gradients

Use solid colors only.

Exception:

Only if explicitly requested.

---

# NO GLASSMORPHISM

Do not use:

* Glass cards
* Blurred panels
* Frosted UI

Unless explicitly requested.

---

# NO NEON DESIGN

Avoid:

* Neon colors
* Glow effects
* Cyberpunk styling

Unless explicitly requested.

---

# NO EXCESSIVE COLORS

Do not create:

* Rainbow color schemes
* Multi-accent designs
* Random color combinations

Use restrained professional palettes.

---

# NO FLOATING BUTTON ANIMATIONS

Forbidden:

Buttons that:

* Jump
* Float
* Lift dramatically
* Move position

Allowed:

* Slight darkening
* Slight border change
* Very subtle shadow

---

# NO ANNOYING ANIMATIONS

Avoid:

* Bounce effects
* Continuous animations
* Flashing elements
* Rotating UI
* Pulsing buttons

Animation should be subtle.

---

# NO HUGE HERO SECTIONS

Do not create:

* Full screen hero sections with little content
* Excessive whitespace

Hero sections should be meaningful.

Content should be visible without excessive scrolling.

---

# NO RANDOM SECTION ORDER

Do not randomly arrange sections.

Follow industry-standard layouts.

Example:

E-commerce:

* Hero
* Categories
* Featured Products
* Trending Products
* Best Sellers
* Offers
* Footer

Not random ordering.

---

# NO EMPTY DASHBOARDS

Never create dashboards containing:

* Empty cards
* Placeholder charts
* Fake statistics

Provide meaningful content structures.

---

# NO FAKE DATA

Avoid:

* Fake users
* Fake orders
* Fake analytics

Use placeholders only when necessary and clearly identify them.

---

# NO BROWSER ALERTS

Forbidden:

alert()

confirm()

prompt()

Never display:

"MyWebsite.com says"

Use:

* Toasts
* Notification panels
* Inline feedback

---

# NO RAW ERROR MESSAGES

Do not show:

* Stack traces
* Database errors
* Technical exceptions

Convert errors into user-friendly messages.

---

# NO HORIZONTAL SCROLLING

Never force users to:

* Scroll sideways
* Zoom out

Layouts must remain responsive.

---

# NO DESKTOP ONLY DESIGN

Forbidden:

Desktop-first layouts that break on mobile.

Every page must work on:

* Mobile
* Tablet
* Desktop

---

# NO FIXED WIDTH LAYOUTS

Avoid:

width: 1200px

width: 800px

Use responsive layouts.

---

# NO TINY CLICK TARGETS

Do not create:

Tiny buttons

Tiny links

Tiny icons

Minimum touch target:

44x44px

---

# NO ICON ONLY ACTIONS

Avoid hiding important actions behind icons only.

Important actions must include labels.

---

# NO HIDDEN PRIMARY ACTIONS

Primary actions must be immediately visible.

Users should not hunt for:

* Login
* Signup
* Add to Cart
* Checkout
* Save
* Submit

---

# NO PLACEHOLDER ONLY FORMS

Bad:

Input with placeholder only.

Required:

Visible labels.

---

# NO POOR PASSWORD UX

Forbidden:

Single password field without guidance.

Must include:

* Requirements
* Validation
* Strength indicator

---

# NO INSTANT FORM SUBMISSION FAILURES

Never submit forms without validation.

Validate before submission.

---

# NO CONFUSING MULTI STEP FORMS

Do not hide progress.

Always show:

Current step

Completed steps

Remaining steps

---

# NO MISSING STATES

Every feature must support:

* Loading
* Success
* Error
* Empty

Never leave users guessing.

---

# NO DEAD ENDS

Never display:

"No results found"

Without giving next action.

Provide CTA buttons.

---

# NO MODALS WITHOUT ESCAPE

Every modal must support:

* ESC close
* Close button
* Click outside close

---

# NO INCONSISTENT NAVIGATION

Do not move navigation elements randomly.

Users expect consistency.

Keep navigation placement predictable.

---

# NO UNNECESSARY POPUPS

Avoid:

* Popup spam
* Modal spam
* Signup popups on first page load

---

# NO FOOTERS WITHOUT LEGAL PAGES

Public websites must not ship without:

* Privacy Policy
* Terms & Conditions
* Contact
* About

Additional pages where applicable:

* Refund Policy
* Shipping Policy
* Cookie Policy

---

# NO MISSING COMPANY INFORMATION

Public websites should include:

* Company Name
* Address
* Contact Email

In footer or contact page.

---

# NO HAMBURGER MENU ON DESKTOP

Desktop navigation should remain visible.

Use hamburger menu only on smaller screens.

---

# NO TABLES ON MOBILE

Large tables should convert into:

* Cards
* Collapsible rows

Do not force sideways scrolling.

---

# NO OVERUSE OF MODALS

Do not use modals when a normal page is better.

Complex workflows should use dedicated pages.

---

# NO OVERCOMPLICATED UI

Do not create interfaces that require tutorials.

Users should understand actions naturally.

---

# NO DUPLICATE CODE

Avoid:

* Copy-pasted components
* Repeated business logic
* Repeated styling

Create reusable systems.

---

# NO MASSIVE FILES

Avoid:

* 2000+ line components
* Giant CSS files
* Monolithic backend files

Split logically.

---

# NO HARDCODED VALUES

Avoid:

* Hardcoded URLs
* Hardcoded secrets
* Hardcoded API keys

Use configuration files and environment variables.

---

# NO SECURITY SHORTCUTS

Never:

* Store plaintext passwords
* Expose secrets
* Trust client-side validation only

---

# NO PERFORMANCE KILLERS

Avoid:

* Unoptimized images
* Loading entire datasets
* Excessive dependencies
* Unnecessary re-renders

---

# NO ACCESSIBILITY NEGLECT

Do not ship interfaces that:

* Cannot be navigated with keyboard
* Lack focus states
* Have poor contrast
* Ignore screen readers

Accessibility is mandatory.

---

# NO RANDOM FEATURE IMPLEMENTATION

Before implementing any feature:

Ask:

"How do successful products in this category usually implement this?"

Follow that pattern.

---

# FINAL RULE

Never choose the quickest implementation.

Choose the implementation users expect from a professional product.

Professional > Fancy

Usability > Creativity

Clarity > Complexity

Trust > Visual Effects
