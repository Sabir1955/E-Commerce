/**
 * Phase 11 Verification Suite: Centralized Design System & Brand Palette
 */
const fs = require("fs");
const path = require("path");

function runTests() {
  console.log("==========================================");
  console.log("Running Phase 11 Design System Tests");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  const stylesPath = path.resolve(__dirname, "../../../Frontend/src/styles.css");
  const productCardCssPath = path.resolve(__dirname, "../../../Frontend/src/app/shared/product-card/product-card.component.css");
  const distPath = path.resolve(__dirname, "../../../Frontend/dist/e-commerce-app/browser");

  const stylesContent = fs.readFileSync(stylesPath, "utf8");
  const productCardContent = fs.readFileSync(productCardCssPath, "utf8");

  // Test 1: Exact 8 Core Brand Tokens in :root
  try {
    const requiredTokens = [
      { token: "--color-cream", hex: "#D8B88E" },
      { token: "--color-maroon", hex: "#8F1830" },
      { token: "--color-brick-red", hex: "#A63A42" },
      { token: "--color-navy", hex: "#20233B" },
      { token: "--color-gold", hex: "#B99A45" },
      { token: "--color-purple", hex: "#5B4167" },
      { token: "--color-off-white", hex: "#F0E7D5" },
      { token: "--color-dark", hex: "#30272A" }
    ];

    for (const { token, hex } of requiredTokens) {
      const regex = new RegExp(`${token}\\s*:\\s*${hex}`, "i");
      if (!regex.test(stylesContent)) {
        throw new Error(`Missing or mismatched brand token: ${token}: ${hex}`);
      }
    }
    console.log("  ✓ [PASS] 1. All 8 required brand color tokens defined in :root with exact hex codes");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 1. Brand color tokens:", e.message);
    failed++;
  }

  // Test 2: Backward Compatibility Token Aliases
  try {
    const aliases = ["--cream", "--maroon", "--brick-red", "--navy", "--gold", "--purple", "--off-white", "--dark"];
    for (const alias of aliases) {
      if (!stylesContent.includes(alias)) {
        throw new Error(`Missing backward-compatibility alias: ${alias}`);
      }
    }
    console.log("  ✓ [PASS] 2. Backward compatibility aliases present for existing component styles");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 2. Compatibility aliases:", e.message);
    failed++;
  }

  // Test 3: Product Card Uses Design Tokens
  try {
    const prohibitedHexes = ["#D8B88E", "#8F1830", "#5B4167", "#F0E7D5", "#30272A"];
    const foundProhibited = prohibitedHexes.filter(hex => productCardContent.toLowerCase().includes(hex.toLowerCase()));
    if (foundProhibited.length > 0) {
      throw new Error(`Found hardcoded hex in product-card.component.css: ${foundProhibited.join(", ")}`);
    }
    if (!productCardContent.includes("var(--color-") && !productCardContent.includes("var(--")) {
      throw new Error("product-card.component.css does not reference design tokens");
    }
    console.log("  ✓ [PASS] 3. Product card component refactored to use centralized design tokens");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 3. Product card tokens:", e.message);
    failed++;
  }

  // Test 4: Button Design System
  try {
    const hasPrimaryBtn = stylesContent.includes(".primary-btn") && stylesContent.includes("var(--color-maroon)");
    const hasSecondaryBtn = stylesContent.includes(".secondary-btn") && stylesContent.includes("var(--color-gold)");
    const hasOutlineBtn = stylesContent.includes(".outline-btn") && stylesContent.includes("var(--color-gold)");
    const hasNavyBtn = stylesContent.includes(".navy-btn") && stylesContent.includes("var(--color-navy)");

    if (hasPrimaryBtn && hasSecondaryBtn && hasOutlineBtn && hasNavyBtn) {
      console.log("  ✓ [PASS] 4. Centralized button variants defined (primary, secondary/gold, outline, navy)");
      passed++;
    } else {
      throw new Error("Missing one or more button variant classes in styles.css");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 4. Button design system:", e.message);
    failed++;
  }

  // Test 5: Card & Glassmorphism Surfaces
  try {
    const hasCard = stylesContent.includes(".card") && stylesContent.includes("var(--color-off-white)");
    const hasGlass = stylesContent.includes(".card-glass") && stylesContent.includes("backdrop-filter");
    const hasGoldCard = stylesContent.includes(".card-gold");

    if (hasCard && hasGlass && hasGoldCard) {
      console.log("  ✓ [PASS] 5. Card surfaces, gold border accents, and glassmorphism utilities defined");
      passed++;
    } else {
      throw new Error("Missing card or glassmorphism surface styling");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 5. Card surfaces:", e.message);
    failed++;
  }

  // Test 6: Typography Font Stacks & Google Fonts
  try {
    const hasCinzel = stylesContent.includes("Cinzel");
    const hasCinzelDecorative = stylesContent.includes("Cinzel Decorative");
    const hasDevanagari = stylesContent.includes("Noto Sans Devanagari");

    if (hasCinzel && hasCinzelDecorative && hasDevanagari) {
      console.log("  ✓ [PASS] 6. Typography font stacks (Cinzel, Cinzel Decorative, Noto Sans Devanagari) integrated");
      passed++;
    } else {
      throw new Error("Missing required font family imports");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 6. Typography stacks:", e.message);
    failed++;
  }

  // Test 7: Astrological & Ornamental Accents
  try {
    const hasZodiac = stylesContent.includes(".zodiac-symbol") && stylesContent.includes("var(--color-gold)");
    const hasTagline = stylesContent.includes(".astrology-tagline") && stylesContent.includes("var(--color-purple)");
    const hasSanskrit = stylesContent.includes(".sanskrit-subtext");
    const hasDivider = stylesContent.includes(".gold-divider");

    if (hasZodiac && hasTagline && hasSanskrit && hasDivider) {
      console.log("  ✓ [PASS] 7. Astrology and cultural ornaments (.zodiac-symbol, .gold-divider, .sanskrit-subtext) configured");
      passed++;
    } else {
      throw new Error("Missing astrological decorative utilities");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 7. Astrological ornaments:", e.message);
    failed++;
  }

  // Test 8: Badge Components
  try {
    const hasGoldBadge = stylesContent.includes(".badge-gold");
    const hasMaroonBadge = stylesContent.includes(".badge-maroon");
    const hasPurpleBadge = stylesContent.includes(".badge-purple");

    if (hasGoldBadge && hasMaroonBadge && hasPurpleBadge) {
      console.log("  ✓ [PASS] 8. Status and category badge design tokens (.badge-gold, .badge-maroon, .badge-purple) present");
      passed++;
    } else {
      throw new Error("Missing badge component utilities");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 8. Badges:", e.message);
    failed++;
  }

  // Test 9: Accessibility Focus States
  try {
    if (stylesContent.includes(":focus-visible") && stylesContent.includes("var(--color-gold)")) {
      console.log("  ✓ [PASS] 9. Accessible :focus-visible outlines styled using brand gold token");
      passed++;
    } else {
      throw new Error("Missing accessible focus-visible definition with brand gold");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 9. Accessibility:", e.message);
    failed++;
  }

  // Test 10: Responsive Breakpoints
  try {
    if (stylesContent.includes("@media") && stylesContent.includes("768px")) {
      console.log("  ✓ [PASS] 10. Responsive layout breakpoints (@media 768px) configured for mobile viewport scaling");
      passed++;
    } else {
      throw new Error("Missing responsive media query in styles.css");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 10. Responsive breakpoints:", e.message);
    failed++;
  }

  // Test 11: Production CSS Bundle Artifact
  try {
    if (fs.existsSync(distPath)) {
      const files = fs.readdirSync(distPath);
      const cssFile = files.find(f => f.startsWith("styles-") && f.endsWith(".css"));
      if (cssFile) {
        const compiledCss = fs.readFileSync(path.join(distPath, cssFile), "utf8");
        if (compiledCss.includes("--color-cream:#D8B88E") || compiledCss.includes("--color-cream") || compiledCss.includes("#D8B88E") || compiledCss.includes("#d8b88e")) {
          console.log(`  ✓ [PASS] 11. Production build artifact verified (${cssFile}) containing compiled design tokens`);
          passed++;
        } else {
          throw new Error("Compiled CSS missing brand tokens");
        }
      } else {
        throw new Error("styles-*.css not found in dist/e-commerce-app/browser");
      }
    } else {
      throw new Error("dist directory does not exist. Run npm run build first.");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 11. Production CSS bundle:", e.message);
    failed++;
  }

  // Test 12: Zero Hardcoded Colors Verification across Key Customer Templates
  try {
    const homeHtml = fs.readFileSync(path.resolve(__dirname, "../../../Frontend/src/app/pages/home/home.html"), "utf8");
    const cartHtml = fs.readFileSync(path.resolve(__dirname, "../../../Frontend/src/app/pages/cart/cart.html"), "utf8");
    // Verify no inline style="#..." with plain colors in key customer views
    const hasInlineHex = /style\s*=\s*["'][^"']*#[0-9a-fA-F]{3,8}/i.test(homeHtml) || /style\s*=\s*["'][^"']*#[0-9a-fA-F]{3,8}/i.test(cartHtml);
    if (!hasInlineHex) {
      console.log("  ✓ [PASS] 12. Component templates adhere to clean design token separation without ad-hoc inline hex codes");
      passed++;
    } else {
      throw new Error("Found inline hex styles in customer templates");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 12. Template cleanliness:", e.message);
    failed++;
  }

  console.log("\n==========================================");
  console.log(`Phase 11 Tests Complete: ${passed} passed, ${failed} failed`);
  console.log("==========================================\n");

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
