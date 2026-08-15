# i-saw-u

i-saw-u is a Next.js web app for exploring concert and event photos by matching their EXIF metadata to show history from dedicated artist APIs and fallback setlist sources. Upload a photo, inspect its capture date and GPS details, and see whether it lines up with a known show.

## What it does

- Upload an image and preview it in the browser
- Extract EXIF metadata such as capture date, latitude, and longitude
- Match the photo date to a show from multi-provider setlist sources (Phish.net, KGLW.net, ElGoose, Relisten, Setlist.fm fallback)
- Display related show information, links, and metadata when available
- Let signed-in users save photos and matches to a personal library

## Future development
- create "Show" mode which allows user to open camera in app, load show info, start time, and app will add song info as photos are taken. 

## Tech stack

- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Supabase Auth and Storage
- EXIF parsing via exifreader
- PWA support via @ducanh2912/next-pwa

## Project structure

- app/ — routes, pages, and server actions
- components/ — UI components for photo upload, matching, and library features
- lib/ — shared helpers and integrations
- public/ — static assets and service worker files
- tests/ — regression tests for calibration logic

## Getting started

### Prerequisites

- Node.js 22 or newer
- npm
- A Supabase project with the required environment variables

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com
   cd i-saw-u
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a local environment file:
   ```bash
   cp .env.example .env.local
   ```

4. Add your Supabase configuration values to .env.local:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   PHISHNET_API_KEY=your-phishnet-api-key
   SETLISTFM_API_KEY=your-setlistfm-api-key
   RELISTEN_API_BASE_URL=https://relisten.net
   ```

   KGLW.net lookups use the public API and do not require an API key.

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open http://localhost:3000 in your browser.

## Available scripts

- npm run dev — start the development server
- npm run build — build the application for production
- npm run start — start the production server
- npm run test:calibration — run the calibration test suite

## Notes

- The app uses server-side EXIF extraction and show matching logic.
- Some features depend on Supabase authentication and storage being configured.
- KGLW.net v2 setlist lookups are public and do not require an API key.
- If you plan to contribute, please keep changes focused and document any new environment variables.

## License

This project is licensed under a **Business Source License (BSL)**. 

### Quick Summary
* **Personal & Educational Use**: 100% Free. You can fork this repo, run it locally, and use it for your personal photo libraries.
* **Commercial Use**: Prohibited. You may not host this as a paid service, use it for commercial events, or integrate it into a commercial product without a separate license.
* **Open Source Transition**: On **August 15, 2029**, this project will automatically and permanently convert to the standard open-source **MIT License**.

For commercial licensing requests or inquiries, please contact the repository owner. See the full [LICENSE](LICENSE.md) file for exact legal terms.
