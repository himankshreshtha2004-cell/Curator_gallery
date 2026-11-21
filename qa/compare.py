import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/curator/qa/game_refview.png'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1280, "height": 800})
        await pg.goto('http://127.0.0.1:5181/?clean'); await pg.wait_for_function("document.querySelector('.loading') === null", timeout=120000)
        await pg.evaluate("window.__curator.getState().setSettings({ reducedMotion: true })")
        await pg.wait_for_timeout(6000)
        await pg.screenshot(path=OUT)
        await b.close()
asyncio.run(main())
