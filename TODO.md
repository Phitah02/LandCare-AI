# Frontend Refactoring TODO

## 1. Semantic HTML Refactoring
- [ ] Replace generic divs with semantic tags: header for nav, main for content, article for feature cards and results, footer for CTA
- [ ] Ensure logical heading hierarchy (h1 > h2 > h3, etc.)
- [ ] Add aria-labels to buttons (e.g., "Analyze polygon", "Draw polygon")
- [ ] Add alt attributes where missing and improve existing ones

## 2. Consistent Styling
- [ ] Refine color palette: Expand to include blues (#1976d2 for water), earthy tones (#8d6e63 for soil)
- [ ] Establish typography hierarchy: Define font sizes for headings (h1: 3rem, h2: 2.5rem, h3: 1.5rem), body (1rem), small (0.9rem)
- [ ] Add consistent padding/margins (e.g., sections: 4rem, cards: 2rem)
- [ ] Use Flexbox/Grid for all layouts, ensuring alignment

## 3. UI/UX Enhancements
- [ ] Style buttons with hover states (color shift to darker green, subtle shadow)
- [ ] Create card-based layouts for analysis results (add borders, shadows, hover effects)
- [ ] Enhance forms: Add placeholders (e.g., "Enter location: Nairobi County"), error message styles
- [ ] Improve responsive design: Better breakpoints, mobile-first approach

## 4. Accessibility
- [ ] Ensure contrast ratios (text on backgrounds meet WCAG AA)
- [ ] Add aria-labels for interactive elements
- [ ] Make navigation keyboard-friendly (focus styles)
- [ ] Add skip links if needed

## Followup Steps
- [ ] Test responsive design on different devices
- [ ] Run accessibility audit (e.g., using Lighthouse)
- [ ] Verify color contrasts
