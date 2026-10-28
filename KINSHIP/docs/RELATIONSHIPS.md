# Relationships

A relationship is a record, not a guess.

## Direction

| Kind | Meaning |
| --- | --- |
| `parent_child` | `fromPersonId` is the parent. `toPersonId` is the child. |
| `partnership` | The two people, in either stored order. |
| `sibling` | An explicit sibling claim, used when parents are missing or disputed. |
| `custom` | A label the researcher writes. |

Parentage is biological, adoptive, step, foster, guardian, unknown, or custom. Partnerships are spouse, former spouse, unmarried partner, former partner, unknown, or custom. None of these labels is derived from gender.

## What is not inferred

- Marriage does not create a parent.
- Living in the same house is not recorded, and it does not create a sibling.
- A step-parent link is not a biological parent.
- Calculated siblings are labelled calculated. They are not written back as facts.

Calculated sibling rules:

- Two or more shared biological parents: full sibling.
- Exactly one shared biological parent, and each person has a different other biological parent: half-sibling.
- Exactly one shared biological parent, and the other parent is missing on either side: unspecified. It might be full or half.
- A shared adoptive, foster, or guardian parent, and no biological overlap: sibling through care.
- No shared parent, but a parent of one is a partner of a parent of the other: step-sibling.

## Validation

These are refused and not saved:

- a person related to themselves
- a relationship whose person does not exist
- an exact duplicate of a claim that is already stored
- a custom relationship with no description

These are saved and shown as warnings:

- a parent cycle
- two different parentage claims between the same people
- a death date that falls before the birth date
- a child whose dates fall before the parent's dates

Warnings use year spans. An approximate year is treated as five years either side **only for the comparison**. That window is not written back onto the date.

Possible duplicates are people with the same folded name and birth years that can still refer to one life. The review action is "Keep both". It hides the prompt. It does not merge and it does not delete.

## Tree

Generation numbers come from parent links. A person with no parents is pulled down to a partner's generation so spouses can share a row. People who already have parents keep the generation those parents imply.

The traditional tree draws each person once. Parent links are orthogonal. Partnerships are a separate stroke. Collapse hides descendants through parent links. The outline is the keyboard path through the same people. SVG export draws the current layout. It is not a print-designed chart.

A focus mode can limit generations above and below one person. Partners of people in that window are included so a spouse does not disappear.
