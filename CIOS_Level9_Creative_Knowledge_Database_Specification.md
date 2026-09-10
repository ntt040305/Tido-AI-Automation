# CIOS LEVEL 9 --- CREATIVE KNOWLEDGE DATABASE SPECIFICATION v2

## Creative Intelligence Operating System

## Purpose

This document defines the database architecture required to transform
CIOS from a knowledge repository into an expert-level Creative
Intelligence System.

The goal is not to store large amounts of information.

The goal is to store reusable creative intelligence:

    Information
    ↓
    Context
    ↓
    Decision Rule
    ↓
    Creative Judgment
    ↓
    Execution

A professional creative does not win because they know more facts.

They win because they know:

-   What matters
-   What does not matter
-   When to apply a principle
-   When to break a rule
-   Why a decision creates better results

------------------------------------------------------------------------

# 1. Database Philosophy

Traditional knowledge base:

    Luxury brands use minimal design.

CIOS knowledge:

``` yaml
situation:
  industry: beauty
  category: luxury skincare
  objective: premium positioning
  audience: women 35-50

decision:
  use:
    - controlled negative space
    - editorial composition
    - refined typography

reason:
  Premium perception is created through confidence and restraint.

avoid:
  - crowded layouts
  - aggressive discount language

trade_off:
  Lower information density but higher perceived value.
```

------------------------------------------------------------------------

# 2. Knowledge Object Architecture

Every knowledge unit must follow this structure:

``` yaml
knowledge_id:

title:

domain:

sub_domain:

category:

industry:

creative_stage:

knowledge_type:

authority_level:

priority_score:

confidence_score:

context:

problem:

decision:

reason:

use_when:

avoid_when:

trade_off:

examples:

anti_patterns:

related_knowledge:

source_reference:

last_updated:
```

------------------------------------------------------------------------

# 3. Core Metadata Explanation

## knowledge_id

Unique identifier.

Example:

    layout.luxury.negative_space.hero_001

Purpose:

Allow precise retrieval and relationship mapping.

------------------------------------------------------------------------

## domain

Main intelligence area.

Examples:

    strategy
    audience
    layout
    typography
    photography
    color
    production
    critic

------------------------------------------------------------------------

## sub_domain

Specific expertise.

Example:

    layout

    sub_domain:

    luxury_product_hero

------------------------------------------------------------------------

## category

Industry context.

Examples:

    beauty
    fashion
    food
    technology
    automotive
    hospitality
    local_business

------------------------------------------------------------------------

## creative_stage

Where knowledge is used.

Values:

    strategy
    concept
    art_direction
    design
    production
    evaluation

------------------------------------------------------------------------

## knowledge_type

Types:

    principle

    decision_rule

    framework

    pattern

    anti_pattern

    example

    evaluation_rule

    production_rule

------------------------------------------------------------------------

## authority_level

Knowledge reliability:

    core

    expert

    specialized

    experimental

------------------------------------------------------------------------

## priority_score

Determines retrieval importance.

Scale:

    1-10

Example:

Luxury skincare negative space:

    priority: 9

Flash sale banner:

    priority: 3

------------------------------------------------------------------------

## confidence_score

Knowledge reliability.

Example:

    0.95

Based on:

-   industry consistency
-   expert agreement
-   examples
-   performance evidence

------------------------------------------------------------------------

# 4. Knowledge Categories

## A. Strategic Knowledge

Contains:

-   positioning
-   audience insight
-   market analysis
-   campaign objectives
-   brand strategy

Example:

    Premium brands should communicate value before price.

------------------------------------------------------------------------

## B. Creative Knowledge

Contains:

-   concepts
-   storytelling
-   visual metaphors
-   emotional triggers

Example:

    Coffee is not only a beverage.
    It can represent identity and daily ritual.

------------------------------------------------------------------------

## C. Design Knowledge

Contains:

-   layout
-   typography
-   color
-   hierarchy
-   composition

------------------------------------------------------------------------

## D. Production Knowledge

Contains:

-   camera
-   lighting
-   materials
-   rendering
-   export requirements

------------------------------------------------------------------------

## E. Critic Knowledge

Contains:

-   quality standards
-   failure detection
-   improvement rules

------------------------------------------------------------------------

# 5. Decision Rule Database

This is the most important database type.

Structure:

``` yaml
rule:

when:

context:

choose:

avoid:

why:

impact:
```

Example:

``` yaml
rule:
  premium_product_layout

when:
  luxury skincare campaign

context:
  audience: mature women
  objective: brand awareness

choose:
  - minimal composition
  - editorial spacing

avoid:
  - crowded promotional elements

why:
  Premium perception requires visual confidence.

impact:
  Increase trust and perceived value.
```

------------------------------------------------------------------------

# 6. Anti-Pattern Database

CIOS must know what fails.

Structure:

``` yaml
anti_pattern:

name:

common_usage:

problem:

why_it_fails:

replacement:
```

Example:

``` yaml
name:
Generic beauty product shot

problem:
Looks identical to competitors.

why_it_fails:
No emotional differentiation.

replacement:
Identity-based storytelling.
```

------------------------------------------------------------------------

# 7. Creative Example Database

Examples are not image storage.

They are intelligence extraction.

Structure:

``` yaml
example:

brand:

campaign:

industry:

objective:

creative_problem:

creative_solution:

why_successful:

transferable_rule:

limitations:
```

------------------------------------------------------------------------

# 8. Relationship Graph

Knowledge must connect.

Example:

    Luxury Skincare

    ↓

    Women 35-50 Psychology

    ↓

    Identity Preservation Insight

    ↓

    Editorial Portrait Concept

    ↓

    Negative Space Layout

    ↓

    Soft Lighting

    ↓

    Premium Typography

Metadata:

``` yaml
related:

- audience.identity_preservation
- layout.editorial_luxury
- lighting.soft_diffusion
```

------------------------------------------------------------------------

# 9. Retrieval Logic

Retrieval should not depend only on keywords.

The system must analyze:

    Industry

    Audience

    Objective

    Channel

    Asset Type

    Brand Position

    Creative Direction

    Production Requirement

Example:

Input:

    Create Instagram ad for premium coffee shop

Retrieval:

Load:

-   Food category
-   Local business
-   Social advertising
-   Premium positioning
-   Audience psychology

Ignore:

-   Automotive
-   Enterprise software

------------------------------------------------------------------------

# 10. Knowledge Conflict Resolution

Real creative decisions involve conflicts.

Example:

Brand:

Luxury

Campaign:

50% discount sale

Conflict:

Luxury restraint

vs

Promotional urgency

The system must evaluate:

    Primary objective

    Brand damage risk

    Audience expectation

    Commercial necessity

Then choose the best compromise.

------------------------------------------------------------------------

# 11. Knowledge Scoring System

Every output knowledge decision should consider:

## Strategic Fit

Does it solve the business problem?

## Audience Fit

Does it match human motivation?

## Creative Strength

Is it memorable?

## Differentiation

Is it unique?

## Production Feasibility

Can it be executed?

## Brand Consistency

Does it protect brand perception?

------------------------------------------------------------------------

# 12. Knowledge Growth System

The database should continuously improve.

Future feedback:

    Generated Output

    ↓

    Human Evaluation

    ↓

    Performance Data

    ↓

    Knowledge Update

    ↓

    Better Decisions

------------------------------------------------------------------------

# 13. Recommended Database Structure

    CIOS_KNOWLEDGE/

    strategy/

    audience/

    category/

    concept/

    visual_direction/

    layout/

    typography/

    color/

    photography/

    material/

    channel/

    production/

    critic/

    examples/

------------------------------------------------------------------------

# 14. Quality Control Before Adding Knowledge

Every knowledge block must pass:

## Context Test

Does it explain when to use?

## Decision Test

Does it recommend action?

## Reason Test

Does it explain why?

## Limitation Test

Does it explain when not to use?

## Transfer Test

Can it apply to new situations?

------------------------------------------------------------------------

# Final Principle

The value of CIOS is not the amount of stored information.

The value is the quality of decisions generated from that information.

A Level 9 Creative Intelligence System is built from:

    Structured Knowledge

    +

    Reasoning Rules

    +

    Creative Judgment

    +

    Continuous Learning

The database is the foundation that allows CIOS to behave like an
experienced creative team.
