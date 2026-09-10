# -*- coding: utf-8 -*-
"""Phase 4.0.2 — 100 campaign briefs for creative concept evaluation.

Separate from creative_benchmark_v1, which exists to compare CIOS against a
baseline pipeline. This set exists to measure concept quality alone, so every
brief carries the one field the older set kept in its case wrapper rather than in
the brief itself: a statement of what the work is up against.
"""
import io, json, collections

CASES = []


def B(bid, industry, brand, product, audience, objective, channel, tone,
      concept, challenge, avoid):
    CASES.append({
        "case_id": bid,
        "industry": industry,
        "creative_challenge": challenge,
        "must_avoid": avoid,
        "brief": {
            "brand": brand, "product": product, "audience": audience,
            "objective": objective, "channel": channel, "tone": tone,
            "industry": industry.replace("_", " "), "concept": concept,
            "creativeChallenge": challenge,
        },
    })


# ─────────────── BEAUTY (15) ───────────────
BEAUTY = [
 ("claim_fatigue", "Lumiere", "Tone brightening ampoule", "Women 30 to 45 who buy premium skincare", "Product launch", "Instagram", "Premium, clinical, quietly luxurious", "Proof you can see",
  "The audience has been promised brightening by every brand for a decade and has stopped believing the category entirely.",
  ["glowing model face", "water splash", "before and after"]),
 ("ageing_identity", "Tho", "Fermented rice cream", "Affluent women 45 plus", "Rebranding", "Print", "Restrained, heritage, confident", "Slow is the ingredient",
  "Mature buyers reject correction language because it frames the face they have now as a defect to be undone.",
  ["clock imagery", "reversal language", "wrinkle close-up"]),
 ("price_guilt", "Aera", "Retinal night serum", "Women 35 to 50 with high disposable income", "Conversion", "Instagram", "Expert, reassuring, unhurried", "The strong one, explained",
  "She can afford the product and still feels that spending this much on her own face is indefensible to anyone who asks.",
  ["gold foil", "jewel imagery", "luxury cliche"]),
 ("sensitive_fear", "Muoi", "Barrier repair essence", "Women 25 to 40 with reactive skin", "Awareness", "TikTok", "Gentle, factual, calm", "Nothing added that you did not ask for",
  "Her skin has reacted badly before, and the memory of that outweighs any improvement a new product could promise.",
  ["clinical white void", "irritation photography", "fear messaging"]),
 ("male_entry", "Sao", "Daily face fluid for men", "Men 25 to 40 new to skincare", "Product launch", "TikTok", "Plain, unfussy, direct", "It takes ten seconds",
  "He would use the product and will not be seen choosing it, so the barrier is the aisle rather than the routine.",
  ["dark masculine packaging", "gym imagery", "performance language"]),
 ("routine_fatigue", "Nen", "Three step simplified set", "Women 25 to 35 with abandoned products", "Conversion", "Instagram", "Honest, light, unpreachy", "Fewer things, finished",
  "She has three half-used bottles in a drawer and every new purchase carries the memory of the last one she gave up on.",
  ["ten step routine", "shelfie imagery", "perfectionism"]),
 ("ingredient_literacy", "Cot", "Niacinamide concentrate", "Women 25 to 35 who research before buying", "Awareness", "Instagram", "Peer to peer, informed, unpatronising", "You already know this part",
  "She has done the reading and every brand still explains the basics to her as though she had not.",
  ["ingredient explainer", "science graphic", "beginner framing"]),
 ("gift_risk", "Hoa", "Skincare gift set", "Partners buying for women 30 plus", "Seasonal", "Facebook", "Warm, safe, generous", "A gift that says nothing about her face",
  "He wants to buy her skincare and is afraid the gift will read as a comment on how she looks.",
  ["before and after", "problem solution", "corrective language"]),
 ("sun_prevention", "Ngay", "Daily SPF fluid", "Gen Z students in Ho Chi Minh City", "Awareness", "TikTok", "Funny, direct, local", "The step you skip",
  "Prevention leaves no evidence, so the product that works best is the one she is least able to notice working.",
  ["beach imagery", "UV diagram", "damage photography"]),
 ("local_climate", "Am", "Humidity adapted moisturiser", "Vietnamese women 25 to 40", "Market entry", "Instagram", "Local, practical, warm", "Made for this weather",
  "She is using products formulated for a temperate climate and experiences that as the product simply not working here.",
  ["imported luxury cues", "snow imagery", "generic hydration"]),
 ("clinical_trust", "Xac", "Prescription strength serum", "Women 30 to 50 in pharmacy channel", "Awareness", "Print", "Sober, accountable, exact", "Somebody's name is on this",
  "She is asked to trust an institution, and institutions have been wrong about this category before.",
  ["stock scientist", "laboratory beaker", "anonymous expert"]),
 ("shade_range", "Mau", "Foundation in twenty shades", "Women 20 to 40 across skin tones", "Product launch", "Instagram", "Inclusive without announcing it", "Yours is in there",
  "She has been let down by ranges that claimed inclusivity and stocked four shades, so she no longer believes the claim.",
  ["diverse model grid", "inclusivity slogan", "swatch wall"]),
 ("parity_formula", "Bang", "Hyaluronic essence", "Women 25 to 35 buying direct", "Conversion", "TikTok", "Candid, unglamorous, plain", "The same thing, said honestly",
  "The formula is chemically identical to four competitors at the same price, and she knows it.",
  ["dewy droplet", "glass skin", "premium minimal void"]),
 ("regulated_claim", "Duoc", "Medicated acne treatment", "Teenagers and parents", "Awareness", "Print", "Clear, careful, unfrightening", "What it will and will not do",
  "A required warning and a full ingredient list compete with the message for the same small panel.",
  ["dramatic before after", "shame imagery", "miracle language"]),
 ("refill_habit", "Vong", "Refillable cleanser", "Women 25 to 40 who care about waste", "Retention", "Instagram", "Practical, unsanctimonious", "The bottle you keep",
  "She wants to waste less and has learned that refill systems are usually more effort than they are worth.",
  ["green leaf imagery", "earth messaging", "guilt framing"]),
]
for k, *rest in BEAUTY:
    B("cb.beauty.%s.001" % k, "beauty", *rest)

# ─────────────── FOOD & BEVERAGE (15) ───────────────
FOOD = [
 ("category_cliche", "Nha Rang", "Single origin cold brew", "Gen Z office workers", "New store launch", "TikTok", "Warm, local, unpretentious", "The corner that got good",
  "Every competitor uses steam, pour and bean close-ups, so the whole category looks like one brand.",
  ["steam rising", "latte art", "coffee beans scattered"]),
 ("late_night", "Pho 24h", "Late night pho delivery", "Shift workers ordering after ten", "Conversion", "Facebook", "Fast, plain, useful", "Open when nothing else is",
  "At two in the morning she does not want the best food, she wants food that exists.",
  ["steaming bowl", "herb garnish", "family table"]),
 ("delivery_gap", "Com Hop", "Delivery rice boxes", "Office workers ordering lunch", "Retention", "Facebook", "Honest, quick, unstyled", "What actually arrives",
  "She has ordered from the photograph enough times to have stopped believing the photograph.",
  ["plated presentation", "ceramic dish", "garnish styling"]),
 ("parent_compromise", "Com", "Reduced sugar rice crackers", "Parents of children 4 to 10", "Retail listing", "Print", "Straightforward, warm", "Less sugar, still eaten",
  "The snack has to be good for the child and actually get eaten, and most brands solve only one of those.",
  ["cartoon mascot", "rainbow palette", "child laughing"]),
 ("premium_menu", "Bep Mo", "Twelve course tasting menu", "Affluent diners 35 plus", "Awareness", "Print", "Quiet, precise, seasonal", "Twelve decisions, made for you",
  "A tasting menu at triple the local average has to read as worth it before the price is seen.",
  ["plated close-up", "chef portrait", "candlelight"]),
 ("solo_dining", "Mot", "Counter service noodle bar", "Solo diners in the city centre", "Awareness", "Instagram", "Easy, unfussy, welcoming", "A good seat for one",
  "She eats alone often and every restaurant is designed as though that were a temporary condition.",
  ["group table", "celebration imagery", "couple dining"]),
 ("provenance_doubt", "Da Lat", "Highland arabica beans", "Home brewers 25 to 45", "Awareness", "Instagram", "Specific, unsentimental", "The farm, named",
  "She has read the farm story on the packet and does not believe a word of it.",
  ["farmer at sunrise", "soft focus field", "heritage script"]),
 ("dietary_exclusion", "Chay", "Plant based menu", "Groups with one vegetarian", "Conversion", "Facebook", "Normal, unremarkable", "Nothing to work around",
  "She has a restriction and has learned to apologise for it before anyone else has to.",
  ["separate menu section", "green leaf marking", "health halo"]),
 ("bilingual_menu", "Com Nha", "Family style Vietnamese menu", "Locals and visitors in equal share", "Awareness", "Print", "Welcoming, familiar", "The food we actually eat",
  "A bilingual menu usually makes one audience feel like the afterthought, and both notice.",
  ["tourist iconography", "conical hat", "lantern imagery"]),
 ("price_comparison", "Quan Nho", "Neighbourhood set lunch", "Office workers on a budget", "Conversion", "Facebook", "Plain, generous", "The same money, better spent",
  "She compares this lunch to another lunch when she is really choosing how the middle of her day feels.",
  ["value burst", "discount flash", "portion size claim"]),
 ("staff_recommendation", "Bep", "Chef led bistro", "Diners choosing between similar venues", "Awareness", "Instagram", "Insider, unpolished", "What we eat",
  "She wants to know what is actually good and the menu is never going to tell her.",
  ["chef recommendation badge", "signature dish framing", "award sticker"]),
 ("seasonal_change", "Mua", "Daily changing menu", "Regulars who visit weekly", "Retention", "Instagram", "Honest, immediate", "Today only, and that is the point",
  "Scarcity claims are so routinely faked that a genuine one is no longer believed.",
  ["limited time flash", "urgency countdown", "exclusive framing"]),
 ("first_sip", "Tra", "Loose leaf tea range", "Tea drinkers 30 plus", "Awareness", "Instagram", "Calm, considered", "The moment before",
  "Beverage advertising has photographed the pour and the sip so completely that neither registers any more.",
  ["slow motion pour", "steam curl", "hands cradling cup"]),
 ("local_pride", "Viet", "Domestic craft beer", "Men and women 25 to 40", "Rebranding", "Facebook", "Confident, local, unapologetic", "Local is not the cheap one",
  "Domestic brands compete on price against imports, which quietly concedes that imported is better.",
  ["national flag", "heritage pastiche", "value messaging"]),
 ("nutrition_panel", "Sua", "Fortified drinking yoghurt", "Parents comparing at shelf", "Retail listing", "Print", "Clear, factual", "Compare it properly",
  "The nutrition panel is the thing parents actually read and the thing every brand designs last.",
  ["cartoon character", "health halo", "sports imagery"]),
]
for k, *rest in FOOD:
    B("cb.food_beverage.%s.001" % k, "food_beverage", *rest)

# ─────────────── FASHION (15) ───────────────
FASHION = [
 ("wardrobe_regret", "Kho", "Oversized linen shirting", "Women 25 to 35 buying considered basics", "Collection launch", "Instagram", "Understated, tactile", "Worn, not stored",
  "Half her wardrobe was bought for a version of herself she has not been for several years.",
  ["white studio cyclorama", "model mid-stride", "flat lay grid"]),
 ("parity_tshirt", "Bang", "Heavyweight cotton t-shirt", "Men 20 to 35", "Conversion", "Instagram", "Plain, factual", "The last one you need",
  "The garment is a plain white t-shirt, identical in specification to every competitor.",
  ["moody alley", "brand tag close-up", "folded stack"]),
 ("size_anxiety", "Sen", "Silk slip dress", "Women 22 to 32 shopping on mobile", "Conversion", "Instagram", "Soft, easy", "If it does not fit, that is on us",
  "She has learned that the same size fits differently everywhere, and that the fault will feel like hers.",
  ["size chart", "fit guide", "model measurements"]),
 ("occasion_deadline", "Le", "Event wear capsule", "Women 25 to 45 with an invitation", "Conversion", "Instagram", "Decisive, calm", "Solved, in one visit",
  "The invitation arrived, the wardrobe answer is no, and there are eleven days.",
  ["extensive lookbook", "inspiration grid", "trend roundup"]),
 ("local_premium", "Ao", "Hand finished wool coat", "Women 35 plus buying outerwear", "Rebranding", "Print", "Refined, local, proud", "Made here, and it shows",
  "She assumes the imported coat is better made and has never once checked.",
  ["heritage sepia", "sewing machine detail", "hands stitching"]),
 ("resale_value", "Vong", "Designer resale platform", "Women 25 to 40 who trade pieces on", "Awareness", "Instagram", "Shrewd, unembarrassed", "Bought to be sold again",
  "She calculates resale value at the moment of purchase and no brand will acknowledge it.",
  ["luxury unboxing", "aspiration imagery", "logo display"]),
 ("body_change", "Doi", "Extended range knitwear", "Women whose size has changed", "Retention", "Instagram", "Steady, unremarkable", "Still yours",
  "Her size changed and every brand she trusted now feels like it is for somebody else.",
  ["inclusivity slogan", "body positivity language", "before after"]),
 ("workwear_reality", "Tho May", "Trade workwear range", "People in physical trades", "Awareness", "Facebook", "Direct, accurate", "For the work you actually do",
  "Workwear imagery has converged on office work, leaving most of its buyers unrepresented.",
  ["spotless site", "model in unworn kit", "corporate office"]),
 ("no_logo", "Am Tham", "Unbranded premium basics", "Buyers avoiding conspicuous branding", "Awareness", "Instagram", "Quiet, assured", "Nothing on the outside",
  "She wants the quality without announcing what she paid, and the category signals value with logos.",
  ["logo display", "monogram pattern", "status imagery"]),
 ("tet_seasonal", "Non", "Lunar new year capsule", "Families and gift buyers", "Seasonal", "Facebook", "Celebratory, modern", "New year, not new clothes",
  "Every competitor uses the same red and gold, so seasonal work is indistinguishable.",
  ["red and gold", "peach blossom", "lion dance"]),
 ("longevity", "Ben", "Durable outerwear", "Buyers tired of replacing things", "Awareness", "Print", "Sober, long term", "Five years from now",
  "She is sold newness by an industry that will call this piece dated within a year.",
  ["seasonal drop", "trend language", "newness messaging"]),
 ("styling_confidence", "Tu", "Statement outer layer", "Women 25 to 40 with low styling confidence", "Conversion", "Instagram", "Permissive, easy", "No wrong way",
  "She likes the piece and is not confident she would wear it correctly.",
  ["single authoritative look", "styling rules", "fashion editorial"]),
 ("gift_risk", "Qua", "Apparel gift cards and staples", "Partners buying clothing", "Seasonal", "Facebook", "Reassuring, simple", "Impossible to get wrong",
  "He wants to buy her clothes and is certain he will get the size or the taste wrong.",
  ["size chart", "fit guide", "romantic imagery"]),
 ("grid_recognition", "Luoi", "Marketplace listed basics", "Mobile shoppers browsing grids", "Conversion", "Instagram", "Clear, quick", "Findable at a glance",
  "The garment competes in a grid of forty at thumbnail size where everything looks the same.",
  ["runway walk", "editorial pose", "beach setting"]),
 ("second_hand", "Cu", "Vintage curation", "Buyers 20 to 35", "Awareness", "Instagram", "Specific, unnostalgic", "One of these exists",
  "Vintage is sold on nostalgia, which is the one thing every competitor is also selling.",
  ["sepia filter", "retro typography", "nostalgia language"]),
]
for k, *rest in FASHION:
    B("cb.fashion.%s.001" % k, "fashion", *rest)

# ─────────────── HOSPITALITY (10) ───────────────
HOSP = [
 ("no_pool", "Nha Vuon", "Twelve room garden hotel", "Couples booking a weekend", "Direct bookings", "Instagram", "Calm, green, unhurried", "The garden was here first",
  "Every boutique hotel in the market advertises an infinity pool and this property does not have one.",
  ["infinity pool", "sunset silhouette", "rooftop cocktail"]),
 ("arrival_doubt", "Cua", "Boutique city hotel", "Travellers arriving late", "Awareness", "Instagram", "Reassuring, precise", "The first ninety seconds",
  "She arrives somewhere new and spends the first minute working out whether she has made a mistake.",
  ["lobby chandelier", "made bed", "smiling receptionist"]),
 ("business_speed", "Pho Co", "Three star city hotel", "Business travellers staying one night", "Conversion", "Facebook", "Practical, efficient", "Out the door by seven",
  "He is not on a trip, he is between meetings, and the hotel keeps offering him experiences.",
  ["spa imagery", "rooftop bar", "leisure activity"]),
 ("menu_legibility", "Muoi Bien", "Coastal seafood menu", "Groups of four to six", "Raise order value", "Print", "Relaxed, generous", "Read it in this light",
  "The menu is read in a dim room, in conversation, by someone who will not study it.",
  ["nautical rope", "chalkboard texture", "fishing boat"]),
 ("group_veto", "Ban", "Large format sharing menu", "Groups deciding collectively", "Conversion", "Facebook", "Easy, unobjectionable", "Nobody has to compromise",
  "The group booking is decided by whoever has the strongest objection, not the strongest preference.",
  ["signature dish hero", "chef speciality", "distinctive plating"]),
 ("off_season", "Bien Xanh", "Coastal resort", "Travellers booking outside peak", "Seasonal", "Instagram", "Confident, unapologetic", "Better when it is empty",
  "Off-season is sold as a discount, which confirms the guest's fear that they are getting a lesser version.",
  ["discount flash", "apologetic framing", "crowded peak imagery"]),
 ("regulars", "Goc", "Neighbourhood cafe", "People looking for a local", "Retention", "Instagram", "Familiar, unhurried", "The people already here",
  "She wants somewhere that feels like hers, and every new place is designed to feel like everyone's.",
  ["staged regulars", "model customers", "generic interior"]),
 ("staff_tenure", "Nha", "Family run guesthouse", "Guests choosing on service", "Awareness", "Facebook", "Warm, specific", "Eleven years, same faces",
  "Service claims are made in adjectives that every competitor also uses.",
  ["service promise", "five star language", "award badge"]),
 ("holiday_pressure", "Nghi", "Short break packages", "People with limited annual leave", "Conversion", "Instagram", "Low key, permissive", "It does not have to be the best week of your life",
  "She has waited a year for these days and the pressure to enjoy them is itself unenjoyable.",
  ["bucket list imagery", "once in a lifetime", "scheduled activity"]),
 ("location_over_room", "Ngo", "Small urban hotel", "City visitors choosing on area", "Awareness", "Instagram", "Specific, grounded", "Sell the street",
  "The room is where she will spend the least conscious time of the entire trip.",
  ["room interior", "bed styling", "bathroom detail"]),
]
for k, *rest in HOSP:
    B("cb.hospitality.%s.001" % k, "hospitality", *rest)

# ─────────────── REAL ESTATE (10) ───────────────
RE = [
 ("render_distrust", "Ben", "Riverside apartments", "First time buyers 28 to 40", "Showroom visits", "Facebook", "Grounded, factual", "You will live on the third floor",
  "She has seen what the last development actually looked like once it was finished.",
  ["aerial render", "sunset gradient", "couple on balcony"]),
 ("commute_truth", "Duong", "Suburban townhouses", "Commuting families", "Conversion", "Facebook", "Honest, exact", "Forty minutes at eight in the morning",
  "The location is described in kilometres and experienced in minutes at rush hour.",
  ["landmark proximity", "map graphic", "lifestyle imagery"]),
 ("third_year", "Nam", "Mid market development", "Buyers who have seen buildings age", "Awareness", "Print", "Long term, sober", "How it looks in year three",
  "Buyers have watched previous developments deteriorate and nobody will talk about year three.",
  ["launch imagery", "new build gloss", "opening day"]),
 ("agent_trust", "Tin", "Estate agency", "Buyers making their largest decision", "Awareness", "Facebook", "Candid, unpushy", "Sometimes we will say no",
  "Every party advising her on the biggest purchase of her life is paid only if it completes.",
  ["handshake photo", "keys in hand", "celebration imagery"]),
 ("neighbours", "Xom", "Owner occupier development", "Buyers who care who lives there", "Awareness", "Instagram", "Community led, specific", "Who else lives here",
  "She is buying a building and will actually be living with the people in it, which no listing mentions.",
  ["specification list", "amenity grid", "floor plan"]),
 ("renting_respect", "Thue", "Long term rentals", "Long term renters", "Awareness", "Facebook", "Respectful, plain", "Renting is a decision",
  "She rents and is told constantly that she is wasting money by people who sell property.",
  ["mortgage calculator", "ownership messaging", "ladder metaphor"]),
 ("photo_honesty", "That", "Resale listings", "Buyers booking viewings", "Conversion", "Facebook", "Accurate, unembellished", "The room as it is",
  "Every listing photograph is taken from a corner she will never stand in.",
  ["wide angle distortion", "staged furniture", "empty room"]),
 ("deadline_certainty", "Ky", "Family homes with fixed handover", "Families moving before term starts", "Conversion", "Facebook", "Reliable, precise", "The date holds",
  "The purchase is not driven by the property, it is driven by a school term starting.",
  ["discount offer", "price incentive", "luxury finish"]),
 ("portal_recall", "Cong", "Portal listed apartments", "Buyers browsing forty listings", "Conversion", "Facebook", "Sharp, memorable", "One fact you will remember",
  "She has read forty listings this week and remembers none of them.",
  ["full specification", "price lead", "generic exterior"]),
 ("investor_split", "Loi", "Mixed market units", "Investors and residents both", "Conversion", "Facebook", "Precise, single minded", "Written for one of you",
  "The investor wants yield and the resident wants a home, and the listing is written for neither.",
  ["blended messaging", "yield figure", "lifestyle montage"]),
]
for k, *rest in RE:
    B("cb.real_estate.%s.001" % k, "real_estate", *rest)

# ─────────────── TECHNOLOGY (10) ───────────────
TECH = [
 ("tool_fatigue", "Ghi", "Team notes and search", "Product teams of ten to fifty", "Trial signups", "Instagram", "Plain, fast, unhyped", "Finds what you wrote",
  "She already has nine tools open and the cost of a tenth is attention rather than money.",
  ["abstract network", "glowing brain", "diverse team laughing"]),
 ("ai_saturation", "Nen", "Expense reconciliation", "Finance managers at mid size firms", "Awareness", "Facebook", "Sober, specific", "It reconciles",
  "Every product she evaluated this quarter claimed the same capability in the same words.",
  ["robot imagery", "neural network", "glowing circuit"]),
 ("accountability", "Khoa", "Access governance platform", "Security leads in regulated firms", "Qualified enquiries", "Print", "Serious, exact", "The audit is the product",
  "If the tool gets it wrong, the mistake will have her name on it.",
  ["padlock icon", "shield graphic", "glass tower"]),
 ("developer_trust", "Cau", "API monitoring", "Backend engineers", "Conversion", "Facebook", "Technical, unmarketed", "Know before your users do",
  "The audience distrusts marketing language and this is a marketing asset.",
  ["stock developer", "hoodie hacker", "matrix code"]),
 ("switching_cost", "Ra", "Data portable CRM", "Teams trapped in an incumbent", "Conversion", "Facebook", "Direct, confident", "Leave whenever you like",
  "She would switch and everything she has built is inside the thing she wants to leave.",
  ["integration depth", "ecosystem messaging", "lock-in framing"]),
 ("small_team", "Bon", "Niche analytics tool", "Buyers burned by enterprise support", "Awareness", "Facebook", "Personal, direct", "Four people answer the phone",
  "Small size is treated as a weakness when buyers frequently experience it as the advantage.",
  ["enterprise imagery", "scale messaging", "corporate credibility"]),
 ("jargon_exclusion", "Ro", "Departmental workflow tool", "Non technical budget holders", "Trial signups", "Instagram", "Plain, unpatronising", "You can evaluate this yourself",
  "The product is for her team and every page about it is written for engineers.",
  ["technical architecture", "code sample", "developer language"]),
 ("trial_abandonment", "Buoc", "Self serve scheduling", "Teams who sign up and never return", "Retention", "Website", "Immediate, concrete", "One useful thing in five minutes",
  "She signed up, opened it once, never went back, and it was not the product's fault.",
  ["long term transformation", "roadmap messaging", "feature grid"]),
 ("local_interface", "Tieng", "Vietnamese first field app", "Operations managers at local firms", "Market entry", "Instagram", "Practical, local", "Built for the routes you run",
  "The interface must carry Vietnamese text without breaking the product's own type system.",
  ["generic dashboard", "world map", "delivery truck stock"]),
 ("workaround", "Bang Tinh", "Process automation", "Teams running on spreadsheets", "Conversion", "Facebook", "Recognising, unsmug", "The spreadsheet you all hate",
  "She does not have a gap in her workflow, she has a spreadsheet doing this badly.",
  ["competitor comparison", "feature matrix", "vendor battle card"]),
]
for k, *rest in TECH:
    B("cb.technology.%s.001" % k, "technology", *rest)

# ─────────────── HEALTHCARE (10) ───────────────
HC = [
 ("symptom_doubt", "Kham", "Primary care clinic", "Adults delaying a visit", "Awareness", "Facebook", "Calm, permissive", "Asking is reasonable",
  "She does not know whether this warrants a doctor and is afraid of both possible answers.",
  ["mortality statistic", "fear imagery", "urgency messaging"]),
 ("unasked_questions", "Hoi", "Specialist consultation", "Patients managing a condition", "Retention", "Print", "Unhurried, attentive", "Room to ask",
  "She left the appointment with four unasked questions because there was no room to ask them.",
  ["expertise claim", "credentials wall", "short appointment"]),
 ("procedure_fear", "Truoc", "Elective day surgery", "Patients booked for a procedure", "Reduce cancellation", "Print", "Precise, reassuring", "What the day is like",
  "She is afraid of the procedure and nobody will tell her what it will actually be like.",
  ["consent language", "risk disclosure", "clinical description"]),
 ("adherence_shame", "Theo", "Chronic medication support", "Patients who stopped early", "Retention", "Facebook", "Non judgemental", "Say it if you stopped",
  "She stopped taking it when she felt better and will not mention that at the next appointment.",
  ["compliance messaging", "adherence statistics", "warning language"]),
 ("first_step", "Bat Dau", "Lifestyle change programme", "People who know and have not started", "Conversion", "Facebook", "Small, feasible", "One thing, today",
  "She knows what she should change and the size of the change is exactly why she has not started.",
  ["full programme", "transformation imagery", "before after"]),
 ("proxy_decision", "Gia Dinh", "Elder care service", "Adults choosing for a parent", "Awareness", "Facebook", "Supportive, shared", "You are not deciding alone",
  "She is choosing care for her mother and will carry the decision either way it goes.",
  ["patient led messaging", "independence framing", "clinical imagery"]),
 ("time_returned", "Ngay Lai", "Chronic condition treatment", "Patients counting lost days", "Awareness", "Print", "Concrete, human", "Days, not numbers",
  "The condition is described in clinical measures and experienced as lost days.",
  ["clinical measure", "graph imagery", "specialist language"]),
 ("cost_anxiety", "Phi", "Private clinic", "Patients paying out of pocket", "Conversion", "Facebook", "Plain, upfront", "The number, before you come in",
  "She is worried about the treatment and equally worried about the bill, and will only admit to one.",
  ["premium care imagery", "luxury clinic", "vague pricing"]),
 ("stigma", "Chung", "Common condition treatment", "People who think they are unusual", "Awareness", "Facebook", "Ordinary, unembarrassed", "More common than you think",
  "She assumes her condition is rarer and more embarrassing than it actually is.",
  ["severity messaging", "isolation imagery", "medical drama"]),
 ("referral_ease", "Gioi Thieu", "Dental practice", "Patients who recommend", "Retention", "Facebook", "Easy to repeat", "Simple to pass on",
  "She chose the clinic because a friend went there, not because of anything the clinic said.",
  ["paid referral scheme", "loyalty points", "discount incentive"]),
]
for k, *rest in HC:
    B("cb.healthcare.%s.001" % k, "healthcare", *rest)

# ─────────────── EDUCATION (5) ───────────────
EDU = [
 ("parent_anxiety", "Truong", "Primary school", "Parents choosing for a child", "Enrolment", "Facebook", "Reassuring, concrete", "The next two years",
  "She is choosing for a child whose future she cannot see, and will be blamed either way.",
  ["university placement rate", "outcome statistics", "graduation imagery"]),
 ("adult_shame", "Lop", "Adult foundation courses", "Adults returning to study", "Enrolment", "Facebook", "Unassuming, warm", "Starting from nothing is normal",
  "She should already know this, and enrolling means admitting that she does not.",
  ["prerequisite list", "advanced framing", "expert imagery"]),
 ("teacher_led", "Thay", "Language school", "Learners choosing a provider", "Awareness", "Instagram", "Personal, specific", "The people in the room",
  "She is choosing an institution and her child will experience four specific teachers.",
  ["facility imagery", "campus photography", "equipment display"]),
 ("capability", "Lam Duoc", "Vocational skills course", "Career changers 25 to 40", "Enrolment", "Facebook", "Concrete, practical", "What you will be able to do",
  "She is shown a syllabus and wants to know what she will actually be able to do afterwards.",
  ["curriculum list", "module breakdown", "academic language"]),
 ("cost_uncertainty", "Hoc Phi", "Fee paying evening course", "Learners weighing the fee", "Conversion", "Facebook", "Bounded, honest", "Start small",
  "The fee is certain and immediate and the benefit is uncertain and years away.",
  ["outcome guarantee", "salary uplift claim", "success story"]),
]
for k, *rest in EDU:
    B("cb.education.%s.001" % k, "education", *rest)

# ─────────────── LOCAL BUSINESS (10) ───────────────
LB = [
 ("barber_regulars", "Toc", "Neighbourhood barber", "Men who go every three weeks", "Retention", "Facebook", "Familiar, plain", "Same chair, same person",
  "Every barber advertises the cut and none of them advertise the thing that actually keeps people coming.",
  ["fade close-up", "before after cut", "styled model"]),
 ("laundry_convenience", "Giat", "Local laundry service", "Working households nearby", "Conversion", "Facebook", "Practical, quick", "Back the same day",
  "The service competes with the washing machine already in her flat, not with another laundry.",
  ["fresh linen imagery", "folded stack", "cleanliness language"]),
 ("repair_trust", "Sua", "Phone repair shop", "People with a broken screen", "Conversion", "Facebook", "Honest, unpushy", "What it will cost before we open it",
  "She has been quoted one price and charged another, and expects it to happen again.",
  ["technician imagery", "warranty badge", "quality promise"]),
 ("gym_intimidation", "Tap", "Neighbourhood gym", "People who have never joined one", "Enrolment", "Facebook", "Unintimidating, ordinary", "Nobody is watching you",
  "The barrier is not fitness, it is walking in for the first time in front of everyone.",
  ["athletic model", "transformation imagery", "performance language"]),
 ("florist_occasion", "Hoa Tuoi", "Local florist", "People buying for an occasion", "Conversion", "Facebook", "Warm, specific", "We will ask who it is for",
  "Flowers are bought under time pressure by someone unsure what is appropriate.",
  ["bouquet grid", "romantic imagery", "seasonal display"]),
 ("printer_deadline", "In", "Print and copy shop", "Small businesses with a deadline", "Conversion", "Facebook", "Fast, dependable", "Ready when we said",
  "The customer does not care about print quality, they care that it exists by Thursday.",
  ["quality sample", "colour accuracy", "equipment imagery"]),
 ("mechanic_honesty", "Xe", "Local garage", "Drivers who distrust garages", "Awareness", "Facebook", "Candid, itemised", "We will show you the part",
  "She assumes she is being overcharged and has no way to check.",
  ["clean workshop", "certified badge", "technician portrait"]),
 ("tutor_results", "Day Them", "Private tutoring", "Parents of exam year students", "Enrolment", "Facebook", "Measured, honest", "What we can and cannot change",
  "Every tutor promises improvement and none of them will say what is realistic.",
  ["grade improvement claim", "success testimonial", "ranking imagery"]),
 ("pharmacy_advice", "Thuoc", "Neighbourhood pharmacy", "People self treating minor illness", "Retention", "Facebook", "Approachable, expert", "Ask before you buy",
  "She buys the wrong thing because asking feels like wasting the pharmacist's time.",
  ["product shelf", "brand display", "promotion flash"]),
 ("cleaner_trust", "Don", "Home cleaning service", "Households letting someone in", "Conversion", "Facebook", "Reassuring, specific", "The same person each time",
  "The barrier is letting a stranger into the house, not the price or the cleaning.",
  ["sparkling surface", "spray bottle", "smiling cleaner"]),
]
for k, *rest in LB:
    B("cb.local_business.%s.001" % k, "local_business", *rest)


by = collections.Counter(c["industry"] for c in CASES)
expect = {"beauty": 15, "food_beverage": 15, "fashion": 15, "hospitality": 10,
          "real_estate": 10, "technology": 10, "healthcare": 10, "education": 5,
          "local_business": 10}
assert len(CASES) == 100, "expected 100, got %d" % len(CASES)
for k, v in expect.items():
    assert by[k] == v, "%s: %d, expected %d" % (k, by[k], v)
ids = [c["case_id"] for c in CASES]
assert len(set(ids)) == 100, "duplicate case_id"
for c in CASES:
    assert len(c["creative_challenge"]) > 40, "thin challenge: " + c["case_id"]
    assert len(c["must_avoid"]) >= 3, "thin must_avoid: " + c["case_id"]

data = {"dataset_id": "cios_creative_concept_benchmark", "version": "v1", "cases": CASES}
out = "data/benchmarks/creative_concept_benchmark_v1.json"
io.open(out, "w", encoding="utf-8").write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print("wrote %d briefs -> %s" % (len(CASES), out))
print("by industry:", dict(by))
