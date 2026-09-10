# REASONING KNOWLEDGE STANDARD V2

## CIOS LEVEL 9 --- Creative Intelligence Operating System

## Purpose

This document defines the standard for creating, structuring, evaluating
and maintaining reasoning knowledge inside CIOS Level 9.

The objective is not to store information.

The objective is to convert expert creative knowledge into
machine-usable decision intelligence.

Core transformation:

    Information

    ↓

    Contextual Knowledge

    ↓

    Creative Reasoning

    ↓

    Decision

    ↓

    Execution

A normal knowledge base answers:

"What is this?"

A Creative Intelligence System must answer:

"When should this be used, why should this be used, and what happens if
it is not used correctly?"

------------------------------------------------------------------------

# 1. Philosophy

## Knowledge is not Intelligence

A system can contain thousands of design rules and still produce average
results.

The difference between a database and a Creative Director is
decision-making.

Example:

Basic knowledge:

    Luxury brands often use minimal design.

Reasoning knowledge:

``` yaml
context:

industry:
beauty

brand_position:
luxury

objective:
premium perception

audience:
high-value consumers


decision:

use:
- controlled negative space
- refined typography
- restrained visual elements


reason:

Premium brands communicate confidence through restraint.


avoid:

- crowded promotional layouts
- excessive decorative elements


trade_off:

Lower information density but stronger perceived value.
```

------------------------------------------------------------------------

# 2. Purpose of Reasoning Knowledge

Every reasoning knowledge unit must help the system perform one or more
actions:

-   Understand a creative problem
-   Identify audience motivation
-   Select a strategic direction
-   Choose a visual direction
-   Select design decisions
-   Avoid weak patterns
-   Evaluate creative quality

------------------------------------------------------------------------

# 3. Core Knowledge Object Schema

Every knowledge object must follow this structure:

``` yaml
knowledge_id:

name:

domain:

sub_domain:

knowledge_type:

creative_stage:

context:

problem:

human_insight:

decision:

reasoning:

why_this_works:

use_when:

avoid_when:

trade_off:

alternatives:

anti_patterns:

examples:

impact:

priority:

confidence:

related_knowledge:

source:
```

------------------------------------------------------------------------

# 4. Field Definitions

## knowledge_id

Unique identifier.

Example:

    beauty.luxury.negative_space.hero_001

Purpose:

Enable retrieval, relationship mapping and future expansion.

------------------------------------------------------------------------

## domain

Main intelligence category.

Examples:

    strategy
    audience
    concept
    layout
    typography
    photography
    color
    production
    critic

------------------------------------------------------------------------

## sub_domain

Specific expertise area.

Example:

    layout

    sub_domain:

    luxury_product_hero

------------------------------------------------------------------------

## knowledge_type

Allowed values:

    principle

    decision_rule

    framework

    pattern

    anti_pattern

    example

    evaluation_rule

    production_rule

------------------------------------------------------------------------

## creative_stage

Where this knowledge applies:

    strategy

    concept

    visual_direction

    design

    production

    evaluation

------------------------------------------------------------------------

# 5. Context Definition Standard

Knowledge must never exist without context.

Every reasoning object should define:

``` yaml
industry:

category:

audience:

objective:

channel:

asset_type:

brand_position:
```

Example:

The same layout decision can be correct for:

Luxury brand awareness

but incorrect for:

Urgent discount promotion.

------------------------------------------------------------------------

# 6. Decision Rule Standard

Decision rules are the core intelligence units.

Structure:

``` yaml
situation:

problem:

decision:

reason:

expected_effect:
```

Example:

``` yaml
situation:

Premium skincare campaign for women 35-50


problem:

Need stronger emotional connection


decision:

Use identity-based storytelling instead of product-only presentation.


reason:

The audience is motivated by confidence and self-image, not only product performance.


expected_effect:

Higher emotional relevance.
```

------------------------------------------------------------------------

# 7. Human Insight Layer

Professional creative decisions start from human understanding.

Every strategic knowledge block should consider:

## Functional Need

What problem does the customer solve?

## Emotional Need

How does the customer want to feel?

## Social Need

How does the customer want to be perceived?

Example:

Product:

Anti-aging serum

Functional:

Improve skin appearance

Emotional:

Maintain confidence

Social:

Feel attractive and respected

------------------------------------------------------------------------

# 8. Anti-Pattern Standard

CIOS must understand failure.

A professional knows not only what works.

They know what has become weak, repetitive or inappropriate.

Schema:

``` yaml
anti_pattern:

name:

problem:

why_it_fails:

replacement:
```

Example:

``` yaml
name:

Generic beauty model holding serum


problem:

Overused category visual


why_it_fails:

No differentiation or emotional meaning


replacement:

Identity-based beauty storytelling
```

------------------------------------------------------------------------

# 9. Trade-Off Standard

Creative decisions are rarely absolute.

Every rule must document trade-offs.

Example:

``` yaml
decision:

Minimal luxury layout


benefit:

Higher premium perception


cost:

Less information density


recommended_when:

Brand awareness campaign


avoid_when:

Flash sale campaign requiring immediate information.
```

------------------------------------------------------------------------

# 10. Example Intelligence Standard

Examples must not be stored as simple references.

Each example must extract intelligence.

Schema:

``` yaml
example:

reference:

context:

creative_problem:

strategy:

creative_solution:

visual_solution:

why_successful:

transferable_rule:

limitations:
```

The goal:

Learn the decision.

Not copy the design.

------------------------------------------------------------------------

# 11. Knowledge Relationship System

Creative decisions are connected.

Knowledge should form relationships.

Example:

    Audience Psychology

    ↓

    Consumer Insight

    ↓

    Creative Concept

    ↓

    Visual Direction

    ↓

    Layout

    ↓

    Typography

    ↓

    Photography

Each object should include:

``` yaml
related_knowledge:
```

------------------------------------------------------------------------

# 12. Context Activation Rules

Knowledge retrieval should consider:

-   Industry
-   Product category
-   Audience
-   Objective
-   Channel
-   Asset type
-   Brand positioning
-   Creative direction

The system should not retrieve knowledge only by keyword.

------------------------------------------------------------------------

# 13. Knowledge Priority System

Not every knowledge object has equal importance.

Each object requires:

``` yaml
priority:

confidence:

impact_score:

context_relevance:
```

Example:

Luxury skincare:

    Editorial portrait strategy

    Priority: 9/10

Urgent discount banner:

    Editorial portrait strategy

    Priority: 3/10

------------------------------------------------------------------------

# 14. Conflict Resolution Standard

Creative decisions can conflict.

Example:

Brand:

Luxury

Campaign:

50% discount

Conflict:

Premium perception

vs

Sales urgency

The system should evaluate:

-   Business objective
-   Brand risk
-   Audience expectation
-   Commercial necessity

Then select the most appropriate compromise.

------------------------------------------------------------------------

# 15. Creative Evaluation Standard

Reasoning knowledge must support self-criticism.

Every output should be evaluated by:

## Strategic Fit

Does it solve the business objective?

## Audience Fit

Does it match customer motivation?

## Differentiation

Does it avoid category repetition?

## Visual Quality

Is hierarchy clear?

## Brand Consistency

Does it protect positioning?

## Commercial Value

Can it achieve the intended result?

------------------------------------------------------------------------

# 16. Knowledge Quality Checklist

Before adding any knowledge object:

## Context Test

Does it explain when it applies?

## Decision Test

Does it recommend an action?

## Reason Test

Does it explain why?

## Limitation Test

Does it explain when not to use?

## Transfer Test

Can it apply to new situations?

## Expert Test

Would a senior creative professional consider it useful?

------------------------------------------------------------------------

# 17. Knowledge Creation Workflow

New knowledge should be created through:

    Research

    ↓

    Expert Analysis

    ↓

    Context Definition

    ↓

    Decision Extraction

    ↓

    Example Validation

    ↓

    Quality Review

    ↓

    Database Integration

------------------------------------------------------------------------

# 18. Final Principle

CIOS Level 9 should not become a collection of design rules.

It should become a structured creative intelligence system.

The value is not:

"How much information is stored."

The value is:

"How accurately the system can choose the right creative decision in the
right situation."

Final architecture:

    Knowledge

    +

    Context

    +

    Reasoning

    +

    Decision Rules

    +

    Creative Evaluation

    =

    AI Creative Director Capability
