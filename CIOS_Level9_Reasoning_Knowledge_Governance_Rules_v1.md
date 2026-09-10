# CIOS Level 9 --- Reasoning Knowledge Governance Rules v1

## Purpose

This document defines the final governance rules for creating,
validating, storing, retrieving and evolving Reasoning Knowledge inside
CIOS Level 9.

Reasoning Knowledge is not a collection of design tips.

It is a structured decision intelligence layer that allows CIOS to
reason like:

-   Creative Director
-   Art Director
-   Marketing Strategist
-   Senior Designer
-   Producer

Core principle:

    Knowledge

    +

    Context

    +

    Reasoning

    +

    Decision Rules

    +

    Evaluation

    =

    Creative Intelligence

------------------------------------------------------------------------

# 1. Layer Separation Rule

CIOS contains two different knowledge layers.

## Layer 1 --- Model Knowledge

Purpose:

Support visual execution.

Contains:

-   camera
-   lighting
-   materials
-   realism
-   composition
-   rendering principles

Location:

    data/knowledge/

Characteristics:

-   neutral
-   descriptive
-   image-model friendly

------------------------------------------------------------------------

## Layer 2 --- Reasoning Knowledge

Purpose:

Support creative decisions.

Contains:

-   strategy
-   audience psychology
-   differentiation
-   concept decisions
-   layout decisions
-   visual direction reasoning
-   evaluation rules

Location:

    data/cios-knowledge/

Characteristics:

-   contextual
-   prescriptive
-   decision-oriented

Rule:

Layer 2 must never directly enter the image generation prompt.

Only the final creative decision enters through existing art direction
flow.

------------------------------------------------------------------------

# 2. Official Knowledge Object Schema

Every Reasoning Knowledge object must contain:

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

impact_score:

priority:

confidence:

context_relevance:

related_knowledge:

source:
```

------------------------------------------------------------------------

# 3. Field Rules

## knowledge_id

Format:

    domain.sub_domain.topic.number

Example:

    beauty.identity_preservation.confidence_storytelling.001

Must be:

-   unique
-   permanent
-   never reused

------------------------------------------------------------------------

# 4. Context Standard

Context is mandatory.

Every object must define:

``` yaml
industry:

category:

audience:

objective:

channel:

asset_type:

brand_position:
```

Reason:

Creative decisions are always situational.

The same rule can be correct in one situation and wrong in another.

------------------------------------------------------------------------

# 5. Knowledge Type Standard

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

# 6. Creative Stage Standard

Allowed values:

    strategy

    concept

    visual_direction

    design

    production

    evaluation

Each knowledge object must belong to at least one stage.

------------------------------------------------------------------------

# 7. Decision Intelligence Requirement

Every object must answer:

## Situation

What situation does this apply to?

## Problem

What creative or business problem exists?

## Decision

What should the system choose?

## Reasoning

Why is this decision correct?

## Expected Impact

What result should happen?

------------------------------------------------------------------------

# 8. Human Insight Requirement

Strategic knowledge must include:

## Functional Need

What practical problem does the customer solve?

## Emotional Need

How does the customer want to feel?

## Social Need

How does the customer want to be perceived?

Without human insight, knowledge is considered incomplete.

------------------------------------------------------------------------

# 9. Anti-Pattern Requirement

Every important knowledge object should define failure cases.

Format:

``` yaml
anti_pattern:

problem:

why_it_fails:

replacement:
```

Purpose:

Teach CIOS what not to create.

------------------------------------------------------------------------

# 10. Trade-Off Requirement

Creative decisions are never absolute.

Every rule must explain:

-   advantage
-   limitation
-   suitable conditions
-   unsuitable conditions

Example:

Minimal luxury layout:

Benefit:

Premium perception

Trade-off:

Lower information density

------------------------------------------------------------------------

# 11. Scoring System

## Priority

Importance of this knowledge.

Scale:

1-10

Example:

Core luxury positioning rule:

9-10

Rare niche technique:

3-5

------------------------------------------------------------------------

## Confidence

Reliability of the knowledge.

Scale:

0-1

Based on:

-   expert source
-   repeated successful application
-   industry validation

------------------------------------------------------------------------

## Impact Score

Expected influence on creative quality.

Scale:

1-10

------------------------------------------------------------------------

## Context Relevance

How strongly the object matches the current request.

Scale:

0-1

Used during retrieval ranking.

------------------------------------------------------------------------

# 12. Retrieval Rules

Reasoning Knowledge retrieval must use:

-   industry
-   category
-   audience
-   objective
-   channel
-   asset_type
-   brand_position
-   creative_stage

Keyword matching alone is insufficient.

------------------------------------------------------------------------

# 13. Controlled Vocabulary Rule

Critical fields should use controlled values.

Examples:

Audience:

    women_25_35
    women_35_50
    gen_z
    premium_consumers
    mass_market_consumers

Brand Position:

    luxury
    premium
    mass
    budget
    innovative
    traditional

Avoid uncontrolled descriptions.

------------------------------------------------------------------------

# 14. Knowledge Quality Gate

Before entering production:

Every object must pass:

## Context Test

Does it explain when it applies?

## Decision Test

Does it recommend an action?

## Reasoning Test

Does it explain why?

## Limitation Test

Does it explain when not to use?

## Expert Test

Would a senior creative professional find value?

## Transfer Test

Can it apply beyond one example?

------------------------------------------------------------------------

# 15. Example Extraction Rule

Examples are not copied designs.

Every example must extract:

-   problem
-   strategy
-   insight
-   creative decision
-   execution logic
-   transferable rule

Goal:

Learn the decision.

Not reproduce the output.

------------------------------------------------------------------------

# 16. Schema Conflict Resolution

Official decisions:

## authority_level

Removed.

Reason:

Knowledge reliability and campaign authority are different concepts.

Reliability:

confidence

Campaign authority:

resolver tier

------------------------------------------------------------------------

## impact vs impact_score

Both exist.

impact:

Qualitative explanation.

Example:

"Increases premium perception."

impact_score:

Numeric ranking.

Example:

9/10

------------------------------------------------------------------------

## File Format

Authoring:

YAML

Runtime:

Can be converted internally to JSON.

------------------------------------------------------------------------

# 17. Knowledge Lifecycle

Every knowledge object follows:

    Research

    ↓

    Creation

    ↓

    Validation

    ↓

    Testing

    ↓

    Production

    ↓

    Performance Review

    ↓

    Version Update

------------------------------------------------------------------------

# 18. Versioning

Knowledge changes must preserve history.

Example:

    beauty.layout.luxury_hero.001.v1

    beauty.layout.luxury_hero.001.v2

Never silently overwrite important reasoning.

------------------------------------------------------------------------

# 19. Final Governance Principle

CIOS is not optimized for storing maximum information.

It is optimized for making better creative decisions.

A successful Reasoning Knowledge object should help the system answer:

"Given this situation, this audience, this objective and this brand
position, what is the best creative decision and why?"
