## Changes

### 1. Swap section order on the homepage
In `src/routes/index.tsx`, render `<Reviews />` before `<SquareBookingSection />` so the page flow becomes: Hero → Reviews → Booking → Contact → Footer.

The existing scroll handlers already target the correct element IDs (`reviews-section` and `book-tutoring`), so the Hero's "Book Tutoring" and "Read Reviews" buttons and the footer links keep working after the swap — they'll just scroll up/down to the new positions.

### 2. Replace "Log in" with a Book Tutoring button in the navbar
In `src/components/landing/SiteNavbar.tsx`:
- Rename the `onLoginClick` prop to `onBookTutoring`.
- Change the button label from "Log in" to "Book Tutoring".
- Restyle it as a primary CTA (red gradient pill matching the Hero's Book Tutoring button) so it reads as an action, not a text link.

In `src/routes/index.tsx`, pass `onBookTutoring={goToBooking}` to `<SiteNavbar />` so clicking it smooth-scrolls to the `#book-tutoring` Square booking section.

### Out of scope
No changes to `/start`, `/outreach`, Reviews, SquareBookingSection, or ContactForm internals.
