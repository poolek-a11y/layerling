# Mandala lessons and shape library

Two guided lessons in the editor (like Kokeshi Maker), sharing one library of **mandala shape
builders** and each student's own **motif library**:

- **Traditional Mandala**: a round mandala in five layers.
- **Mandala Cross**: a cross decorated mandala-style, in five layers.

Both are built from lines (strokes), not solid shapes. Each layer above the bottom one is an
**offset layer**: the same lines set in a little, so each new line rests half on the line below
and the lower layer still shows beside it. A closed back (a solid bottom layer) is an option, not
the default.

## For the teacher

On the LayerLab page, open your class, add a tutorial, and choose **Traditional Mandala** or
**Mandala Cross** as its guided lesson. Students then see **Start the guided lesson** on it. The
lesson's **Shape builders and my motifs** button opens the library.

## The five layers

| Layer | Traditional Mandala | Mandala Cross |
| --- | --- | --- |
| 1 | Scalloped outline + ring of petals + centre circle, all level and touching | Cross outline (round or pointed ends, optional longer bottom arm) + a petal along each arm + circle at the crossing |
| 2 | Offset layer of all of layer 1 | same |
| 3 | Offset layer, outermost outline left out (a step smaller) | same |
| 4 | One more offset layer | same |
| 5 | Centre: star or centre circle on top (solid allowed here) | same |

Then: draw your own motif (sketch + stroke + Pattern → Circle), save to My motifs, check and print.

## The shape builders

Each builder makes one whole shape or ring as a single sketch body drawn with a stroke
(Line width 0 builds it solid). **On top** puts it on top of the selection, centred; **Same layer**
puts it level with the selection.

Scalloped base, Cross (round ends), Cross (pointed ends), Lotus petals, Teardrops, Leaves,
Criss-cross circles, Criss-cross petals, Star, Diamonds, Spikes, Dots, Rays, Ring, Centre circle.

**Offset layer** builds the next layer from the selected one: its lines set in by *Set in by*
(keep it under the line width, about half, or the line prints in the air) and drawn with *Line
width*; *Leave out the outermost outline* makes the layer a step smaller.

A ring stays an ordinary sketch: **Edit sketch** changes its points or its stroke later.

## My motifs (the student's library)

**My motifs → Save the selection** keeps the selected bodies in the *Mandala motifs* folder of
My shapes. For a student signed in to LayerLab that folder is in their own server folder, so the
library follows them to every design and grows as they get more experienced.

Code: `apps/web/src/lib/lessons/mandala*.ts`, `apps/web/src/components/lessons/MotifLibrary.tsx`,
`apps/web/src/components/lessons/useLessonLibrary.ts`.
