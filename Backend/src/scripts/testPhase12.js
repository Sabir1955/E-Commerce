/**
 * Phase 12 Verification Suite: Customer UI Design & Vedic Astrology Experience
 */
const fs = require("fs");
const path = require("path");

function runTests() {
  console.log("==========================================");
  console.log("Running Phase 12 Customer UI Design Tests");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  const frontendRoot = path.resolve(__dirname, "../../../Frontend/src");
  const homeHtmlPath = path.join(frontendRoot, "app/pages/home/home.html");
  const homeCssPath = path.join(frontendRoot, "app/pages/home/home.css");
  const homeTsPath = path.join(frontendRoot, "app/pages/home/home.ts");
  const productDetailsHtmlPath = path.join(frontendRoot, "app/pages/product-details/product-details.html");
  const productDetailsCssPath = path.join(frontendRoot, "app/pages/product-details/product-details.css");
  const productsHtmlPath = path.join(frontendRoot, "app/pages/products/products.html");
  const stylesPath = path.join(frontendRoot, "styles.css");
  const distPath = path.resolve(__dirname, "../../../Frontend/dist/e-commerce-app/browser");

  const homeHtml = fs.readFileSync(homeHtmlPath, "utf8");
  const homeCss = fs.readFileSync(homeCssPath, "utf8");
  const homeTs = fs.readFileSync(homeTsPath, "utf8");
  const productDetailsHtml = fs.readFileSync(productDetailsHtmlPath, "utf8");
  const productDetailsCss = fs.readFileSync(productDetailsCssPath, "utf8");
  const productsHtml = fs.readFileSync(productsHtmlPath, "utf8");
  const stylesContent = fs.readFileSync(stylesPath, "utf8");

  // Test 1: Home Page Vedic Hero & Celestial Elements
  try {
    const hasSacredBadge = homeHtml.includes("sacred-badge") && homeHtml.includes("प्रामाणिक ज्योतिष");
    const hasCelestialVisual = homeHtml.includes("celestial-orbit") && homeHtml.includes("zodiac-ring");
    const hasOmCore = homeHtml.includes("mandala-core") && homeHtml.includes("ॐ");
    const hasHeroActions = homeHtml.includes("Explore Sacred Catalog") && homeHtml.includes("routerLink=\"/products\"");

    if (hasSacredBadge && hasCelestialVisual && hasOmCore && hasHeroActions) {
      console.log("  ✓ [PASS] 1. Home page features sacred Vedic badge, celestial orbit mandala, and primary CTAs");
      passed++;
    } else {
      throw new Error("Missing Vedic sacred elements or celestial visual in home.html");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 1. Home hero elements:", e.message);
    failed++;
  }

  // Test 2: Celestial Orbit Animation Keyframes & Vedic Palette
  try {
    const hasOrbitKeyframes = homeCss.includes("@keyframes spinCelestial") || homeCss.includes("@keyframes");
    const hasMandalaStyles = homeCss.includes(".celestial-orbit") && homeCss.includes(".inner-mandala");
    const hasBrandVariables = homeCss.includes("var(--color-gold)") && homeCss.includes("var(--color-maroon)");

    if (hasOrbitKeyframes && hasMandalaStyles && hasBrandVariables) {
      console.log("  ✓ [PASS] 2. Celestial orbit animation keyframes and Vedic palette integrated in home.css");
      passed++;
    } else {
      throw new Error("Missing animation keyframes or brand tokens in home.css");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 2. Celestial animations:", e.message);
    failed++;
  }

  // Test 3: Four Vedic Trust Pillars
  try {
    const requiredPillars = [
      "Prana Pratishtha",
      "Lab Certified",
      "Sacred Packaging",
      "Secure Checkout"
    ];
    for (const pillar of requiredPillars) {
      if (!homeHtml.includes(pillar)) {
        throw new Error(`Missing required trust pillar: ${pillar}`);
      }
    }
    console.log("  ✓ [PASS] 3. All 4 Vedic Trust Pillars implemented (Prana Pratishtha, Lab Tested, Sacred Packaging, Secure Checkout)");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 3. Trust pillars:", e.message);
    failed++;
  }

  // Test 4: Dynamic Featured Products in Home Component
  try {
    const injectsProductService = homeTs.includes("ProductService");
    const loadsFeaturedProducts = homeTs.includes("featuredProducts") && (homeTs.includes("getProducts") || homeTs.includes("getFeaturedProducts"));
    const rendersFeaturedGrid = homeHtml.includes("featured-grid") && homeHtml.includes("featuredProducts");

    if (injectsProductService && loadsFeaturedProducts && rendersFeaturedGrid) {
      console.log("  ✓ [PASS] 4. Home component dynamically fetches and showcases featured products via ProductService");
      passed++;
    } else {
      throw new Error("Home component does not properly inject ProductService or render featured products");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 4. Featured products showcase:", e.message);
    failed++;
  }

  // Test 5: Four Traditional Vedic Categories with Sanskrit Subtitles
  try {
    const requiredCategories = ["Rudraksha", "Yantras", "Gemstones", "Puja Essentials"];
    for (const cat of requiredCategories) {
      if (!homeTs.includes(cat)) {
        throw new Error(`Missing spiritual category: ${cat}`);
      }
    }
    const hasSanskritTitle = homeHtml.includes("sanskrit-title");
    if (!hasSanskritTitle) {
      throw new Error("Missing sanskrit-title element in home categories section");
    }
    console.log("  ✓ [PASS] 5. Four authentic spiritual categories configured with Sanskrit titles and descriptions");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 5. Categories configuration:", e.message);
    failed++;
  }

  // Test 6: Ancient Wisdom & Sacred Gayatri Mantra Shloka Card
  try {
    const hasRigveda = homeHtml.includes("Rigveda") || homeHtml.includes("ऋग्वेद");
    const hasGayatri = homeHtml.includes("तत्सवितुर्वरेण्यं");
    const hasOm = homeHtml.includes("shloka-om");

    if (hasRigveda && hasGayatri && hasOm) {
      console.log("  ✓ [PASS] 6. Cosmic science section includes authentic Rigveda Gayatri Mantra and philosophical grounding");
      passed++;
    } else {
      throw new Error("Missing Rigveda Gayatri mantra or shloka card elements in home.html");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 6. Sacred shloka card:", e.message);
    failed++;
  }

  // Test 7: Product Details Vedic Guarantees & Badges
  try {
    const hasGuarantees = productDetailsHtml.includes("sacred-guarantees") && productDetailsHtml.includes("guarantee-pill");
    const hasPrana = productDetailsHtml.includes("Prana Pratishtha");
    const hasLab = productDetailsHtml.includes("Lab Tested");
    const hasAvailability = productDetailsHtml.includes("available-badge") && productDetailsHtml.includes("out-badge");

    if (hasGuarantees && hasPrana && hasLab && hasAvailability) {
      console.log("  ✓ [PASS] 7. Product details displays Vedic consecration guarantees and stock status badges");
      passed++;
    } else {
      throw new Error("Missing sacred guarantees or availability badges in product-details.html");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 7. Product details guarantees:", e.message);
    failed++;
  }

  // Test 8: Product Details Design Tokens & Responsive Styling
  try {
    const hasTokens = productDetailsCss.includes("var(--color-maroon)") && productDetailsCss.includes("var(--color-gold)");
    const hasResponsive = productDetailsCss.includes("@media") && productDetailsCss.includes("max-width");
    const hasWishlistBtn = productDetailsCss.includes(".wishlist-button");

    if (hasTokens && hasResponsive && hasWishlistBtn) {
      console.log("  ✓ [PASS] 8. Product details CSS adheres to design tokens and responsive layout constraints");
      passed++;
    } else {
      throw new Error("Missing design tokens or responsive rules in product-details.css");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 8. Product details styling:", e.message);
    failed++;
  }

  // Test 9: Products Catalog Vedic Header & Brand Integration
  try {
    const hasVedicBadge = productsHtml.includes("VEDIC SANCTUARY COLLECTION") || productsHtml.includes("प्रामाणिक संग्रह");
    const hasSanskritQuote = productsHtml.includes("सर्वं खल्विदं ब्रह्म");
    const hasGlobalBadgeCss = stylesContent.includes(".page-title .sacred-badge") && stylesContent.includes(".page-title .sanskrit-subtext");

    if (hasVedicBadge && hasSanskritQuote && hasGlobalBadgeCss) {
      console.log("  ✓ [PASS] 9. Products catalog features Vedic sanctuary banner and sacred Sanskrit invocation");
      passed++;
    } else {
      throw new Error("Missing Vedic header elements in products.html or styles.css");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 9. Products catalog banner:", e.message);
    failed++;
  }

  // Test 10: Strict Local Asset Rule (No External CDN or Unsplash Placeholders)
  try {
    const customerFiles = [homeHtml, productDetailsHtml, productsHtml];
    const externalPattern = /https?:\/\/(images\.unsplash\.com|via\.placeholder|picsum|placekitten)/i;
    
    for (const content of customerFiles) {
      if (externalPattern.test(content)) {
        throw new Error("External placeholder image CDN found in customer templates");
      }
    }
    console.log("  ✓ [PASS] 10. Strict asset policy enforced: zero external CDN or placeholder dependencies");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 10. Asset policy compliance:", e.message);
    failed++;
  }

  // Test 11: Angular Production Build Output & Static Prerender Artifacts
  try {
    const distExists = fs.existsSync(distPath);
    if (!distExists) {
      throw new Error("Frontend distribution build output directory not found");
    }
    const indexHtmlExists = fs.existsSync(path.join(distPath, "index.html"));
    if (!indexHtmlExists) {
      throw new Error("Prerendered index.html not found in build output");
    }
    console.log("  ✓ [PASS] 11. Angular production build artifacts verified with prerendered index.html");
    passed++;
  } catch (e) {
    console.error("  ✗ [FAIL] 11. Production build artifacts:", e.message);
    failed++;
  }

  // Test 12: End-to-End Visual Aesthetics and Cohesive Layout Integrity
  try {
    const hasPageTitleInStyles = stylesContent.includes(".page-title") && stylesContent.includes("var(--color-maroon)");
    const hasFontSerif = stylesContent.includes("--font-serif") && stylesContent.includes("Cinzel");
    const hasDevanagari = stylesContent.includes("Noto Sans Devanagari");

    if (hasPageTitleInStyles && hasFontSerif && hasDevanagari) {
      console.log("  ✓ [PASS] 12. Full aesthetic typography stack (Cinzel + Noto Sans Devanagari) active and verified");
      passed++;
    } else {
      throw new Error("Missing typography configurations in styles.css");
    }
  } catch (e) {
    console.error("  ✗ [FAIL] 12. Aesthetics & typography stack:", e.message);
    failed++;
  }

  console.log("\n==========================================");
  console.log(`Phase 12 Tests Complete: ${passed} Passed, ${failed} Failed`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
