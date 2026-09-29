/**
 * Industry Context Intelligence — commercial landscape reasoning without style presets.
 *
 * ARCHITECTURAL PRINCIPLE:
 * Industry is CONTEXT. Industry is NOT a style template.
 *
 * This module reasons about the commercial reality of an industry:
 *   - what competitors typically do (category conventions)
 *   - what consumers expect and what frustrates them (consumer psychology)
 *   - what clichés crowd the market (competitive sameness)
 *   - what unexploited territories exist (whitespace opportunities)
 *   - what trust signals and claim risks exist in this domain
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO:
 * It never prescribes:
 *   - a font family or serif/sans choice
 *   - a color palette or hex code
 *   - a camera lens, angle or lighting setup
 *   - a visual treatment or composition grid
 *
 * Those decisions belong exclusively to the Creative Director, Art Direction
 * Resolver, Composition Plan and Typography DNA, derived from the specific
 * creative idea and product truth.
 */

export type CategoryRelationship =
  | "respect"
  | "reinterpret"
  | "contrast"
  | "disrupt"
  | "deliberately_ignore";

export type IndustryProvenance =
  | "user_supplied"
  | "internal_knowledge"
  | "model_inference";

export interface IndustryLandscape {
  /** Canonical name of the industry or category domain. */
  industry_name: string;
  /** Normalized identifier. */
  industry_id: string;
  /** What competitors in this space typically depict and say. */
  category_conventions: string[];
  /** Subconscious or explicit expectations consumers bring to this category. */
  consumer_expectations: string[];
  /** Why consumers actually purchase products in this domain. */
  buying_motivations: string[];
  /** Typical communication patterns and recurring campaign structures. */
  typical_communication_patterns: string[];
  /** Overused visual and narrative clichés that cause brand invisibility. */
  overused_category_cliches: string[];
  /** Visual codes commonly recognized by consumers (semiotics). */
  category_visual_codes: string[];
  /** Underused emotional, cultural or conceptual whitespace in this category. */
  whitespace_opportunities: string[];
  /** Evidence and visual cues that make a product believable in this space. */
  common_trust_signals: string[];
  /** Primary emotional territories prevalent in category advertising. */
  common_emotional_territories: string[];
  /** Sensitive areas or regulatory/perceptual pitfalls common to this industry. */
  category_claim_risks: string[];
  /** Why products in this category easily look identical to one another. */
  competitive_sameness_diagnosis: string;
  /** Where this landscape knowledge originated. */
  provenance: IndustryProvenance;
}

/**
 * Curated knowledge base of commercial industry landscapes.
 * Each entry details the competitive ecosystem without dictating creative execution.
 */
const INDUSTRY_KNOWLEDGE_BASE: Record<string, Omit<IndustryLandscape, "industry_id" | "provenance">> = {
  coffee_tea: {
    industry_name: "Cà phê & Trà (Coffee & Tea)",
    category_conventions: [
      "Steaming mugs on rustic wooden tables with soft morning backlight",
      "Close-ups of roasted beans falling or espresso crema pouring in slow motion",
      "Barista craft imagery with apron, ceramic cups and warm earthy tones",
      "Origin stories focusing on highland mist, farmers and burlap sacks",
    ],
    consumer_expectations: [
      "Aroma expectation, freshness, rich sensory satisfaction",
      "Ritualistic transition into wakefulness or afternoon focus",
      "Quality assurance regarding bean grade, roast profile or tea leaf origin",
    ],
    buying_motivations: [
      "Functional energy boost and cognitive alertness",
      "Daily comfort ritual and personal pause from hectic schedules",
      "Sensory pleasure and social connection or café lifestyle aspiration",
    ],
    typical_communication_patterns: [
      "Wake-up morning call-to-action",
      "Craftsmanship and meticulous brewing process declaration",
      "Peaceful solo reflection vs bustling social café moments",
    ],
    overused_category_cliches: [
      "Brown-on-brown color grading and rustic wood surfaces",
      "Cozy knit sweaters holding a warm mug with two hands",
      "Steam wisps rising against dark chalkboard walls",
      "Generic 'pure from nature' botanical sketches",
    ],
    category_visual_codes: [
      "Liquid amber tones, deep roasted browns, steam, drip drops",
      "Ceramic, textured paper, burlap, raw stone, cast iron",
    ],
    whitespace_opportunities: [
      "High-energy modern urban productivity without the slow café tropes",
      "Scientific extraction precision and architectural minimalism",
      "Youth street culture, iced summer vibrance, chaotic festival energy",
      "Nocturnal creativity and late-night focus rituals",
      "Extreme purity and crisp cold-temperature tactile contrast",
    ],
    common_trust_signals: [
      "Visible packaging label with origin, roast level or extraction time",
      "Clear, unclouded liquid clarity in ice drinks",
      "Authentic bean texture without synthetic shine",
    ],
    common_emotional_territories: [
      "Mindful calm and grounding ritual",
      "Sharp mental clarity and drive",
      "Warm artisanal nostalgia and hospitality",
    ],
    category_claim_risks: [
      "Vague '100% natural' or unverified fair-trade claims",
      "Overpromising miraculous health benefits from herbal infusions",
    ],
    competitive_sameness_diagnosis:
      "Almost every brand uses warm morning lighting on wood with brown tones, making independent brands indistinguishable from commodity supermarket coffee.",
  },

  beauty_skincare: {
    industry_name: "Mỹ phẩm & Chăm sóc da (Beauty & Skincare)",
    category_conventions: [
      "Pristine white or soft pastel studio backdrops with water ripples",
      "Pipettes hovering with a single translucent serum droplet",
      "Flawless dewy skin models with neutral, serene expressions",
      "Glass bottle reflections on marble plinths or shallow water trays",
    ],
    consumer_expectations: [
      "Skin transformation, barrier repair, radiance, youthfulness",
      "Dermatological safety, gentle non-irritating formulas",
      "Tactile luxury in packaging weight and dispenser mechanism",
    ],
    buying_motivations: [
      "Overcoming specific skin anxiety (acne, aging, dullness, sensitivity)",
      "Self-care ritual and psychological indulgence",
      "Social confidence and visible aesthetic refinement",
    ],
    typical_communication_patterns: [
      "Problem-solution transformation promises",
      "Ingredient spotlight (Hyaluronic acid, Retinol, Niacinamide, Centella)",
      "Clinical lab trial percentages ('94% observed smoother skin')",
    ],
    overused_category_cliches: [
      "Chai serum on a pale pink pedestal with eucalyptus leaves",
      "Splash droplets around a tube in an empty white void",
      "Clinical lab coats pretending to mix skincare in beakers",
      "Over-airbrushed, pore-less plasticized skin aesthetics",
    ],
    category_visual_codes: [
      "Translucent glass, frosted bottles, water prisms, chrome pumps",
      "Smooth droplet viscosities, glossy emulsions, botanical stems",
    ],
    whitespace_opportunities: [
      "Raw dermatological realism and honest unvarnished skin texture",
      "High-fashion editorial darkness and bold monochromatic drama",
      "Playful Gen-Z tactile maximalism and vibrant pop-chemistry",
      "Botanical surrealism and hyper-real biological architecture",
      "Sensory ASMR-like texture immersion (thick balms, crackling mists)",
    ],
    common_trust_signals: [
      "Legible active ingredient percentages and clean packaging typography",
      "Texture accuracy (gel vs cream vs oil must look true to viscosity)",
      "Certifications (dermatologist tested, non-comedogenic, vegan)",
    ],
    common_emotional_territories: [
      "Effortless glow and quiet luxury",
      "Clinical authority and scientific empowerment",
      "Sensual grounding and tactile pampering",
    ],
    category_claim_risks: [
      "Unsubstantiated anti-aging or instant-cure promises",
      "Pseudoscientific jargon that invites consumer skepticism",
    ],
    competitive_sameness_diagnosis:
      "The overwhelming majority of skincare visual campaigns use pale pastel minimalism on pedestals with water splashes, rendering the bottle anonymous.",
  },

  food_beverage: {
    industry_name: "Ẩm thực & Đồ uống (Food & Beverage)",
    category_conventions: [
      "Floating ingredients exploding symmetrically around the product package",
      "Sizzling pans, melting cheese pulls, dripping sauces",
      "Wooden cutting boards surrounded by whole garlic, herbs and sea salt",
      "Vibrant saturated colors with high-key fill lighting",
    ],
    consumer_expectations: [
      "Instant appetite appeal, mouthwatering freshness, flavor intensity",
      "Safety, clean ingredients, generous portion satisfaction",
    ],
    buying_motivations: [
      "Immediate craving gratification and hunger satisfaction",
      "Comfort food nostalgia and reward after exertion",
      "Healthy fuel and dietary alignment (low sugar, high protein)",
    ],
    typical_communication_patterns: [
      "Bite-and-smile taste celebration",
      "Fresh farm-to-table ingredient honesty",
      "Convenience and fast enjoyment messaging",
    ],
    overused_category_cliches: [
      "Symmetrical flying lettuce leaves, tomato slices and chili peppers",
      "Artificial water misting on vegetable skins to fake freshness",
      "Generic smiling families around a sterile dining table",
    ],
    category_visual_codes: [
      "Glistening oils, condensating glass, steam, sauce swirls, crunchy crusts",
      "Warm yellow/orange appetite spectrum, fresh green accents",
    ],
    whitespace_opportunities: [
      "Moody midnight dining and intimate culinary storytelling",
      "Hyper-minimalist product hero focus treating food as sculpture",
      "Documentary street-food grit and raw cultural authenticity",
      "Geometric modernism with stark architectural plating",
    ],
    common_trust_signals: [
      "Appetizing natural food texture without artificial plastic shine",
      "True-to-life ingredient proportions matching product contents",
    ],
    common_emotional_territories: [
      "Sensory indulgence and craveability",
      "Wholesome family warmth and sharing",
      "Bold energetic flavor adventure",
    ],
    category_claim_risks: [
      "Portion deception or misleading ingredient visual dominance",
    ],
    competitive_sameness_diagnosis:
      "Ingredient explosion collages around product packages have become so ubiquitous that viewers mentally screen them out as generic ads.",
  },

  fashion_apparel: {
    industry_name: "Thời trang & Phụ kiện (Fashion & Apparel)",
    category_conventions: [
      "Aloof models gazing off-camera in concrete brutalist architecture",
      "Wind-blown garments against stark outdoor cliffs or sand dunes",
      "Minimalist studio lookbooks with seamless paper rolls and harsh flash",
      "Monochromatic black-and-white editorial portraits",
    ],
    consumer_expectations: [
      "Fit, drape, fabric quality, tactile material richness",
      "Status affirmation, individuality, contemporary relevance",
    ],
    buying_motivations: [
      "Identity expression and aesthetic tribe signaling",
      "Occasion preparedness (workplace elegance, gala, streetwear)",
      "Sensory comfort and silhouette flattering",
    ],
    typical_communication_patterns: [
      "Seasonal collection unveils (SS/FW)",
      "Lookbook mood and attitude projection",
      "Craftsmanship, sustainable fabric or designer heritage claims",
    ],
    overused_category_cliches: [
      "Vacant model stares in front of crumbling industrial walls",
      "Pretentious avant-garde poses that obscure the actual garment fit",
      "Overly filtered grainy vintage film emulation",
    ],
    category_visual_codes: [
      "Woven weave textures, stitching detail, leather sheen, drape folds",
      "High-contrast editorial lighting or desaturated softbox portraits",
    ],
    whitespace_opportunities: [
      "Kinetic dynamic motion showing clothes living in real motion",
      "Vibrant joyful human warmth contrasting cold fashion aloofness",
      "Architectural still-life framing treating garments as kinetic sculptures",
      "Candid cultural documentary celebrating personal styling",
    ],
    common_trust_signals: [
      "Crisp fabric texture and accurate seam construction visibility",
      "True color fidelity under balanced lighting",
    ],
    common_emotional_territories: [
      "Effortless cool and understated confidence",
      "Daring avant-garde disruption",
      "Timeless heritage and bespoke prestige",
    ],
    category_claim_risks: [
      "Greenwashing sustainability claims without verified certification",
    ],
    competitive_sameness_diagnosis:
      "A prevailing convention of detached, unsmiling models in grey concrete settings makes different apparel labels look like the same lookbook.",
  },

  electronics_tech: {
    industry_name: "Công nghệ & Điện tử (Electronics & Technology)",
    category_conventions: [
      "Floating metallic devices against dark gradients with neon edge glows",
      "Exploded isometric views revealing chips, coils and circuit layers",
      "Sleek workspaces with minimal desk mats and ambient LED backlights",
      "Futuristic speed lines and abstract digital wave ripples",
    ],
    consumer_expectations: [
      "Cutting-edge performance, precision engineering, durability, speed",
      "Intuitive ergonomic comfort and seamless ecosystem synergy",
    ],
    buying_motivations: [
      "Productivity acceleration and professional capability upgrade",
      "Gaming immersion and latency elimination",
      "Social status and aesthetic desk-setup pride",
    ],
    typical_communication_patterns: [
      "Spec-sheet superiority benchmarks (Hz, GHz, mAh, mm thickness)",
      "Ecosystem integration and intelligence / AI enablement",
      "Durability torture tests and aerospace-grade material highlights",
    ],
    overused_category_cliches: [
      "Floating laptops or earbuds illuminated by generic blue/cyan neon",
      "Abstract glowing circuit lines spiraling around the chassis",
      "Sterile hand model touching a glass screen with particle sparks",
    ],
    category_visual_codes: [
      "Anodized aluminum, matte polycarbonate, Gorilla glass, chamfered edges",
      "Precision shadow cast, cool chromatic lighting, razor-sharp focus",
    ],
    whitespace_opportunities: [
      "Organic domestic integration: technology harmonizing with natural materials (linen, clay, timber)",
      "Tactile physical intimacy: showing human fingertips experiencing responsive feedback",
      "Poetic industrial design: quiet sculptures in warm architectural light",
      "Bold playful pop-color geometry rejecting aggressive gamer neon",
    ],
    common_trust_signals: [
      "Zero distortion on device ports, buttons and structural seams",
      "Accurate material finish (matte vs glossy vs brushed)",
    ],
    common_emotional_territories: [
      "Empowered productivity and seamless mastery",
      "Futuristic wonder and breakthrough excitement",
      "Quiet refined sophistication",
    ],
    category_claim_risks: [
      "Inflated performance metrics and misleading screen bezel renders",
    ],
    competitive_sameness_diagnosis:
      "The ubiquitous dark-blue-plus-cyan-neon floating render has turned hardware advertising into a sea of identical digital renders.",
  },

  fmcg: {
    industry_name: "Tiêu dùng nhanh (FMCG & Household)",
    category_conventions: [
      "Bold packshot in the dead center with bright saturated primary colors",
      "Giant promotional discount badges and exclamation bursts",
      "Split-screen comparison (dull before vs glowing clean after)",
      "Sunny kitchen or bathroom setups with smiling mothers",
    ],
    consumer_expectations: [
      "Reliable efficacy, family safety, everyday affordability, clean results",
      "Ease of use and clear functional dispensing",
    ],
    buying_motivations: [
      "Household hygiene reassurance and protection against germs/grime",
      "Economic value and long-lasting volume",
      "Convenience saving precious daily time",
    ],
    typical_communication_patterns: [
      "Direct problem-removal claims ('Sạch bóng 99.9%')",
      "Value bundles and discount promotions",
      "Sensory scent and freshness longevity promises",
    ],
    overused_category_cliches: [
      "Giant yellow starbursts screaming 'NEW / MỚI'",
      "Hyper-white clinical bathroom tiles with exaggerated CGI sparkle stars",
      "Overenthusiastic thumbs-up product endorsements",
    ],
    category_visual_codes: [
      "Plastic bottle silhouettes, ergonomic grips, pump dispensers, foam bubbles",
      "Bright cyan, lemon yellow, vibrant grass green",
    ],
    whitespace_opportunities: [
      "Premium aesthetic elevation: treating everyday utility with editorial dignity",
      "Sensory tranquil domesticity: peaceful home moments without chaotic badges",
      "Eco-design minimalism: honest cardboard and sustainable materiality",
      "Playful witty visual storytelling highlighting the joy of a clean space",
    ],
    common_trust_signals: [
      "Readable product claims, cap/nozzle fidelity, recognizable bottle shape",
    ],
    common_emotional_territories: [
      "Peace of mind and household protective care",
      "Vibrant cheerful refreshment",
      "Smart economical savvy",
    ],
    category_claim_risks: [
      "Exaggerated chemical efficacy or misleading antibacterial claims",
    ],
    competitive_sameness_diagnosis:
      "Loud primary colors and promotional discount starbursts reduce advertising to visual noise that consumers instinctively ignore.",
  },

  home_lifestyle: {
    industry_name: "Nhà cửa & Đời sống (Home & Lifestyle)",
    category_conventions: [
      "Airy sun-drenched Scandinavian living rooms with fiddle-leaf figs",
      "Beige linen couches with neutral ceramic vases and beige throws",
      "Overhead flat-lays of organized desks with notebooks and glasses",
    ],
    consumer_expectations: [
      "Comfort, durability, aesthetic harmony, functional organization",
    ],
    buying_motivations: [
      "Creating a personal sanctuary away from work stress",
      "Hosting pride and interior design self-expression",
      "Organized peace of mind and decluttered daily living",
    ],
    typical_communication_patterns: [
      "Warm sanctuary inspiration",
      "Material quality and ergonomic durability promises",
      "Smart space-saving and organizational solutions",
    ],
    overused_category_cliches: [
      "Indistinguishable all-beige Japandi or Scandinavian catalog rooms",
      "Perfect faux-candid morning sunlight slicing across hardwood floors",
    ],
    category_visual_codes: [
      "Natural woods, ceramics, woven wool, linen textures, warm ambient glow",
    ],
    whitespace_opportunities: [
      "Bold color-saturated eclectic living with personal eccentricities",
      "Cozy compact urban micro-apartments celebrating smart functionality",
      "Dramatic architectural night settings with moody sculptural lighting",
      "Lived-in warmth with authentic character rather than showroom sterility",
    ],
    common_trust_signals: [
      "Realistic material joints, true texture grain and natural shadow falloff",
    ],
    common_emotional_territories: [
      "Serene sanctuary and grounded restoration",
      "Warm convivial hospitality",
      "Curated creative individuality",
    ],
    category_claim_risks: [
      "Unverified eco-friendly or sustainable timber claims",
    ],
    competitive_sameness_diagnosis:
      "The universal adoption of the beige Japandi aesthetic has stripped lifestyle brands of distinctive personality.",
  },
};

/**
 * Normalizes industry query strings into canonical keys.
 */
export function normalizeIndustryKey(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") return "other";
  const norm = raw.trim().toLowerCase().replace(/[-_\s]+/g, "_");

  if (norm.includes("coffee") || norm.includes("tea") || norm.includes("cafe") || norm.includes("cà_phê") || norm.includes("tra")) {
    return "coffee_tea";
  }
  if (norm.includes("beauty") || norm.includes("skincare") || norm.includes("cosmetic") || norm.includes("mỹ_phẩm") || norm.includes("da")) {
    return "beauty_skincare";
  }
  if (norm.includes("food") || norm.includes("beverage") || norm.includes("f&b") || norm.includes("ăn_uống") || norm.includes("ẩm_thực")) {
    return "food_beverage";
  }
  if (norm.includes("fashion") || norm.includes("apparel") || norm.includes("clothing") || norm.includes("thời_trang")) {
    return "fashion_apparel";
  }
  if (norm.includes("tech") || norm.includes("electronic") || norm.includes("device") || norm.includes("công_nghệ") || norm.includes("điện_tử")) {
    return "electronics_tech";
  }
  if (norm.includes("fmcg") || norm.includes("household") || norm.includes("tiêu_dùng") || norm.includes("gia_dụng")) {
    return "fmcg";
  }
  if (norm.includes("home") || norm.includes("lifestyle") || norm.includes("furniture") || norm.includes("nhà_cửa") || norm.includes("nội_thất")) {
    return "home_lifestyle";
  }

  return "other";
}

/**
 * Resolves the structured IndustryLandscape for a given industry.
 *
 * If the industry matches our curated knowledge base, it returns that landscape with
 * `internal_knowledge` provenance. If unknown or custom, it constructs a reasoned,
 * robust landscape baseline with `model_inference` or `user_supplied` provenance.
 */
export function resolveIndustryLandscape(
  rawIndustry: string | undefined | null,
  options?: {
    productName?: string;
    concept?: string;
    userSupplied?: string;
  }
): IndustryLandscape {
  const normKey = normalizeIndustryKey(rawIndustry);
  const known = INDUSTRY_KNOWLEDGE_BASE[normKey];

  if (known) {
    return {
      ...known,
      industry_id: normKey,
      provenance: "internal_knowledge",
    };
  }

  // Fallback for custom or unlisted industry
  const displayName = rawIndustry && rawIndustry.trim() ? rawIndustry.trim() : "Thương mại & Dịch vụ (Commercial & Lifestyle)";
  return {
    industry_id: normKey,
    industry_name: displayName,
    provenance: "model_inference",
    category_conventions: [
      "Standard studio packshots with conventional frontal lighting",
      "Feature-oriented benefit claims displayed beside the hero product",
      "Clean, safe corporate color grading aligned with common category standards",
    ],
    consumer_expectations: [
      "Functional reliability and authentic product delivery",
      "Clear value proposition without deceptive advertising",
    ],
    buying_motivations: [
      "Solving an immediate practical friction or fulfilling a personal desire",
      "Trust in brand reputation and consistent quality",
    ],
    typical_communication_patterns: [
      "Direct feature-benefit product introduction",
      "Targeted lifestyle scenario showing everyday product application",
    ],
    overused_category_cliches: [
      "Generic studio backdrops with centered products in empty voids",
      "Overly bright commercial smile imagery lacking authentic narrative",
    ],
    category_visual_codes: [
      "Clean product presentation, legible branding, balanced contrast",
    ],
    whitespace_opportunities: [
      "Deep emotional storytelling focusing on the human transformation",
      "Unexpected art direction contrasting safe corporate presentation",
      "Tactile, sensory immersion bringing product interaction alive",
    ],
    common_trust_signals: [
      "Accurate product proportions, authentic materials and clear labeling",
    ],
    common_emotional_territories: [
      "Confidence, peace of mind, progressive empowerment, satisfaction",
    ],
    category_claim_risks: [
      "Unverified performance claims or hyperbolic marketing language",
    ],
    competitive_sameness_diagnosis:
      "Without a sharp creative angle, commercial products default to generic studio shots that lack emotional resonance.",
  };
}

/**
 * Distills the industry landscape into a concise, high-signal briefing block
 * designed specifically for the Creative Director.
 *
 * CRITICAL RULE:
 * This brief teaches the director what the category LANDSCAPE is.
 * It strictly warns the director NOT to adopt category clichés as templates.
 */
export function renderIndustryLandscapeForDirector(landscape: IndustryLandscape): string {
  const lines: string[] = [
    `[INDUSTRY LANDSCAPE CONTEXT — ${landscape.industry_name.toUpperCase()}]`,
    `Provenance: ${landscape.provenance}`,
    "",
    "1. CATEGORY CONVENTIONS (What is normal in this market):",
    ...landscape.category_conventions.map((c) => `  * ${c}`),
    "",
    "2. OVERUSED CATEGORY CLICHÉS (Traps that cause brand invisibility):",
    ...landscape.overused_category_cliches.map((c) => `  * Avoid defaulting to: ${c}`),
    "",
    "3. WHITESPACE OPPORTUNITIES (Underused creative territories):",
    ...landscape.whitespace_opportunities.map((w) => `  * Opportunity: ${w}`),
    "",
    "4. CONSUMER REALITY & DESIRED EMOTION:",
    `  * Core buying motivation: ${landscape.buying_motivations.join("; ")}`,
    `  * Dominant emotional territories: ${landscape.common_emotional_territories.join("; ")}`,
    "",
    "5. COMPETITIVE SAMENESS WARNING:",
    `  * ${landscape.competitive_sameness_diagnosis}`,
    "",
    "DIRECTIVE FOR CREATIVE DIRECTION:",
    "Treat the category context above as a commercial landscape, NEVER as a styling template.",
    "You may RESPECT, REINTERPRET, CONTRAST, DISRUPT, or DELIBERATELY IGNORE category conventions",
    "depending on the user concept, product truth and brand character. Make your choice intentional.",
  ];

  return lines.join("\n");
}
