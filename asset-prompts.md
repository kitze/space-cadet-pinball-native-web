# Imagegen Layer Prompts

The important trick is asking for registered layers, not one baked table image.

## Underlay

```text
Use case: game asset
Asset type: registered pinball table UNDERLAY layer for a browser canvas renderer
Primary request: Create the bottom/base layer of a high-quality original 1990s sci-fi pinball table, designed to be layered with separate transparent foreground occluders. Use the existing generated sci-fi pinball table direction from this project as style and layout inspiration, but do not copy any logos, brand names, exact text, or copyrighted artwork.
Layer role: UNDERLAY ONLY. This layer is everything the ball should pass over: the painted playfield bed, printed starfield art, flat decals, recessed inserts, flat lane markings, recessed holes/sockets, dark table bed, side-wall shadows that are below the ball, and empty sockets where raised parts will sit.
Remove/exclude from this layer: no raised bumper caps, no metal rails above the ball, no wire ramps, no plastic ramps, no bridge pieces, no vertical posts, no screws that should cover the ball, no lane gates above the ball, no flippers, no ball, no score UI, no text.
Scene/backdrop: full portrait pinball table only, black outside-table margins are allowed.
Style/medium: polished raster game art, high-resolution painted arcade asset, crisp 1990s sci-fi pinball look, not vector, not SVG, not flat UI.
Composition/framing: full table centered, same straight-on slight-perspective camera for every layer, 9:16 portrait, complete table visible, no cropping, preserve exact layer registration: all future foreground assets must align on top of this image.
Lighting/mood: glossy dark cosmic arcade, but shadows for excluded foreground objects should not remain baked into the underlay.
Color palette: deep navy, violet, steel gray, red trim, yellow/cyan/orange insert lights.
Text (verbatim): no text.
Constraints: clean layer asset, no watermark, no logo, no readable text, no flippers, no ball, no UI panel. This must be suitable as the base canvas background under the ball.
```

## Foreground Occluders

```text
Use case: game asset
Asset type: registered pinball table FOREGROUND OCCLUSION layer source for browser canvas
Primary request: Create only the raised foreground/overhead parts for the same sci-fi pinball table underlay just generated: bumper caps, plastic ramp covers, wireform rails, metal bridge rails, lane guides, rollover gates, posts, screws, rubber rings, upper orbit rail caps, right-side launch-lane cover pieces, and any raised decorative plastics that the ball should pass underneath or be partially hidden by.
Layer role: OCCLUSION ONLY. This layer sits above the ball in the renderer. It must contain only elements that visually occlude the ball, with empty space everywhere else.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal.
Registration: use the exact same full-table camera, scale, perspective, framing, and layout as the underlay image. Every foreground object must align precisely over its socket/empty position on the underlay. Do not change the table outline or object positions.
Style/medium: polished raster game art, high-resolution painted arcade asset, crisp antialiased edges, glossy 1990s sci-fi pinball plastics and metal, not vector, not SVG.
Composition/framing: full 9:16 portrait canvas matching the underlay frame, complete table visible, no cropping, no UI. Most of the image should be flat #00ff00 empty space except the raised foreground pieces.
Lighting/mood: same dark glossy arcade lighting as underlay, small highlights on metal/plastic, no cast shadows on the green background.
Color palette: steel gray rails, red trim, white/red/blue bumper caps, yellow lamps, translucent purple plastics, cyan highlights.
Text (verbatim): no text.
Constraints: background must be one uniform #00ff00 with no shadows, gradients, texture, reflections, floor plane, or lighting variation. Do not use #00ff00 in any foreground object. No ball, no flippers, no score UI, no watermark, no logos, no readable text. Do not include the painted table bed.
```

## Foreground Occluders Fix

The previous foreground render drifted and included too much whole-table geometry. Use this stricter follow-up prompt when regenerating:

```text
Create a registered TRANSPARENT PNG foreground occlusion layer for the exact same pinball table underlay reference. The output must be sparse: only small raised objects that must visibly pass above the ball. Include only wire rails, thin metal bridge strips, vertical posts, screw heads, upper lane guide caps, narrow plastics that physically cross over the ball path, and bumper cap rims. Do not include the playfield bed, table outline, side cabinet, starfield art, large ramps, flippers, ball, holes, decals, printed lanes, shadows, or any full-table redraw.

Registration requirement: same canvas size, same crop, same camera, same table position, same object coordinates as the underlay. Do not reinterpret the table. Leave all non-occluding pixels fully transparent. If transparency is unavailable, use pure #00ff00 only for empty pixels, with no anti-aliased green halos.

The result should look almost empty when viewed alone: isolated rails/posts/plastic caps floating in their exact positions, not a second copy of the table.
```
