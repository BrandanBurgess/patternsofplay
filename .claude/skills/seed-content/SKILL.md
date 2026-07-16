---
name: seed-content
description: Rules for transcribing the Tactical Content Bible into seed files. Load for T-010, T-011, or any content revision. Covers em-dash rewriting, validator requirements, and traceability.
---
# Seed content transcription

Authoritative rules live in doc 03 §7-§8; this is the working checklist.

## Per entry
- source_ref (bible:SECTION.CODE), all required fields (blurb, animation spec where the type has one, roles involved, coaching points, youth takeaway, age hint)
- blurb: one sentence, 25 words max, grammatical AFTER em-dash rewrite
- em dashes: rewrite editorially in the seed source file (period+new sentence, comma, colon, or parentheses). Never mechanical replace. En dashes in ranges become "to" or a hyphen.
- coaching vocabulary kept exact (half-space, pivot, rest defence, Zone 14); first use in a card body may carry a short parenthetical definition
- identity copy: framed as "how X assembled these pieces"; the words "correct", "right way", "off-identity" are banned
- archetype names editorial only ("the Busquets role"), no endorsement implications

## Animation specs
Follow doc 03 §4.1 exactly: slots with model coords, steps with captions, ball_to.bind_slot binding, trajectory from the delivery vocabulary, loop:true for rotations. Every slot referenced in steps must exist in slots (validator checks).

## Pipeline
seeds/*.yaml grouped by table, content_version at file head. Validator then seeder, both idempotent, one transaction, library tables only. Run make seed && make verify before committing.
