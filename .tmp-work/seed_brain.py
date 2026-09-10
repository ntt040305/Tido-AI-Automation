import io, os

base = "data/cios-knowledge"
count = 0

def w(domain, name, body):
    global count
    path = os.path.join(base, domain, name + ".yaml")
    io.open(path, "w", encoding="utf-8").write(body.lstrip("\n"))
    count += 1
    print("  " + path)

# ─────────────────────────── STRATEGY ───────────────────────────
w("strategy", "identity_preservation_mature_skincare", """
knowledge_id: strategy.identity_preservation.mature_skincare.001
name: Identity preservation over correction for mature skincare
domain: strategy
sub_domain: identity_preservation
knowledge_type: decision_rule
creative_stage: [strategy, concept]
context:
  industry: beauty
  category: skincare
  audience: women_35_50
  objective: [product_launch, awareness]
  channel: "*"
  asset_type: "*"
  brand_position: [premium, luxury]
problem: >-
  Anti-ageing communication defaults to correction and reversal, which frames the
  buyer as a defect to be repaired and suppresses the purchase it means to drive.
human_insight:
  functional_need: Visible improvement in tone and texture
  emotional_need: Confidence that she still recognises herself
  social_need: To be read as self-possessed rather than anxious about ageing
decision: >-
  Frame the campaign around continuity of identity rather than correction, reversal
  or repair of ageing.
reasoning: >-
  This segment has already rejected fear-based category messaging. They buy
  continuity of self-image, not repair of a defect, and correction language carries
  an implied criticism of the person being sold to.
why_this_works: >-
  Removing the implied criticism removes the main psychological barrier to purchase,
  while continuity language still permits a clear efficacy claim.
use_when:
  - Audience is 35 or older in beauty or personal care
  - Brand position is premium or luxury
  - Objective is launch or awareness rather than discounting
avoid_when:
  - Discount-led or urgency-led promotion
  - Clinical positioning where efficacy proof is the primary claim
  - Audience under 30, where aspiration outperforms continuity
trade_off:
  advantage: Higher emotional relevance and stronger premium perception
  limitation: Slower and less literal communication of the functional benefit
  suitable_conditions: Brand launch and awareness campaigns with room to tell a story
  unsuitable_conditions: Flash sales requiring an immediate legible product claim
alternatives:
  - Clinical efficacy proof led by ingredient science
  - Dermatologist endorsement for trust-led categories
anti_patterns:
  - problem: Generic beauty model holding the serum against a plain white background
    why_it_fails: Visually interchangeable with every competitor, so it builds category awareness rather than brand memory
    replacement: A specific lived moment that only this person, in this life, would have
  - problem: Before-and-after framing on a mature face
    why_it_fails: Makes the current self the problem, which is the exact objection this audience holds
    replacement: A single present-tense moment of recognition with no implied prior state
examples:
  - problem: Anti-ageing launch in a saturated premium category
    creative_decision: Lead with continuity of self rather than reversal of time
    transferable_rule: In categories that sell improvement, sell continuity to mature audiences
impact: Increases emotional relevance and lifts premium perception at launch.
impact_score: 9
priority: 9
confidence: 0.9
context_relevance: 0.9
related_knowledge:
  - audience.women_35_50.identity_drivers.001
  - differentiation.beauty.category_cliches.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

w("strategy", "ritual_framing_local_hospitality", """
knowledge_id: strategy.ritual_framing.local_hospitality.001
name: Ritual framing for local food and beverage launches
domain: strategy
sub_domain: ritual_framing
knowledge_type: decision_rule
creative_stage: [strategy, concept]
context:
  industry: food_beverage
  category: "*"
  audience: "*"
  objective: product_launch
  channel: "*"
  asset_type: "*"
  brand_position: [mass, premium, traditional]
problem: >-
  Local food and beverage launches default to product beauty shots, which give a
  neighbourhood no reason to change where it already goes.
human_insight:
  functional_need: A reliable place to eat or drink nearby
  emotional_need: A moment of control inside a crowded day
  social_need: To belong to a particular place rather than to a chain
decision: >-
  Anchor the launch in one named daily ritual and one recognisable local moment
  rather than in the product itself.
reasoning: >-
  Repeat trade in local hospitality is habitual, not aspirational. The ritual is the
  ownable territory because competitors can copy a recipe but not a moment already
  attached to a specific place.
why_this_works: >-
  A named moment gives an existing habit somewhere to attach, which is what turns a
  first visit into a second one.
use_when:
  - Independent or small-chain hospitality opening or relaunching
  - Objective is trial and repeat visit rather than reach
avoid_when:
  - National chain launch where consistency, not locality, is the promise
  - Menu or price promotion needing immediate legibility
trade_off:
  advantage: Creates a territory competitors cannot copy
  limitation: Less immediate appetite appeal than a direct product shot
  suitable_conditions: Brand launch and community building
  unsuitable_conditions: Menu promotions and limited-time price offers
alternatives:
  - Craft and provenance storytelling where sourcing is genuinely distinctive
anti_patterns:
  - problem: Coffee beans, rising steam, a wooden table and morning sunlight
    why_it_fails: The most saturated visual set in the category, so it reads as stock rather than as a place
    replacement: One person inside one specific ritual at one recognisable location
impact: Creates an ownable local brand territory and lifts repeat visit intent.
impact_score: 9
priority: 9
confidence: 0.85
context_relevance: 0.85
related_knowledge:
  - differentiation.food_beverage.category_cliches.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

# ─────────────────────────── AUDIENCE ───────────────────────────
w("audience", "women_35_50_identity_drivers", """
knowledge_id: audience.women_35_50.identity_drivers.001
name: Identity drivers for women 35-50 in personal care
domain: audience
sub_domain: women_35_50
knowledge_type: framework
creative_stage: [strategy]
context:
  industry: [beauty, fashion]
  category: "*"
  audience: women_35_50
  objective: "*"
  channel: "*"
  asset_type: "*"
  brand_position: [premium, luxury]
problem: >-
  Briefs describe this audience demographically, which produces communication aimed
  at an age bracket rather than at a person with a specific motivation.
human_insight:
  functional_need: Products that deliver a visible verifiable result
  emotional_need: Continuity with the self she already recognises
  social_need: To be read as composed and in command rather than as resisting time
decision: >-
  Choose the emotional trigger of recognition and composure, and reject triggers
  built on loss, decline or urgency.
reasoning: >-
  Purchase in this segment defends an existing identity rather than reaching for a
  new one. Triggers implying decline activate the objection instead of the desire.
why_this_works: >-
  Recognition frames the product as maintaining something already valued, which
  requires no admission that anything is wrong.
use_when:
  - Audience resolves to women_35_50 in beauty or fashion
  - Brand position is premium or luxury
avoid_when:
  - Audience is gen_z, where aspiration and transformation outperform continuity
  - Category is clinical, where problem framing is expected and trusted
trade_off:
  advantage: Removes the primary psychological objection in the segment
  limitation: Constrains the use of dramatic transformation claims
  suitable_conditions: Brand and launch communication
  unsuitable_conditions: Clinical efficacy campaigns with regulated claims
alternatives:
  - Peer-authority framing using someone the audience already trusts
anti_patterns:
  - problem: Communication built on the fear of visible ageing
    why_it_fails: Names the audience as the problem, which produces avoidance rather than purchase
    replacement: Present-tense recognition of a self that is already valued
impact: Raises message acceptance and reduces defensive rejection of the claim.
impact_score: 8
priority: 9
confidence: 0.88
context_relevance: 0.85
related_knowledge:
  - strategy.identity_preservation.mature_skincare.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

w("audience", "gen_z_authenticity_signals", """
knowledge_id: audience.gen_z.authenticity_signals.001
name: Authenticity signals for Gen Z in social advertising
domain: audience
sub_domain: gen_z
knowledge_type: framework
creative_stage: [strategy, concept]
context:
  industry: [fashion, food_beverage, technology]
  category: "*"
  audience: gen_z
  objective: "*"
  channel: [instagram, tiktok]
  asset_type: social_ad
  brand_position: "*"
problem: >-
  Polished advertising reads as paid content to this audience and is dismissed
  before the message registers.
human_insight:
  functional_need: Something that performs as promised and is worth the price
  emotional_need: Pride in having found it rather than having been sold it
  social_need: To be seen as distinctive rather than styled by an algorithm
decision: >-
  Choose signals of specificity over signals of production value: one named place,
  one real moment, one imperfect detail.
reasoning: >-
  This audience reads polish as budget and budget as persuasion. Specificity is
  expensive to fake, so it survives as a trust signal where craft alone does not.
why_this_works: >-
  A detail too particular to be stock implies the situation was real, which is the
  only claim this audience accepts without proof.
use_when:
  - Audience resolves to gen_z on a social channel
  - Objective is awareness or consideration rather than direct response
avoid_when:
  - Luxury positioning where visible craft is itself the product promise
  - Regulated categories requiring formal controlled presentation
trade_off:
  advantage: Higher trust and stop rate in feed
  limitation: Lower perceived premium and less control over brand consistency
  suitable_conditions: Social-first brand building
  unsuitable_conditions: Luxury brand campaigns and regulated claims
alternatives:
  - Creator-led delivery where the creator supplies the authenticity signal
anti_patterns:
  - problem: Studio-perfect product photography posted as organic social content
    why_it_fails: The mismatch between format and polish exposes it as advertising immediately
    replacement: A specific slightly imperfect real moment that could not be stock
impact: Raises stop rate and message acceptance in social feeds.
impact_score: 8
priority: 8
confidence: 0.82
context_relevance: 0.8
related_knowledge:
  - differentiation.fashion.category_cliches.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

# ───────────────────────── DIFFERENTIATION ─────────────────────────
w("differentiation", "beauty_category_cliches", """
knowledge_id: differentiation.beauty.category_cliches.001
name: Beauty category cliches and their replacements
domain: differentiation
sub_domain: beauty
knowledge_type: anti_pattern
creative_stage: [concept]
context:
  industry: beauty
  category: "*"
  audience: "*"
  objective: "*"
  channel: "*"
  asset_type: "*"
  brand_position: "*"
problem: >-
  Beauty is among the most visually saturated categories, so the default execution
  produces work that is competent, on-brief and completely interchangeable.
decision: >-
  Reject the four saturated beauty defaults - water splash, floating petals, plain
  white void and a model touching her own face - unless the brief requires one.
reasoning: >-
  Each of these signals the category rather than the brand. They pass client review
  because they look correct, which is exactly why every competitor also ships them.
why_this_works: >-
  Removing the interchangeable layer forces the concept to carry the distinctiveness,
  which is where brand memory is actually formed.
use_when:
  - Any beauty or personal care concept development
  - Differentiation or brand memory is an objective
avoid_when:
  - Client brand guidelines mandate a specific category convention
  - Product demonstration where the mechanic genuinely requires water or texture
trade_off:
  advantage: Substantially raises distinctiveness and brand attribution
  limitation: Reduces instant category legibility, so the product must work harder
  suitable_conditions: Brand campaigns with existing category awareness
  unsuitable_conditions: First-time category entry where recognition outranks memory
alternatives:
  - Scientific luxury framing built on visible material precision
  - Identity-based storytelling grounded in a lived moment
anti_patterns:
  - problem: Water splash frozen around a serum bottle
    why_it_fails: Signals hydration generically and is used by most competitors, so attribution collapses
    replacement: Material behaviour specific to this formula, shown at rest
  - problem: Floating flower petals or botanical props arranged around the product
    why_it_fails: Implies natural provenance without evidence and reads as decoration
    replacement: The actual sourcing environment, or nothing at all
  - problem: Plain white infinity void background
    why_it_fails: Removes all context, leaving nothing for memory to attach to
    replacement: A restrained but specific surface that implies where the product lives
impact: Raises brand attribution and reduces category interchangeability.
impact_score: 9
priority: 10
confidence: 0.9
context_relevance: 0.9
related_knowledge:
  - strategy.identity_preservation.mature_skincare.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

w("differentiation", "food_beverage_category_cliches", """
knowledge_id: differentiation.food_beverage.category_cliches.001
name: Food and beverage cliches and their replacements
domain: differentiation
sub_domain: food_beverage
knowledge_type: anti_pattern
creative_stage: [concept]
context:
  industry: food_beverage
  category: "*"
  audience: "*"
  objective: "*"
  channel: "*"
  asset_type: "*"
  brand_position: "*"
problem: >-
  Food and beverage work converges on a small set of appetite signals that are
  effective in isolation and indistinguishable in aggregate.
decision: >-
  Reject the saturated appetite defaults - rising steam, scattered raw ingredients,
  rustic wood surfaces and overhead flat-lays - unless the brief requires one.
reasoning: >-
  These signals communicate the category rather than the brand. They are chosen
  because they reliably read as food, which is exactly why they cannot differentiate.
why_this_works: >-
  Forcing the appetite signal to come from the actual product surface produces
  imagery only this product could have generated.
use_when:
  - Food, beverage or hospitality concept development
  - Objective includes brand memory or differentiation
avoid_when:
  - Menu boards and price-led promotions where instant legibility outranks memory
trade_off:
  advantage: Distinctive attributable food imagery
  limitation: Requires stronger product craft and better real material to hold up
  suitable_conditions: Brand campaigns and launches
  unsuitable_conditions: Delivery-platform thumbnails needing instant recognition
alternatives:
  - Consumption-moment framing centred on the person rather than the plate
anti_patterns:
  - problem: Rising steam over a hot drink or dish
    why_it_fails: Universal category shorthand for freshness, used by nearly every competitor
    replacement: Surface texture at close range, where freshness is actually visible
  - problem: Raw ingredients scattered decoratively around the finished dish
    why_it_fails: Implies provenance without evidence and clutters the visual hierarchy
    replacement: The single ingredient that genuinely differentiates the recipe, shown deliberately
impact: Produces attributable food imagery and lifts brand recall.
impact_score: 8
priority: 9
confidence: 0.87
context_relevance: 0.85
related_knowledge:
  - strategy.ritual_framing.local_hospitality.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

w("differentiation", "fashion_category_cliches", """
knowledge_id: differentiation.fashion.category_cliches.001
name: Fashion social advertising cliches and their replacements
domain: differentiation
sub_domain: fashion
knowledge_type: anti_pattern
creative_stage: [concept]
context:
  industry: fashion
  category: "*"
  audience: "*"
  objective: "*"
  channel: [instagram, tiktok, facebook]
  asset_type: social_ad
  brand_position: "*"
problem: >-
  Fashion social advertising defaults to catalogue presentation, which is scrolled
  past because it carries no human signal to identify with.
decision: >-
  Reject flat-lay catalogue presentation and blank-expression studio portraits in
  favour of a character carrying a recognisable attitude.
reasoning: >-
  Garments are evidence of identity, not the subject of it. A viewer scrolls past a
  product and stops for a person with a stance.
why_this_works: >-
  Attitude stays legible at thumbnail size and survives compression, where garment
  detail does not.
use_when:
  - Fashion or apparel advertising on a social channel
  - Objective is awareness, consideration or brand building
avoid_when:
  - E-commerce listing imagery where literal product clarity is the requirement
  - Size, fit or construction demonstration
trade_off:
  advantage: Substantially higher stop rate and brand recall
  limitation: Reduced literal product clarity
  suitable_conditions: Social advertising and brand campaigns
  unsuitable_conditions: Product detail pages and catalogue systems
alternatives:
  - Movement-led capture where garment behaviour is itself the story
anti_patterns:
  - problem: Flat-lay garment arrangement on a plain ground
    why_it_fails: No human signal, so nothing for the viewer to identify with or remember
    replacement: A character wearing the garment with a specific readable attitude
impact: Raises stop rate and brand attribution in feed.
impact_score: 9
priority: 9
confidence: 0.86
context_relevance: 0.85
related_knowledge:
  - audience.gen_z.authenticity_signals.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

# ─────────────────────────── CONCEPT ───────────────────────────
w("concept", "tension_first_construction", """
knowledge_id: concept.construction.tension_first.001
name: Build the concept from a tension, not from the product
domain: concept
sub_domain: construction
knowledge_type: framework
creative_stage: [concept]
context:
  industry: "*"
  category: "*"
  audience: "*"
  objective: [awareness, product_launch]
  channel: "*"
  asset_type: "*"
  brand_position: "*"
problem: >-
  Concepts written from product features produce work that is accurate and
  forgettable, because a feature list gives the viewer nothing to resolve.
human_insight:
  functional_need: To understand what the product does
  emotional_need: To see a situation they recognise as their own
  social_need: To feel understood rather than marketed to
decision: >-
  Open concept development from a named audience tension and reach the product only
  once the tension has a resolution.
reasoning: >-
  Attention is granted to unresolved situations, not to descriptions. A concept
  built from tension has somewhere to go; one built from a feature is already over.
why_this_works: >-
  The tension supplies the narrative engine, and the product becomes the resolution
  rather than the subject, which is what makes the work memorable.
use_when:
  - Awareness or launch objectives with room for narrative
  - Category is saturated and feature parity is high
avoid_when:
  - Direct response where the offer is the message
  - Genuine technical breakthrough where the feature is the story
trade_off:
  advantage: Memorable, differentiated and emotionally attached work
  limitation: Slower route to the product claim, needs more executional craft
  suitable_conditions: Brand and launch campaigns
  unsuitable_conditions: Performance advertising judged on immediate conversion
alternatives:
  - Demonstration-led concepting where the mechanic is genuinely novel
anti_patterns:
  - problem: Concept built by restating product features as benefits
    why_it_fails: Produces a description rather than an idea, so nothing organises the work
    replacement: A named tension the audience already feels, resolved by the product
impact: Produces concepts with narrative structure and higher recall.
impact_score: 9
priority: 9
confidence: 0.85
context_relevance: 0.8
related_knowledge:
  - strategy.identity_preservation.mature_skincare.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

w("concept", "single_organising_idea", """
knowledge_id: concept.discipline.single_organising_idea.001
name: One organising idea across the whole asset set
domain: concept
sub_domain: discipline
knowledge_type: principle
creative_stage: [concept, visual_direction]
context:
  industry: "*"
  category: "*"
  audience: "*"
  objective: "*"
  channel: "*"
  asset_type: "*"
  brand_position: "*"
problem: >-
  Multi-asset campaigns drift into five individually competent executions that share
  a logo and nothing else, so the campaign never accumulates meaning.
decision: >-
  Require every asset in the set to express one organising idea, and reject any
  execution that would still make sense under a different idea.
reasoning: >-
  Campaign memory compounds only when repeated exposure reinforces the same thought.
  Five unrelated good executions produce five first impressions, not one campaign.
why_this_works: >-
  A shared organising idea makes each additional asset strengthen the others rather
  than compete with them for the same attention.
use_when:
  - Any campaign producing more than one asset
  - Objective includes brand memory or attribution
avoid_when:
  - Isolated one-off assets with no campaign context
  - Testing programmes deliberately exploring divergent territories
trade_off:
  advantage: Compounding recall and coherent brand attribution
  limitation: Constrains per-asset creative freedom
  suitable_conditions: Campaign systems and multi-format sets
  unsuitable_conditions: Exploratory creative testing
alternatives:
  - Territory testing where divergence is the explicit objective
anti_patterns:
  - problem: Each asset in the set built to its own separate idea
    why_it_fails: Repeated exposure builds no cumulative meaning, so spend buys reach without memory
    replacement: One organising idea expressed differently per format and per job
impact: Produces a coherent asset system rather than a collection of images.
impact_score: 8
priority: 9
confidence: 0.9
context_relevance: 0.75
related_knowledge:
  - concept.construction.tension_first.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

# ─────────────────────── VISUAL DIRECTION ───────────────────────
w("visual_direction", "quiet_authority_premium", """
knowledge_id: visual_direction.premium.quiet_authority.001
name: Quiet authority as the premium visual world
domain: visual_direction
sub_domain: premium
knowledge_type: decision_rule
creative_stage: [visual_direction]
context:
  industry: [beauty, fashion, technology]
  category: "*"
  audience: "*"
  objective: [awareness, product_launch]
  channel: "*"
  asset_type: "*"
  brand_position: [premium, luxury]
problem: >-
  Premium briefs are often executed with added decoration, which reads as effort and
  undermines the confidence the positioning depends on.
decision: >-
  Build a still, unhurried visual world where restraint carries the authority and
  every element earns its place.
reasoning: >-
  Premium perception is produced by apparent confidence. Visible effort to impress
  signals that the value is not self-evident, which contradicts the claim.
why_this_works: >-
  Reduced competition for attention raises the perceived value of whatever remains
  in frame.
use_when:
  - Brand position is premium or luxury
  - Objective is awareness or launch rather than conversion
avoid_when:
  - Discount or urgency campaigns needing visible energy
  - Mass-market positioning where warmth outperforms restraint
trade_off:
  advantage: Strong premium perception and brand authority
  limitation: Lower information density and slower message delivery
  suitable_conditions: Brand campaigns for premium and luxury positioning
  unsuitable_conditions: Promotional campaigns requiring urgency
alternatives:
  - Material-led premium where surface craft carries the value signal
anti_patterns:
  - problem: Adding decorative props and effects to signal luxury
    why_it_fails: Visible effort to impress reads as insecurity, which lowers perceived value
    replacement: Removing elements until only what is necessary remains
impact: Raises perceived value and brand authority.
impact_score: 8
priority: 9
confidence: 0.88
context_relevance: 0.85
related_knowledge:
  - layout.negative_space.premium_hero.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

# ───────────────────────── LAYOUT ─────────────────────────
w("layout", "negative_space_premium_hero", """
knowledge_id: layout.negative_space.premium_hero.001
name: Negative space hero layout for premium positioning
domain: layout
sub_domain: negative_space
knowledge_type: decision_rule
creative_stage: [design, visual_direction]
context:
  industry: "*"
  category: "*"
  audience: "*"
  objective: [awareness, product_launch]
  channel: "*"
  asset_type: [poster, product_hero]
  brand_position: [premium, luxury]
problem: >-
  Premium products lose perceived value in dense layouts, because crowding implies
  the product cannot hold attention on its own.
decision: >-
  Hold the subject on a single dominant axis with at least half the frame reserved
  as negative space, and admit no competing props.
reasoning: >-
  Space around a subject is read as confidence in it. Density is read as a need to
  persuade, which lowers perceived value in exactly the segment that pays for it.
why_this_works: >-
  Removing competition for attention concentrates the entire attention budget onto
  the one element that carries the value claim.
use_when:
  - Brand position is premium or luxury
  - Asset is a poster or product hero with a single subject
  - Objective is awareness or launch
avoid_when:
  - Promotional assets carrying price, offer and urgency together
  - Formats where platform chrome already consumes the free space
trade_off:
  advantage: Strong premium perception and unambiguous focal hierarchy
  limitation: Carries far less information per asset
  suitable_conditions: Brand and launch work with a single message
  unsuitable_conditions: Retail promotions needing multiple messages in one frame
alternatives:
  - Editorial split layout when a headline must share equal weight
anti_patterns:
  - problem: Filling reserved space with secondary props or supporting copy
    why_it_fails: Reintroduces competition for attention and returns the layout to category average
    replacement: Leaving the reserved area genuinely empty
impact: Raises perceived value and focal clarity in single-message assets.
impact_score: 8
priority: 9
confidence: 0.9
context_relevance: 0.85
related_knowledge:
  - visual_direction.premium.quiet_authority.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

w("layout", "mobile_first_social_hierarchy", """
knowledge_id: layout.mobile_first.social_hierarchy.001
name: Mobile-first hierarchy for social advertising
domain: layout
sub_domain: mobile_first
knowledge_type: production_rule
creative_stage: [design, production]
context:
  industry: "*"
  category: "*"
  audience: "*"
  objective: "*"
  channel: [instagram, tiktok, facebook]
  asset_type: social_ad
  brand_position: "*"
problem: >-
  Social assets are designed at full size and shipped into a feed where platform
  chrome covers the lower third and the whole frame is seen at thumbnail scale.
decision: >-
  Place the subject and primary message inside the upper two thirds and keep the
  lower third clear of anything the message depends on.
reasoning: >-
  Captions, handles and interface controls overlay the lower third on every major
  platform. Content placed there is reliably obscured regardless of craft.
why_this_works: >-
  Designing to the visible region means the message survives the platform rather
  than competing with it.
use_when:
  - Asset type is a social advertisement
  - Channel is instagram, tiktok or facebook
avoid_when:
  - Print, out-of-home or website hero placements with no interface overlay
trade_off:
  advantage: The message survives real placement conditions
  limitation: Reduces usable canvas by roughly a third
  suitable_conditions: All in-feed social advertising
  unsuitable_conditions: Formats without platform chrome
alternatives:
  - Safe-zone templates supplied by the platform where available
anti_patterns:
  - problem: Centring the subject vertically in a 9:16 social frame
    why_it_fails: Pushes the lower part of the subject behind captions and controls
    replacement: Weighting the composition into the upper two thirds
impact: Preserves message legibility in real feed placement.
impact_score: 8
priority: 9
confidence: 0.92
context_relevance: 0.85
related_knowledge:
  - differentiation.fashion.category_cliches.001
source: CIOS Phase 2 seed - Core Creative Brain
""")

print("wrote %d knowledge objects" % count)
