# Clabstream AI Studio

Internal Clabstream tool for the team to review and operate the studio UI locally.

## Current status

- Image generation is currently paused until provider credits are added.
- The UI is still available for internal review and safe testing.

## Local use

1. Install dependencies with `npm install`
2. Start the app with `npm run dev`
3. Open `http://localhost:3000`

## Render Studio (architecture)

The **Render Studio** tab turns a screenshot of a 3D model (SketchUp, Revit,
Archicad, Blender…) into a finished render while keeping the same geometry and
camera angle.

1. Copy `.env.example` to `.env.local` and set at least one key:
   - `HUGGINGFACE_API_KEY`: free tier, using the account's monthly inference credits
     (FLUX.1 Kontext dev, falling back to Qwen Image Edit). Only a few renders a month.
   - `MUAPI_API_KEY`: paid, Nano Banana Pro Edit, 1K/2K/4K output.
2. Run `npm run dev`, open the **Render Studio** tab and upload the screenshot.
3. Pick the scene type, style, lighting and ambience, and optionally describe
   materials ("piso de porcelanato, concreto aparente…").

Tips: export the view with shadows on, without axes or grids, and with the
camera already in its final position.

On Vercel, add the same variables under Project Settings, Environment Variables.

## Safety notes

- Do not commit `.env.local`
- Do not paste secrets into prompts
- Do not paste secrets into source code
- Keep provider credentials server-side only
