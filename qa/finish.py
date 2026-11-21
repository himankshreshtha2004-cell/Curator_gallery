import asyncio
from playwright.async_api import async_playwright
OUT = '/home/claude/curator/qa/'
fails = 0
def ok(c, m):
    global fails; print(('PASS ' if c else 'FAIL ') + m, flush=True); fails += 0 if c else 1
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width": 1280, "height": 800}); errs = []
        pg.on("pageerror", lambda e: errs.append("PAGE " + str(e)))
        S = lambda js: pg.evaluate(js); st = "window.__curator.getState()"
        await pg.goto('http://127.0.0.1:5181/'); await pg.wait_for_function("document.querySelector('.loading') === null", timeout=120000)
        await S(st + ".enterGallery(1)"); await pg.wait_for_timeout(3000)
        shot = False
        for _ in range(120):
            if await S(st + ".progress.complete"): break
            did = await S(st + ".debugSolveNext()")
            n = await S(st + ".progress.filled.filter(Boolean).length")
            if n == 3 and not shot:
                await pg.wait_for_timeout(1200); await pg.screenshot(path=OUT + "10_composition_complete.png"); shot = True
            await pg.wait_for_timeout(300 if did else 1200)
        ok(await S(st + ".progress.filled.filter(Boolean).length") == 15, "15 / 15 alignments")
        ok(await S(st + ".progress.complete") is True, "all 15 alignments complete the gallery")
        await pg.wait_for_timeout(2000); await pg.screenshot(path=OUT + "11_reveal.png")
        for _ in range(40):
            if await S(st + ".doorOpen"): break
            await pg.wait_for_timeout(500)
        ok(await S(st + ".doorOpen") is True, "completion opens the hidden doorway")
        await pg.wait_for_timeout(5000); await pg.screenshot(path=OUT + "12_door_open.png")
        for _ in range(60):
            if await pg.locator(".next").count(): break
            await pg.wait_for_timeout(500)
        await pg.wait_for_timeout(1000); await pg.screenshot(path=OUT + "13_next_gallery.png")
        ok(await pg.locator(".next").count() == 1, "camera passes through the doorway to the Gallery 02 card")
        ok(2 in await S(st + ".save.unlocked"), "Gallery 02 is unlocked (saved)")
        await S(st + ".go('atlas')"); await pg.wait_for_timeout(2000)
        await pg.screenshot(path=OUT + "14_atlas.png")
        ok(await pg.get_by_text("in preparation").count() >= 1, "atlas shows Gallery 02 unlocked / in preparation")
        ok(not errs, "no page errors " + " | ".join(errs[:3]))
        await b.close()
    print("FAILS", fails)
asyncio.run(main())
