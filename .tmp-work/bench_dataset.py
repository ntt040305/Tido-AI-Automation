# -*- coding: utf-8 -*-
"""Emit the Phase 3.1.5 creative benchmark dataset: 30 cases, 5 per industry."""
import io, json, collections

CASES = []


def C(cid, industry, challenge, chal_text, brand, product, audience, objective,
      channel, tone, concept, brand_info, assets, must_address, must_avoid,
      weighted, notes=None):
    case = {
        "case_id": cid,
        "industry": industry,
        "challenge": challenge,
        "creative_challenge": chal_text,
        "brief": {
            "brand": brand, "product": product, "audience": audience,
            "objective": objective, "channel": channel, "tone": tone,
            "industry": industry.replace("_", " "),
            "concept": concept, "brandInfo": brand_info, "assetTypes": assets,
        },
        "criteria": {
            "must_address": must_address,
            "must_avoid": must_avoid,
            "weighted_dimensions": weighted,
        },
    }
    if notes:
        case["notes"] = notes
    CASES.append(case)


# ══════════════ BEAUTY ══════════════
C("bench.beauty.claim_fatigue.001", "beauty", "CLAIM_FATIGUE",
  "The audience has been promised brightening by every brand for a decade and has stopped believing the category.",
  "Lumiere", "Tone brightening capsule ampoule", "Women 30 to 45 who buy premium skincare and read ingredient lists",
  "Product launch", "Instagram", "Premium, clinical, quietly luxurious",
  "Proof you can see, in a form you want to hold",
  "Dermatologist-founded, sells on evidence rather than aspiration, no celebrity endorsement",
  ["poster"],
  ["The audience's exhaustion with unverifiable brightening claims",
   "Why this evidence is different from the evidence they have already dismissed",
   "A reason to trust that does not depend on a before-and-after image"],
  ["glowing model face", "water splash", "before and after split", "radiant skin"],
  ["originality", "audience_understanding", "differentiation", "brand_fit"])

C("bench.beauty.regulated_claim.002", "beauty", "REGULATED_CLAIM",
  "A mandatory efficacy qualifier and a full ingredient list compete with the creative for the same panel area.",
  "Aera", "Retinal night serum 0.1 percent", "Women 35 to 50 starting retinoids for the first time",
  "Awareness and education", "Print", "Reassuring, expert, unhurried",
  "The strong one, explained properly",
  "Pharmacy-channel brand, legally required to carry usage warnings on pack front",
  ["poster"],
  ["The first-time user's fear of irritation, which is the real barrier to purchase",
   "How the required warning is presented without reading as danger",
   "Space reserved for the qualifier before the layout is fixed"],
  ["laboratory beaker", "molecule graphic", "clinical white void", "scientist in a coat"],
  ["clarity", "feasibility", "typography", "positioning"],
  "Tests whether either pipeline plans for mandatory content rather than retrofitting it.")

C("bench.beauty.parity_product.003", "beauty", "PARITY_PRODUCT",
  "The formula is functionally identical to four competitors at the same price point.",
  "Muoi", "Hyaluronic hydrating essence", "Vietnamese women 25 to 35 in urban centres",
  "Conversion, drive first purchase", "TikTok", "Warm, honest, unglamorous",
  "The one that admits it is the same, and is cheaper about it",
  "Direct-to-consumer, no retail presence, competes on candour rather than claim",
  ["social_ad"],
  ["Why a shopper should pick a chemically identical product",
   "A position built on something other than the formula",
   "Survival at feed thumbnail scale"],
  ["dewy droplet", "glass skin", "premium minimal void", "clinical authority"],
  ["differentiation", "originality", "composition", "business_alignment"])

C("bench.beauty.price_justification.004", "beauty", "PRICE_JUSTIFICATION",
  "A four hundred dollar cream must justify its price before the price is read.",
  "Tho", "Fermented rice ferment cream", "Affluent women 40 plus who already own luxury skincare",
  "Rebranding and repositioning upward", "Print", "Restrained, heritage, confident",
  "Slow is the ingredient",
  "Family producer, single fermentation site, ninety-day process, no mass distribution",
  ["poster"],
  ["What justifies the price other than the price itself",
   "Provenance made visible rather than asserted",
   "Restraint as a positioning signal, not an absence of design"],
  ["gold foil", "jewel imagery", "marble surface", "silk drape"],
  ["positioning", "brand_fit", "composition", "consistency"])

C("bench.beauty.attention_hostile.005", "beauty", "ATTENTION_HOSTILE",
  "The asset is seen for under a second in a feed, at a fraction of its design size.",
  "Sao", "SPF 50 daily fluid", "Gen Z students and first-jobbers in Ho Chi Minh City",
  "Awareness, build category habit", "TikTok", "Direct, funny, local",
  "The step you skip that costs the most",
  "Youth brand, price-accessible, sells through marketplaces only",
  ["social_ad"],
  ["What survives at fifteen percent of canvas size",
   "One message rather than three",
   "A reason to care that is not future damage"],
  ["beach imagery", "sun flare", "smiling model", "UV ray diagram"],
  ["composition", "clarity", "typography", "business_alignment"])

# ══════════════ FOOD AND BEVERAGE ══════════════
C("bench.food_beverage.category_cliche.006", "food_beverage", "CATEGORY_CLICHE",
  "Every competitor uses steam, pour and bean close-ups, so the category is visually interchangeable.",
  "Nha Rang", "Single origin cold brew", "Gen Z office workers in Ho Chi Minh City",
  "New store launch, drive footfall", "TikTok", "Warm, local, unpretentious",
  "The street corner that got good at coffee",
  "Two-location roaster, sources from Da Lat, no export ambition",
  ["social_ad"],
  ["A visual idea the category has not already exhausted",
   "The specific street-level context this brand actually occupies",
   "A footfall driver rather than a brand mood piece"],
  ["steam rising", "latte art top-down", "coffee beans scattered", "pour shot"],
  ["originality", "differentiation", "composition", "business_alignment"])

C("bench.food_beverage.regulated_claim.007", "food_beverage", "REGULATED_CLAIM",
  "A nutrition panel and an allergen list must stay legible on a small pack front.",
  "Com", "Reduced sugar rice cracker", "Parents 30 to 45 buying snacks for children",
  "Retail listing, drive shelf trial", "Print", "Straightforward, trustworthy, warm",
  "Less sugar, said plainly",
  "Supermarket brand, mid-price, competes with an established leader",
  ["poster"],
  ["Comparison against the category leader at shelf",
   "A nutrition panel that is genuinely readable at arm's length",
   "A parent's actual decision criterion rather than a brand mood"],
  ["cartoon mascot", "rainbow palette", "child laughing", "cornfield"],
  ["clarity", "typography", "feasibility", "business_alignment"])

C("bench.food_beverage.local_adaptation.008", "food_beverage", "LOCAL_ADAPTATION",
  "A global brand system must carry Vietnamese copy without breaking its own typographic rules.",
  "Verde", "Sparkling botanical water", "Urban professionals 25 to 40 in Hanoi",
  "Market entry", "Instagram", "Clean, European, precise",
  "Imported taste, local table",
  "European brand entering Vietnam, global identity fixed by head office",
  ["banner"],
  ["Vietnamese diacritics set correctly within the fixed global system",
   "A local reason to switch from an established local drink",
   "The tension between imported credibility and local relevance"],
  ["mountain spring", "water splash", "lime slice", "generic freshness"],
  ["typography", "clarity", "brand_fit", "consistency"],
  "The Vietnamese vertical constraint is the discriminating detail here.")

C("bench.food_beverage.price_justification.009", "food_beverage", "PRICE_JUSTIFICATION",
  "A tasting menu at triple the local average has to read as worth it before the price appears.",
  "Bep Mo", "Twelve-course seasonal tasting menu", "Affluent diners 35 plus and visiting business travellers",
  "Awareness, drive reservations", "Print", "Quiet, precise, seasonal",
  "Twelve decisions, made for you",
  "Chef-owned, sixteen covers, sources within eighty kilometres",
  ["poster"],
  ["What the price buys that a cheaper meal does not",
   "Restraint appropriate to the price point",
   "A reservation-driving action that does not read as promotional"],
  ["plated food close-up", "chef portrait", "candlelight", "wine glass"],
  ["positioning", "composition", "brand_fit", "consistency"])

C("bench.food_beverage.attention_hostile.010", "food_beverage", "ATTENTION_HOSTILE",
  "A delivery-app banner competes with fourteen other banners in a scrolling row.",
  "Pho 24h", "Late night pho delivery", "Shift workers and students ordering after 10pm",
  "Conversion, increase late night orders", "Facebook", "Fast, plain, useful",
  "Open when nothing else is",
  "Delivery-only kitchen, no dine-in, competes purely on availability",
  ["banner"],
  ["The single fact that makes this the right choice at 2am",
   "Legibility inside a crowded scrolling row",
   "One action rather than a brand story"],
  ["steaming bowl", "herb garnish", "family table", "traditional pattern"],
  ["clarity", "composition", "business_alignment", "typography"])

# ══════════════ FASHION ══════════════
C("bench.fashion.category_cliche.011", "fashion", "CATEGORY_CLICHE",
  "Every local competitor shoots the same white-studio look, so the brand is unplaceable.",
  "Kho", "Oversized linen shirting collection", "Women 25 to 35 who buy considered basics",
  "Collection launch", "Instagram", "Understated, tactile, unbranded",
  "Clothes that get better wrong",
  "Small label, six styles per season, no logo on any garment",
  ["poster"],
  ["A visual world the category has not already occupied",
   "The garment as the message rather than the setting",
   "Type kept subordinate to image"],
  ["white studio cyclorama", "model mid-stride", "flat lay grid", "urban street candid"],
  ["originality", "composition", "differentiation", "consistency"])

C("bench.fashion.parity_product.012", "fashion", "PARITY_PRODUCT",
  "The garment is a plain white t-shirt, identical in specification to every competitor.",
  "Bang", "Heavyweight cotton t-shirt", "Men 20 to 35 buying wardrobe staples",
  "Conversion", "Instagram", "Plain, factual, no-nonsense",
  "The last one you need to buy",
  "Single product brand, one colour, one weight, sold direct",
  ["product_hero"],
  ["A position a competitor with an identical garment could not claim",
   "Something concrete rather than a quality adjective",
   "A hero treatment for a product with no visual distinctiveness"],
  ["model in an alley", "brand tag close-up", "folded stack", "moody monochrome"],
  ["differentiation", "originality", "composition", "clarity"])

C("bench.fashion.price_justification.013", "fashion", "PRICE_JUSTIFICATION",
  "A locally made coat priced above imported equivalents must justify the premium.",
  "Ao Dai Moi", "Hand-finished wool overcoat", "Women 35 plus buying investment outerwear",
  "Rebranding", "Print", "Refined, local, quietly proud",
  "Made here, and it shows",
  "Hanoi atelier, eleven makers, forty hours per coat",
  ["poster"],
  ["Why local production commands more, not less",
   "Craft made visible rather than claimed",
   "Restraint consistent with the price"],
  ["heritage sepia", "sewing machine detail", "hands stitching", "flag imagery"],
  ["positioning", "brand_fit", "photography", "consistency"])

C("bench.fashion.attention_hostile.014", "fashion", "ATTENTION_HOSTILE",
  "A product listing grid puts the garment against forty others at thumbnail size.",
  "Sen", "Silk slip dress in six colourways", "Women 22 to 32 shopping on mobile",
  "Conversion", "Instagram", "Soft, contemporary, easy",
  "One shape, six moods",
  "Marketplace-first brand, no owned retail, competes inside a grid",
  ["thumbnail"],
  ["Recognition inside a forty-item grid",
   "Colourway variation that reads as a range rather than as noise",
   "A consistent element position across every variant"],
  ["runway walk", "editorial pose", "beach setting", "flower crown"],
  ["composition", "consistency", "clarity", "business_alignment"])

C("bench.fashion.local_adaptation.015", "fashion", "LOCAL_ADAPTATION",
  "A Tet campaign must feel seasonal without using the same red and gold as every competitor.",
  "Non", "Lunar new year capsule collection", "Families and gift buyers 25 to 50",
  "Seasonal, drive gifting", "Facebook", "Celebratory, modern, family-centred",
  "New year, not new clothes",
  "Contemporary label, deliberately avoids traditional motifs",
  ["banner"],
  ["Seasonality signalled without the category's default palette",
   "A gifting motivation rather than a self-purchase one",
   "Local relevance without pastiche"],
  ["red and gold", "peach blossom", "lucky envelope", "lion dance"],
  ["originality", "color_direction", "brand_fit", "differentiation"])

# ══════════════ HOSPITALITY ══════════════
C("bench.hospitality.category_cliche.016", "hospitality", "CATEGORY_CLICHE",
  "Every boutique hotel in the market advertises with the same infinity pool at sunset.",
  "Nha Vuon", "Twelve-room garden hotel", "Couples 30 to 45 booking a weekend away",
  "Awareness, drive direct bookings", "Instagram", "Calm, green, unhurried",
  "The garden was here first",
  "Converted family house, no pool, twelve rooms, direct booking only",
  ["poster"],
  ["A property with no pool competing in a pool-led category",
   "The specific asset this hotel actually has",
   "Direct booking rather than aggregator traffic"],
  ["infinity pool", "sunset silhouette", "cocktail on a ledge", "rooftop view"],
  ["originality", "differentiation", "photography", "business_alignment"])

C("bench.hospitality.attention_hostile.017", "hospitality", "ATTENTION_HOSTILE",
  "The menu is read in a dim room, in conversation, by a diner who will not study it.",
  "Muoi Bien", "Coastal seafood menu", "Groups of four to six, mixed local and visiting",
  "Conversion, raise average order value", "Print", "Relaxed, coastal, generous",
  "Everything came in this morning",
  "Sixty covers, low lighting by design, menu changes daily",
  ["poster"],
  ["Legibility at the room's actual light level",
   "Prices that can be compared in one vertical pass",
   "Daily change signalled without reprinting the whole menu"],
  ["nautical rope", "chalkboard texture", "fishing boat", "wave pattern"],
  ["typography", "clarity", "feasibility", "composition"])

C("bench.hospitality.local_adaptation.018", "hospitality", "LOCAL_ADAPTATION",
  "A bilingual menu must serve Vietnamese and English diners without either reading as secondary.",
  "Com Nha", "Family-style Vietnamese menu", "Local families and international visitors in equal share",
  "Awareness and conversion", "Print", "Welcoming, familiar, unfussy",
  "The food we actually eat",
  "Neighbourhood restaurant, half its covers are tourists, half are regulars",
  ["poster"],
  ["Two languages presented as equally intended",
   "Vietnamese set with correct vertical allowance",
   "Dish names that do not need translating away"],
  ["tourist iconography", "conical hat", "lantern imagery", "street food montage"],
  ["typography", "clarity", "brand_fit", "consistency"])

C("bench.hospitality.price_justification.019", "hospitality", "PRICE_JUSTIFICATION",
  "A resort suite at four times the local rate must read as worth it in one frame.",
  "Bien Xanh", "Private beach villa", "Affluent couples and families booking long stays",
  "Awareness", "Print", "Spacious, quiet, private",
  "Nobody else is on this beach",
  "Eight villas across two kilometres of private shoreline",
  ["poster"],
  ["Privacy as the thing being sold, not luxury finishes",
   "Restraint appropriate to the rate",
   "Scale communicated without a wide-angle distortion"],
  ["champagne on sand", "couple silhouette", "aerial drone sweep", "palm frond"],
  ["positioning", "photography", "composition", "brand_fit"])

C("bench.hospitality.parity_product.020", "hospitality", "PARITY_PRODUCT",
  "The hotel is one of eleven three-star properties on the same street with identical rooms.",
  "Pho Co", "Three-star city hotel, forty rooms", "Business travellers booking one or two nights",
  "Conversion, reduce aggregator dependence", "Facebook", "Practical, honest, efficient",
  "The one that gets you out the door by seven",
  "No restaurant, no spa, competes on speed of check-in and location",
  ["banner"],
  ["A claim the ten identical hotels next door cannot make",
   "The business traveller's real criterion",
   "Direct booking rather than aggregator listing"],
  ["lobby chandelier", "made bed close-up", "city skyline", "smiling receptionist"],
  ["differentiation", "audience_understanding", "clarity", "business_alignment"])

# ══════════════ TECHNOLOGY ══════════════
C("bench.technology.parity_product.021", "technology", "PARITY_PRODUCT",
  "The product does what four funded competitors do, at the same price, with the same integrations.",
  "Ghi", "Team note-taking and search tool", "Product and engineering teams of ten to fifty",
  "Conversion, drive trial signups", "Instagram", "Plain, fast, unhyped",
  "Finds the thing you wrote and forgot",
  "Bootstrapped, four people, no enterprise sales motion",
  ["social_ad"],
  ["A claim the funded competitors cannot make",
   "A concrete capability rather than a category adjective",
   "Trial signup as the action"],
  ["abstract network graphic", "glowing brain", "diverse team laughing", "gradient mesh"],
  ["differentiation", "clarity", "originality", "business_alignment"])

C("bench.technology.claim_fatigue.022", "technology", "CLAIM_FATIGUE",
  "The audience has seen every product in the category claim to be AI-powered this year.",
  "Nen", "Automated expense reconciliation", "Finance managers at companies of fifty to three hundred",
  "Awareness", "Facebook", "Sober, specific, unexcitable",
  "It reconciles. That is the whole product.",
  "Sells to finance teams who are accountable for errors",
  ["banner"],
  ["Credibility with an audience exhausted by AI claims",
   "A specific outcome rather than a capability claim",
   "The buyer's personal accountability for errors"],
  ["robot imagery", "neural network", "glowing circuit", "futuristic interface"],
  ["originality", "audience_understanding", "clarity", "differentiation"])

C("bench.technology.attention_hostile.023", "technology", "ATTENTION_HOSTILE",
  "A developer-audience banner is served next to content the reader actually came for.",
  "Cau", "API monitoring and alerting", "Backend engineers and platform teams",
  "Conversion", "Facebook", "Technical, precise, no marketing voice",
  "Know before your users tell you",
  "Developer tool, sells bottom-up, marketing voice is a liability",
  ["banner"],
  ["Credibility with an audience that distrusts marketing language",
   "Technical signal carried by typography rather than by claim",
   "Legibility beside unrelated content"],
  ["stock photo developer", "hoodie hacker", "matrix code rain", "abstract cloud"],
  ["typography", "clarity", "brand_fit", "differentiation"])

C("bench.technology.price_justification.024", "technology", "PRICE_JUSTIFICATION",
  "An enterprise tier at ten times the self-serve price must read as a different product.",
  "Khoa", "Enterprise access governance platform", "Security and compliance leads at regulated firms",
  "Awareness, generate qualified enquiries", "Print", "Serious, exact, institutional",
  "The audit is the product",
  "Sells into regulated industries, buyer is personally accountable in an audit",
  ["poster"],
  ["What the tier buys that the self-serve product does not",
   "Institutional seriousness without generic corporate imagery",
   "A qualified enquiry rather than a signup"],
  ["padlock icon", "shield graphic", "handshake photo", "glass office tower"],
  ["positioning", "brand_fit", "clarity", "consistency"])

C("bench.technology.local_adaptation.025", "technology", "LOCAL_ADAPTATION",
  "An interface screenshot must display Vietnamese text without breaking the product's own type system.",
  "Buoc", "Field service scheduling app", "Operations managers at Vietnamese logistics firms",
  "Market entry", "Instagram", "Practical, local, unpretentious",
  "Built for the routes you actually run",
  "Local product, interface is Vietnamese-first rather than translated",
  ["social_ad"],
  ["Vietnamese interface text set with correct vertical allowance",
   "A local operational reality rather than a translated global pitch",
   "Interface legibility inside a marketing asset"],
  ["generic dashboard mockup", "world map", "delivery truck stock photo", "gradient hero"],
  ["typography", "clarity", "brand_fit", "feasibility"])

# ══════════════ REAL ESTATE ══════════════
C("bench.real_estate.category_cliche.026", "real_estate", "CATEGORY_CLICHE",
  "Every developer in the market uses the same aerial render with a sunset gradient.",
  "Ben", "Riverside apartment development", "First-time buyers 28 to 40 with dual incomes",
  "Awareness, drive showroom visits", "Facebook", "Grounded, factual, optimistic",
  "You will live on the third floor, not in the render",
  "Mid-market developer, honest about specification, competes with luxury-positioned rivals",
  ["banner"],
  ["A first-time buyer's actual scepticism about renders",
   "A visual approach the category has not exhausted",
   "Showroom visits rather than brand awareness"],
  ["aerial render", "sunset gradient", "couple on a balcony", "infinity pool"],
  ["originality", "differentiation", "audience_understanding", "business_alignment"])

C("bench.real_estate.regulated_claim.027", "real_estate", "REGULATED_CLAIM",
  "Price, area and legal status must all appear and stay comparable across listings.",
  "Dat Viet", "Townhouse listings, forty units", "Buyers 35 to 55 comparing across developments",
  "Conversion", "Print", "Factual, transparent, unembellished",
  "Every number, in the same place, every time",
  "Agency selling forty comparable units, buyers compare across four developments",
  ["poster"],
  ["Price and area presented so unit value can be computed",
   "A fixed field order that supports cross-listing comparison",
   "Legal status stated rather than implied"],
  ["luxury lifestyle imagery", "keys in hand", "family moving in", "gold accents"],
  ["clarity", "typography", "feasibility", "consistency"])

C("bench.real_estate.price_justification.028", "real_estate", "PRICE_JUSTIFICATION",
  "A penthouse at a market-leading price must justify itself without listing amenities.",
  "Thap", "Two penthouse units, top floor", "Ultra high net worth buyers, mostly through brokers",
  "Awareness among a very small audience", "Print", "Severe, restrained, confident",
  "There are two",
  "Two units only, sold through three brokers, no public showroom",
  ["poster"],
  ["Scarcity as the argument rather than specification",
   "Extreme restraint consistent with the price",
   "A broker-mediated audience rather than a public one"],
  ["amenity list", "marble bathroom", "city lights at night", "champagne"],
  ["positioning", "composition", "brand_fit", "consistency"])

C("bench.real_estate.attention_hostile.029", "real_estate", "ATTENTION_HOSTILE",
  "A listing thumbnail competes in a portal grid where every entry looks the same.",
  "Nha Pho", "Two-bedroom resale apartments", "Buyers and renters browsing a listings portal",
  "Conversion, drive enquiries", "Facebook", "Plain, quick, useful",
  "The one fact that decides it",
  "Resale agency, listings appear in a portal grid alongside competitors",
  ["thumbnail"],
  ["Recognition inside a uniform portal grid",
   "The single decisive fact surfaced first",
   "Legibility at portal thumbnail size"],
  ["wide-angle living room", "staged furniture", "floor plan overlay", "agent portrait"],
  ["composition", "clarity", "typography", "business_alignment"])

C("bench.real_estate.local_adaptation.030", "real_estate", "LOCAL_ADAPTATION",
  "District naming and Vietnamese address conventions must lead, ahead of the street address.",
  "Quan", "Serviced apartments for lease", "Expatriate and domestic professionals relocating",
  "Awareness and conversion", "Instagram", "Clear, local, service-minded",
  "Named the way you will search for it",
  "Leasing agency, bilingual audience, buyers search by district first",
  ["social_ad"],
  ["District-led naming matching how buyers actually search",
   "Bilingual presentation with neither language secondary",
   "Vietnamese set with correct vertical allowance"],
  ["skyline panorama", "generic lobby", "map pin graphic", "suitcase imagery"],
  ["typography", "clarity", "audience_understanding", "brand_fit"])


# ── Invariants ───────────────────────────────────────────────────────────
by_industry = collections.Counter(c["industry"] for c in CASES)
assert len(CASES) == 30, "expected 30 cases, got %d" % len(CASES)
assert len(by_industry) == 6, "expected 6 industries, got %d" % len(by_industry)
for ind, n in by_industry.items():
    assert n == 5, "%s has %d cases, expected 5" % (ind, n)
ids = [c["case_id"] for c in CASES]
assert len(set(ids)) == len(ids), "duplicate case_id"
challenges = collections.Counter(c["challenge"] for c in CASES)
assert len(challenges) >= 6, "challenge kinds too concentrated: %s" % challenges

data = {"dataset_id": "cios_creative_benchmark", "version": "v1", "cases": CASES}
out = "data/benchmarks/creative_benchmark_v1.json"
io.open(out, "w", encoding="utf-8").write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print("wrote %d cases -> %s" % (len(CASES), out))
print("by industry:", dict(by_industry))
print("by challenge:", dict(challenges))
