# TIDO_LAYER1_MASTER_ARCHITECTURE_V1.md

# TIDO CREATIVE OS --- LAYER 1 MASTER ARCHITECTURE V1.0

## Product Vision

TIDO Layer 1 is not a SaaS management system.

TIDO Layer 1 is:

**AI MARKETING PRODUCTION FACTORY**

Goal:

A user provides: - Creative idea / concept - Product references -
Character references - Brand assets - Voice references

The system produces:

-   Marketing voice assets
-   Commercial images
-   AI generated videos
-   Complete edited marketing content

Layer 2 and Layer 3 will later add: - Advanced Marketing Intelligence -
Agency workflow - Collaboration - Billing - Enterprise features

Layer 1 priority:

Create a production system that can be sold and used in real marketing
production.

------------------------------------------------------------------------

# 1. LAYER 1 SYSTEM OVERVIEW

    USER

    ↓

    TIDO CREATIVE OS LAYER 1

    ↓

    --------------------------------

    VOICE ENGINE

    PICTURE ENGINE

    VIDEO ENGINE

    COMPOSER ENGINE

    --------------------------------

    ↓

    FINAL MARKETING ASSET

    ↓

    Download:
    MP3 / WAV / IMAGE / VIDEO

------------------------------------------------------------------------

# 2. CORE FOUNDATION LAYER

The foundation layer supports all production modules.

It is not Campaign Management. It is not SaaS.

It only exists to manage production workflows.

## 2.1 Generation Project

A Generation Project represents one user creation task.

Examples:

-   Create voice narration
-   Create commercial poster
-   Create advertising video

Schema:

    GenerationProject

    id

    type:
    - voice
    - image
    - video

    input

    status

    created_at

    output

------------------------------------------------------------------------

# 2.2 Scene Object

Scene is the core object of Video Engine.

A complete video is composed of multiple 8-second scenes.

Example:

    Video 40 seconds

    Scene 1 (8s)

    Scene 2 (8s)

    Scene 3 (8s)

    Scene 4 (8s)

    Scene 5 (8s)

Scene Schema:

``` json
{
 "scene_id":"",
 "duration":8,
 "purpose":"",
 "visual_direction":{},
 "voice_direction":{},
 "motion_direction":{},
 "reference_assets":[],
 "status":"pending"
}
```

------------------------------------------------------------------------

# 2.3 Asset System

Everything generated or uploaded is an Asset.

## Input Assets

-   Character images
-   Product images
-   Logo
-   Brand references
-   Voice clone samples

## Generated Assets

-   Images
-   Voice files
-   Scene videos
-   Final videos

------------------------------------------------------------------------

# 3. VOICE ENGINE

## Objective

A standalone AI voice production module.

Input:

-   Script text
-   Voice style
-   Emotion
-   Voice clone reference

Output:

-   MP3
-   WAV

## Pipeline

    Voice Request

    ↓

    Voice Direction Analyzer

    ↓

    Voice Performance Controller

    ↓

    F5-TTS Core

    ↓

    Humanization Layer

    ↓

    Audio QC

    ↓

    Output Audio

## Input Example

``` json
{
"text":"",
"voice_id":"",
"emotion":"warm",
"style":"storytelling",
"speed":1.0
}
```

## Output

``` json
{
"audio_url":"",
"format":"wav",
"duration":""
}
```

------------------------------------------------------------------------

# 4. PICTURE ENGINE V1

## Objective

Commercial Image Production Engine.

Not simply:

"generate image"

But:

"generate marketing visual"

## Supported Output

Advertising: - Poster - Banner - Social Ads - Thumbnail

Product: - Product Hero - Lifestyle Image - Packaging Creative

Creative: - Fashion - Food - Real Estate - Beauty

## Architecture

    User Concept

    +

    Reference Assets

    +

    Output Ratio


    ↓

    Visual Intelligence Layer


    ↓

    Prompt Compiler


    ↓

    Image Provider Router


    ↓

    Image Provider


    ↓

    Generated Image

Providers:

-   Gemini Image
-   Nano Banana
-   Future Providers

## Visual Intelligence

Analyzes:

-   Industry
-   Audience
-   Purpose
-   Emotion
-   Composition
-   Lighting
-   Camera
-   Style

## Prompt Compiler

The system must not send simple prompts.

Example:

Wrong:

"make poster tea"

Correct:

"Commercial tea advertisement.

Audience: health conscious customers.

Visual emotion: trust, natural wellness.

Camera: 85mm commercial photography.

Lighting: warm morning sunlight.

Composition: hero product foreground..."


    ---

    # 5. VIDEO ENGINE

    Video Engine is the core production system of Layer 1.

    ## Complete Pipeline

USER INPUT

Reference Assets

-   

Concept

-   

Duration

-   

Ratio

↓

Marketing Intelligence

↓

Master Prompt Builder

↓

LLM Script Generator

↓

Script Review

↓

Scene Generator

↓

Reference Image Generator

↓

Video Generator

↓

Scene Approval

↓

AI Composer

↓

Final Video


    ---

    # STEP A — Concept Understanding

    Input:

    - Product
    - Audience
    - Marketing Goal
    - Duration
    - Format

    Formats:

    - 16:9
    - 9:16

    ---

    # STEP B — Marketing Brain

    Knowledge applied:

    - AIDA
    - PAS
    - BAB
    - Storytelling
    - Consumer Psychology
    - Hook Library
    - CTA Library
    - Video Advertising Framework
    - Camera Language
    - Film Grammar

    Output:

    Creative Direction

    ---

    # STEP C — LLM Script Generation

    LLM receives:

    - Master Prompt
    - Marketing Context
    - Reference Information

    Output:

    Scene-based script.

    Each scene:

    Exactly 8 seconds.

    Example:

SCENE 1

Duration: 8 seconds

Purpose: HOOK

Visual:

Camera:

Voice:

SFX:


    ---

    # STEP D — Script Approval

    User actions:

    - Edit
    - Regenerate
    - Approve

    ---

    # STEP E — Scene Reference Image Generation

    Each scene generates a first-frame reference image.

    Requirements:

    Character consistency:
    - Face
    - Hair
    - Clothing

    Product consistency:
    - Logo
    - Shape
    - Color

    Environment:
    - Location
    - Lighting

    ---

    # STEP F — Reference Approval

    For each scene:

    Accept

    or

    Regenerate

    Only regenerate the rejected scene.

    ---

    # STEP G — Video Generation

    Input:

    - Reference image
    - Motion prompt
    - Duration
    - Camera movement
    - Audio direction

    Providers:

    - Veo 3
    - Kling
    - Runway
    - Seedance

    Output:

scene_001.mp4 scene_002.mp4 scene_003.mp4


    ---

    # STEP H — Video Approval

    User:

    Accept

    or

    Regenerate Scene

    ---

    # 6. COMPOSER ENGINE

    Composer is an AI editor.

    It does not only concatenate files.

    Input:

    - Scene videos
    - Voice
    - Music
    - SFX
    - Subtitle
    - Logo


    AI editing decisions:

    ## Editing

    - Cut timing
    - Transition
    - Pacing

    ## Audio

    - Voice sync
    - Music volume
    - SFX

    ## Visual

    - Color consistency
    - Subtitle style


    Output:

Final_Marketing_Video.mp4


    ---

    # 7. INTERNAL SERVICE ARCHITECTURE

TIDO CORE

↓

API GATEWAY

↓

------------------------------------------------------------------------

Voice Service

Picture Service

Video Service

Composer Service

------------------------------------------------------------------------

↓

AI Worker Queue

↓

------------------------------------------------------------------------

F5-TTS

Image Models

Video Models

FFmpeg

Remotion

  ----------------------
  \`\`\`

  ----------------------

# 8. MINIMUM DATABASE LAYER

Layer 1 does not require SaaS database.

Only production data:

    projects

    generation_jobs

    scenes

    assets

    renders

    voice_profiles

    reference_assets

------------------------------------------------------------------------

# 9. DEVELOPMENT ROADMAP

## PHASE 1

Core Foundation

Build:

-   Generation Job
-   Scene Object
-   Asset Object
-   Render Object

## PHASE 2

Picture Engine Real

Goal:

Real image generation.

## PHASE 3

Voice Engine Product

Goal:

MP3/WAV production.

## PHASE 4

Video Brain

Goal:

Concept → Marketing Script → 8 second Scenes.

## PHASE 5

Reference Image Pipeline

Goal:

Scene → First Frame.

## PHASE 6

Video Generation Pipeline

Goal:

Reference → Video.

## PHASE 7

Approval Workflow

Goal:

User approval at every important stage.

## PHASE 8

AI Composer

Goal:

Scene videos → Final Marketing Video.

## PHASE 9 (Future)

SaaS Layer:

-   User
-   Workspace
-   Billing
-   Team
-   Client Portal

------------------------------------------------------------------------

# FINAL PRINCIPLE

TIDO Layer 1 is not an AI image/video tool.

It is:

**An AI Marketing Content Production Factory.**

The first objective is:

A user enters an idea.

TIDO produces professional marketing assets.

Only after Layer 1 works perfectly should higher layers be developed.
