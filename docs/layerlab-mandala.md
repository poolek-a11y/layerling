# Layered Mandala lesson and shape library

A guided lesson in the editor (like Kokeshi Maker) for building a layered mandala, with a library of
**mandala shape builders** and each student's own **motif library**.

## For the teacher

1. On the LayerLab page, open your class, add a tutorial, and choose **Layered Mandala** as its
   guided lesson. Students then see **Start the guided lesson** on that tutorial.
2. The lesson opens on the left of the editor. Its **Shape builders and my motifs** button opens the
   library.

## The shape builders

Each builder makes one whole ring as a single sketch body: the motif repeated round the middle.
The ring goes **on top of what is selected, centred on it** (or on the middle of the plate when
nothing is selected), so students stack a mandala by selecting the layer below and adding the next.

| Builder | What it makes |
| --- | --- |
| Scalloped base | Round base with a wavy edge |
| Lotus petals, Teardrops, Leaves | Petal rings |
| Criss-cross circles, Criss-cross petals | Overlapping outlines that cross into a lattice (always stroked) |
| Star, Diamonds, Spikes, Dots, Rays | Detail rings |
| Ring | A circle drawn as a line, for a frame |
| Centre button | Round button for the middle |

Settings: copies around, distance from the middle, length, width, **line width** (the sketch tool's
stroke; 0 fills the motif), thickness and turn ("Turn half a step" puts motifs between the ones
below). A ring is an ordinary sketch: **Edit sketch** changes its points or its stroke later.

## My motifs (the student's library)

**My motifs → Save the selection** keeps the selected bodies in the *Mandala motifs* folder of
My shapes. For a student signed in to LayerLab that folder is in their own server folder, so the
library follows them to every design and computer and grows as they get more experienced. A click
on a saved motif puts it into the open design.

## Lesson sections

A five-layer build: Welcome, Layer 1 Base, Layer 2 Petals (lotus / teardrop / leaf, then outline
vs. filled with the stroke), Layer 3 Criss-cross, Layer 4 Details, Layer 5 Centre, Your own motif (optional: draw with the sketch tool and a
stroke, repeat with Pattern → Circle), Your motif library, Check and print, Freestyle.

Code: `apps/web/src/lib/lessons/mandala*.ts`, `apps/web/src/components/lessons/MotifLibrary.tsx`,
`apps/web/src/components/lessons/useLessonLibrary.ts`.
