# SuperView pitch deck

Standalone HTML presentation using the NodeRails deck visual system, with a judge-first SuperView narrative: problem → solution → product flow → features → product proof → market → team.

## Run

```bash
cd ppt
node dev-server.js
```

Open `http://127.0.0.1:4173` or `http://127.0.0.1:3000`.

- Arrow keys, Space, Page Up, and Page Down navigate.
- `F` toggles fullscreen.
- `PDF` exports a 16:9 PDF; the export libraries load from cdnjs.

## Story order

1. Hook — write a belief, get a portfolio, beat the S&P
2. Problem — ideas never become testable books
3. Solution — before / after
4. Flow — six steps from sentence to paper invest
5. Product screens — compose, feed, vs S&P, paper book
6. Market, competition, team, close

## Files

- `index.html` — SuperView narrative and product screens
- `slides.css` — presentation system + SuperView flow/compare styles
- `slides.js` — navigation, particles, fullscreen
- `dev-server.js` — live-reload local server
- `ss-compose.png`, `ss-feed.png`, `ss-take.png`, `ss-portfolio.png` — live SuperView screenshots
